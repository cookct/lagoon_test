"""
RAG Memory Service

Chunks past conversation into segments, embeds them with sentence-transformers,
and retrieves semantically similar past chunks to inject as context.

Uses the same sentence-transformers/all-MiniLM-L6-v2 model as gondola-dev.
Gracefully degrades to no-op if sentence-transformers is not installed.
"""
import os
import json
import uuid
import threading
import logging
import math

logger = logging.getLogger(__name__)

# ── Embedding model (lazy-loaded) ─────────────────────────────────────────────
_encoder = None
_encoder_lock = threading.Lock()
HAS_EMBEDDINGS = False

try:
    from sentence_transformers import SentenceTransformer
    import numpy as np
    HAS_EMBEDDINGS = True
except ImportError:
    logger.info("[RAG] sentence-transformers not available — RAG disabled")

RAG_DIR = os.path.join("chats", ".rag")
from services import memory_settings

# Track which chats are currently being chunked
_pending_chunking = set()
_pending_lock = threading.Lock()


def _get_encoder():
    global _encoder, HAS_EMBEDDINGS
    if not HAS_EMBEDDINGS:
        return None
    with _encoder_lock:
        if _encoder is None:
            try:
                _encoder = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
                logger.info("[RAG] Loaded sentence-transformers/all-MiniLM-L6-v2")
            except Exception as e:
                logger.error(f"[RAG] Failed to load encoder: {e}")
                HAS_EMBEDDINGS = False
                return None
    return _encoder


def _rag_path(chat_id: str) -> str:
    os.makedirs(RAG_DIR, exist_ok=True)
    return os.path.join(RAG_DIR, f"{chat_id}.rag.json")


def _load_rag_store(chat_id: str) -> list:
    path = _rag_path(chat_id)
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"[RAG] Failed to load store {path}: {e}")
        return []


def _save_rag_store(chat_id: str, chunks: list):
    path = _rag_path(chat_id)
    try:
        with open(path, "w") as f:
            json.dump(chunks, f)
    except Exception as e:
        logger.error(f"[RAG] Failed to save store {path}: {e}")


def _cosine_similarity(a: list, b: list) -> float:
    if not HAS_EMBEDDINGS:
        return 0.0
    import numpy as np
    a, b = np.array(a), np.array(b)
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


def _build_chunks(messages: list) -> list:
    """
    Split conversation messages (non-system) into chunks of CHUNK_SIZE turn-pairs.
    Each chunk is a list of messages.
    """
    chunk_size = memory_settings.get('rag_chunk_size')
    conv = [m for m in messages if m.get("role") in ("user", "assistant")]
    chunks = []
    i = 0
    while i < len(conv):
        chunk_msgs = conv[i:i + chunk_size * 2]
        if chunk_msgs:
            chunks.append(chunk_msgs)
        i += chunk_size * 2
    return chunks


def _chunk_to_text(chunk_msgs: list) -> str:
    parts = []
    for m in chunk_msgs:
        role = m.get("role", "").upper()
        content = m.get("content", "")
        if isinstance(content, list):
            content = " ".join(p.get("text", "") for p in content if isinstance(p, dict))
        parts.append(f"{role}: {content}")
    return "\n".join(parts)


def chunk_and_embed(chat_id: str, messages: list):
    """
    Chunk conversation, embed new chunks (those not already in the store), and save.
    Safe to call repeatedly — only embeds new chunks.
    """
    if not HAS_EMBEDDINGS:
        return

    encoder = _get_encoder()
    if encoder is None:
        return

    try:
        existing = _load_rag_store(chat_id)
        existing_count = len(existing)

        all_chunks = _build_chunks(messages)
        # Only process chunks beyond what we've already stored
        new_chunks = all_chunks[existing_count:]
        if not new_chunks:
            return

        new_records = []
        for i, chunk_msgs in enumerate(new_chunks):
            text = _chunk_to_text(chunk_msgs)
            if not text.strip():
                continue
            embedding = encoder.encode(text).tolist()
            new_records.append({
                "id": str(uuid.uuid4()),
                "chunk_index": existing_count + i,
                "text": text,
                "embedding": embedding,
                "turn_range": [existing_count + i * memory_settings.get('rag_chunk_size') * 2,
                               existing_count + i * memory_settings.get('rag_chunk_size') * 2 + len(chunk_msgs)]
            })

        if new_records:
            existing.extend(new_records)
            _save_rag_store(chat_id, existing)
            logger.info(f"[RAG] Embedded {len(new_records)} new chunks for {chat_id}")

    except Exception as e:
        logger.error(f"[RAG] chunk_and_embed failed: {e}", exc_info=True)


def trigger_background_chunking(chat_id: str, messages: list):
    """Launch background thread to chunk+embed new conversation content."""
    if not HAS_EMBEDDINGS or not chat_id or not memory_settings.get('rag_enabled'):
        return

    with _pending_lock:
        if chat_id in _pending_chunking:
            return
        _pending_chunking.add(chat_id)

    def _run():
        try:
            chunk_and_embed(chat_id, messages)
        finally:
            with _pending_lock:
                _pending_chunking.discard(chat_id)

    t = threading.Thread(target=_run, daemon=True)
    t.start()


def retrieve(chat_id: str, query: str, exclude_last_n: int = 0) -> list:
    """
    Retrieve the top-K most semantically similar past chunks for a query.
    Returns list of {"role": "system", "content": ...} dicts to inject.
    exclude_last_n: skip the N most recently added chunks (used by preview
    endpoint to avoid showing the just-completed response as retrieved memory).
    """
    if not HAS_EMBEDDINGS or not chat_id or not query or not memory_settings.get('rag_enabled'):
        return []

    encoder = _get_encoder()
    if encoder is None:
        return []

    try:
        chunks = _load_rag_store(chat_id)
        if not chunks:
            return []

        if exclude_last_n:
            chunks = chunks[:-exclude_last_n] if len(chunks) > exclude_last_n else []
        if not chunks:
            return []

        top_k = memory_settings.get('rag_top_k')
        min_similarity = memory_settings.get('rag_min_similarity')
        token_budget = memory_settings.get('rag_token_budget')

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

        # Sort by chunk_index (chronological order for injection)
        top.sort(key=lambda x: x[1].get("chunk_index", 0))

        # Build injection messages within token budget
        result = []
        used_tokens = 0
        for sim, chunk in top:
            text = chunk.get("text", "").strip()
            if not text:
                continue
            est_tokens = len(text) // 4
            if used_tokens + est_tokens > token_budget:
                break
            result.append({
                "role": "system",
                "content": f"[Retrieved Memory — similarity {sim:.2f}]\n{text}"
            })
            used_tokens += est_tokens

        if result:
            logger.info(f"[RAG] Retrieved {len(result)} chunks ({used_tokens} est. tokens) for {chat_id}")

        return result

    except Exception as e:
        logger.error(f"[RAG] retrieve failed: {e}", exc_info=True)
        return []
