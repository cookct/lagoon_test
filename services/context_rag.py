"""
Context RAG Service

Chunks and embeds uploaded context files (PDFs, text, code) for a character config,
then retrieves semantically relevant chunks at query time instead of injecting
the entire file every turn.

Uses the same sentence-transformers/all-MiniLM-L6-v2 model as the conversation RAG.
Gracefully degrades to no-op if sentence-transformers is not installed.

Storage: configs/.ctx/<config_base_name>.ctx.json
"""

import os
import json
import uuid
import logging

logger = logging.getLogger(__name__)

# ── Embedding model (shares with rag.py) ──────────────────────────────────
_encoder = None
_encoder_lock = None
HAS_EMBEDDINGS = False

try:
    from sentence_transformers import SentenceTransformer
    import numpy as np
    HAS_EMBEDDINGS = True
except ImportError:
    logger.info("[ContextRAG] sentence-transformers not available — context RAG disabled")

CTX_DIR = os.path.join("configs", ".ctx")
from services import memory_settings


def _get_encoder():
    """Lazy-load the sentence-transformers encoder (shared singleton)."""
    global _encoder, _encoder_lock, HAS_EMBEDDINGS
    if not HAS_EMBEDDINGS:
        return None
    if _encoder_lock is None:
        import threading
        _encoder_lock = threading.Lock()
    with _encoder_lock:
        if _encoder is None:
            try:
                _encoder = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
                logger.info("[ContextRAG] Loaded sentence-transformers/all-MiniLM-L6-v2")
            except Exception as e:
                logger.error(f"[ContextRAG] Failed to load encoder: {e}")
                HAS_EMBEDDINGS = False
                return None
    return _encoder


def _ctx_path(config_name: str) -> str:
    """Get the .ctx.json path for a given config filename."""
    os.makedirs(CTX_DIR, exist_ok=True)
    base = config_name.replace('.json', '') if config_name.endswith('.json') else config_name
    return os.path.join(CTX_DIR, f"{base}.ctx.json")


def _load_ctx_store(config_name: str) -> dict:
    """Load the context store for a character config. Returns dict with metadata + chunks."""
    path = _ctx_path(config_name)
    if not os.path.exists(path):
        return {"source_file": "", "chunks": []}
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"[ContextRAG] Failed to load store {path}: {e}")
        return {"source_file": "", "chunks": []}


def _save_ctx_store(config_name: str, store: dict):
    """Save the context store for a character config."""
    path = _ctx_path(config_name)
    try:
        with open(path, "w") as f:
            json.dump(store, f)
    except Exception as e:
        logger.error(f"[ContextRAG] Failed to save store {path}: {e}")


def _cosine_similarity(a: list, b: list) -> float:
    if not HAS_EMBEDDINGS:
        return 0.0
    import numpy as np
    a, b = np.array(a), np.array(b)
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


def _split_into_chunks(text: str, chunk_size: int = None, overlap: int = None) -> list:
    """
    Split text into overlapping chunks of approximately chunk_size tokens.
    Uses paragraph-aware splitting:
    - Split on double newlines (paragraphs) first
    - Merge paragraphs until we approach chunk_size tokens
    - Overlap by including the last `overlap` tokens of the previous chunk
    """
    if chunk_size is None:
        chunk_size = memory_settings.get('ctx_rag_chunk_size')
    if overlap is None:
        overlap = memory_settings.get('ctx_rag_chunk_overlap')

    # Rough token estimate: 1 token ≈ 4 chars
    chunk_chars = chunk_size * 4
    overlap_chars = overlap * 4

    # Split on paragraph boundaries
    paragraphs = text.split('\n\n')
    if len(paragraphs) <= 1:
        # No paragraph breaks — split on single newlines
        paragraphs = text.split('\n')

    chunks = []
    current = ""

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        if current:
            candidate = current + "\n\n" + para
        else:
            candidate = para

        if len(candidate) > chunk_chars and current:
            # Current chunk is full, save it
            chunks.append(current.strip())
            # Start new chunk with overlap from end of current
            if overlap_chars > 0 and len(current) > overlap_chars:
                overlap_text = current[-overlap_chars:]
                current = overlap_text + "\n\n" + para
            else:
                current = para
        else:
            current = candidate

    if current.strip():
        chunks.append(current.strip())

    # If any chunk is still too large (no paragraph breaks), hard-split it
    final_chunks = []
    for chunk in chunks:
        if len(chunk) > chunk_chars * 1.5:
            # Hard split at chunk_chars boundaries
            for i in range(0, len(chunk), chunk_chars):
                final_chunks.append(chunk[i:i + chunk_chars].strip())
        else:
            final_chunks.append(chunk)

    return final_chunks if final_chunks else [text[:chunk_chars]]


def embed_context_file(config_name: str, content: str, source_file: str = ""):
    """
    Chunk and embed a context file for a character config.
    Replaces any previously stored context for this character.

    Args:
        config_name: The character config filename (e.g., "Hermione Granger.json")
        content: The full text content of the context file
        source_file: Original filename for metadata
    """
    if not HAS_EMBEDDINGS:
        logger.warning("[ContextRAG] Cannot embed — sentence-transformers not available")
        return False

    encoder = _get_encoder()
    if encoder is None:
        return False

    try:
        chunks = _split_into_chunks(content)
        if not chunks:
            logger.warning(f"[ContextRAG] No chunks produced for {config_name}")
            return False

        logger.info(f"[ContextRAG] Split {source_file} into {len(chunks)} chunks for {config_name}")

        # Embed all chunks
        records = []
        embeddings = encoder.encode(chunks)
        for i, (text, embedding) in enumerate(zip(chunks, embeddings)):
            records.append({
                "id": str(uuid.uuid4()),
                "chunk_index": i,
                "text": text,
                "embedding": embedding.tolist()
            })

        store = {
            "source_file": source_file,
            "chunk_count": len(records),
            "chunks": records
        }
        _save_ctx_store(config_name, store)
        logger.info(f"[ContextRAG] Embedded {len(records)} chunks for {config_name}")
        return True

    except Exception as e:
        logger.error(f"[ContextRAG] embed_context_file failed: {e}", exc_info=True)
        return False


def delete_context_store(config_name: str):
    """Delete the .ctx.json store for a character config."""
    path = _ctx_path(config_name)
    try:
        if os.path.exists(path):
            os.remove(path)
            logger.info(f"[ContextRAG] Deleted store for {config_name}")
    except Exception as e:
        logger.error(f"[ContextRAG] Failed to delete store {path}: {e}")


def retrieve(config_name: str, query: str) -> list:
    """
    Retrieve the top-K most semantically similar chunks from a character's
    context file for a given query.

    Returns list of {"role": "system", "content": ...} dicts to inject.
    """
    if not HAS_EMBEDDINGS or not config_name or not query:
        return []

    if not memory_settings.get('ctx_rag_enabled'):
        return []

    encoder = _get_encoder()
    if encoder is None:
        return []

    try:
        store = _load_ctx_store(config_name)
        chunks = store.get("chunks", [])
        if not chunks:
            return []

        top_k = memory_settings.get('ctx_rag_top_k')
        min_similarity = memory_settings.get('ctx_rag_min_similarity')
        token_budget = memory_settings.get('ctx_rag_token_budget')

        query_vec = encoder.encode(query).tolist()

        scored = []
        for chunk in chunks:
            emb = chunk.get("embedding")
            if not emb:
                continue
            sim = _cosine_similarity(query_vec, emb)
            if sim >= min_similarity:
                scored.append((sim, chunk))

        if not scored:
            return []

        scored.sort(key=lambda x: x[0], reverse=True)
        top = scored[:top_k]

        # Sort by chunk_index (document order) for coherent injection
        top.sort(key=lambda x: x[1].get("chunk_index", 0))

        # Build injection messages within token budget
        result = []
        used_tokens = 0
        source = store.get("source_file", "context file")
        for sim, chunk in top:
            text = chunk.get("text", "").strip()
            if not text:
                continue
            est_tokens = len(text) // 4
            if used_tokens + est_tokens > token_budget:
                break
            result.append({
                "role": "system",
                "content": f"[Context]\n{text}"
            })
            used_tokens += est_tokens

        if result:
            logger.info(f"[ContextRAG] Retrieved {len(result)} chunks ({used_tokens} est. tokens) for {config_name}")

        return result

    except Exception as e:
        logger.error(f"[ContextRAG] retrieve failed: {e}", exc_info=True)
        return []
