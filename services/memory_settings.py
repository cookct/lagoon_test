"""
Memory System Settings
Configurable parameters for RAG, lore/anchors, and context management.
Settings persisted to memory_settings.json; changes take effect on next request.
"""
import os
import json
import logging

logger = logging.getLogger(__name__)

MEMORY_SETTINGS_PATH = 'memory_settings.json'

DEFAULTS = {
    # Context summarization
    'summarize_threshold': 0.75,        # Fraction of context window before auto-summarize
    'recent_messages_to_keep': 5,       # Message pairs kept after prune
    'summary_model': 'grok-4-20-beta',  # Model used for summarization
    'summary_max_tokens': 10000,        # Max tokens in summary output
    # RAG semantic memory
    'rag_enabled': True,
    'rag_top_k': 3,                     # Max chunks retrieved per query
    'rag_min_similarity': 0.35,         # Minimum cosine similarity threshold
    'rag_token_budget': 800,            # Max tokens injected from RAG
    'rag_chunk_size': 4,                # Turn-pairs per chunk (affects new chunks only)
    # Lore / Anchors
    'lore_scan_depth': 15,              # Recent messages scanned for keyword matches
    'lore_token_budget': 4000,          # Max tokens injected from lore
    # Context file RAG
    'ctx_rag_enabled': True,            # Enable RAG retrieval for context files
    'ctx_rag_top_k': 5,                 # Max chunks retrieved per query from context file
    'ctx_rag_min_similarity': 0.25,     # Minimum cosine similarity for context chunks
    'ctx_rag_token_budget': 1500,       # Max tokens injected from context RAG
    'ctx_rag_chunk_size': 400,          # Approx tokens per chunk when splitting context files
    'ctx_rag_chunk_overlap': 50,        # Overlap tokens between consecutive chunks
}

_cache = None
_cache_mtime = 0.0


def _load():
    global _cache, _cache_mtime
    try:
        if os.path.exists(MEMORY_SETTINGS_PATH):
            mtime = os.path.getmtime(MEMORY_SETTINGS_PATH)
            if _cache is not None and mtime == _cache_mtime:
                return _cache
            with open(MEMORY_SETTINGS_PATH, 'r') as f:
                data = json.load(f)
            merged = {**DEFAULTS, **{k: v for k, v in data.items() if k in DEFAULTS}}
            _cache = merged
            _cache_mtime = mtime
            return _cache
    except Exception as e:
        logger.warning(f"[MemorySettings] Failed to load: {e}")
    if _cache is None:
        _cache = dict(DEFAULTS)
    return _cache


def get(key):
    """Get a single setting value, falling back to DEFAULTS."""
    return _load().get(key, DEFAULTS.get(key))


def get_all():
    """Return all current settings merged with defaults."""
    return {**DEFAULTS, **_load()}


def save(settings_dict):
    """Validate, coerce, and persist settings. Returns the saved dict."""
    global _cache, _cache_mtime
    validated = {}
    for key, default in DEFAULTS.items():
        val = settings_dict.get(key, default)
        try:
            if isinstance(default, bool):
                validated[key] = bool(val) if not isinstance(val, str) else val.lower() not in ('false', '0', '')
            elif isinstance(default, int):
                validated[key] = int(float(val))
            elif isinstance(default, float):
                validated[key] = float(val)
            else:
                validated[key] = str(val)
        except (ValueError, TypeError):
            validated[key] = default
    with open(MEMORY_SETTINGS_PATH, 'w') as f:
        json.dump(validated, f, indent=2)
    _cache = validated
    _cache_mtime = os.path.getmtime(MEMORY_SETTINGS_PATH)
    logger.info(f"[MemorySettings] Saved settings")
    return validated
