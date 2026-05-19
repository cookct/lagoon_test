"""
Anchors Service

Keyword-triggered lore injection for long-form writing and roleplay.
Entries fire when their keywords appear in recent messages, and are
injected as system messages near the bottom of the context.
"""
import os
import json
import uuid
import logging
import re

logger = logging.getLogger(__name__)

LORE_DIR = os.path.join("configs", ".lore")
from services import memory_settings

# Pattern for in-stream awareness update signals (strict UUID format)
LORE_UPDATE_PATTERN = re.compile(r'\[LORE_UPDATE:([a-f0-9\-]{36})\]')
# Fallback: catch any [LORE_UPDATE:...] that didn't match UUID format (model used wrong id)
LORE_UPDATE_BAD_PATTERN = re.compile(r'\[LORE_UPDATE:[^\]]+\]')


def _lore_path(config_name: str) -> str:
    """Return the sidecar lore file path for a given config name."""
    os.makedirs(LORE_DIR, exist_ok=True)
    safe = config_name.replace(".json", "").replace("/", "_")
    return os.path.join(LORE_DIR, f"{safe}.lore.json")


def load_anchors(config_name: str) -> list:
    """Load anchors entries for a character config. Returns list of entry dicts."""
    path = _lore_path(config_name)
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r") as f:
            data = json.load(f)
        return data.get("entries", [])
    except Exception as e:
        logger.error(f"[Anchors] Failed to load anchors {path}: {e}")
        return []


def save_anchors(config_name: str, entries: list) -> bool:
    """Persist anchors entries to disk."""
    path = _lore_path(config_name)
    try:
        with open(path, "w") as f:
            json.dump({"entries": entries}, f, indent=2)
        return True
    except Exception as e:
        logger.error(f"[Anchors] Failed to save anchors {path}: {e}")
        return False


def add_entry(config_name: str, keywords: list, content: str, priority: int = 0, character_aware: bool = True) -> dict:
    """Add a new anchors entry. Returns the created entry."""
    entries = load_anchors(config_name)
    entry = {
        "id": str(uuid.uuid4()),
        "enabled": True,
        "character_aware": character_aware,
        "keywords": [k.strip() for k in keywords if k.strip()],
        "content": content.strip(),
        "priority": priority
    }
    entries.append(entry)
    save_anchors(config_name, entries)
    return entry


def update_entry(config_name: str, entry_id: str, updates: dict) -> bool:
    """Update fields on an existing entry by ID."""
    entries = load_anchors(config_name)
    for entry in entries:
        if entry.get("id") == entry_id:
            if "keywords" in updates:
                updates["keywords"] = [k.strip() for k in updates["keywords"] if k.strip()]
            entry.update(updates)
            save_anchors(config_name, entries)
            return True
    return False


def delete_entry(config_name: str, entry_id: str) -> bool:
    """Delete an entry by ID."""
    entries = load_anchors(config_name)
    new_entries = [e for e in entries if e.get("id") != entry_id]
    if len(new_entries) == len(entries):
        return False
    save_anchors(config_name, new_entries)
    return True


def mark_aware(config_name: str, entry_id: str) -> dict | None:
    """
    Mark an anchors entry as character_aware=True.
    Returns the entry dict (with keywords) so callers can surface a notification,
    or None if the entry wasn't found.
    """
    entries = load_anchors(config_name)
    for entry in entries:
        if entry.get("id") == entry_id:
            if not entry.get("character_aware", True):
                entry["character_aware"] = True
                save_anchors(config_name, entries)
                logger.info(f"[Anchors] Marked aware: {entry_id} ({entry.get('keywords', [])})")
            return entry
    return None


def strip_lore_updates(text: str) -> tuple[str, list[str], list[str]]:
    """
    Find and remove all [LORE_UPDATE:uuid] signals from text.
    Returns (cleaned_text, list_of_valid_entry_ids, list_of_bad_tags).
    Also strips and warns about malformed [LORE_UPDATE:...] tags (wrong format).
    """
    ids = LORE_UPDATE_PATTERN.findall(text)
    cleaned = LORE_UPDATE_PATTERN.sub('', text)
    # Check for bad-format tags the model emitted instead of the UUID
    bad = LORE_UPDATE_BAD_PATTERN.findall(cleaned)
    if bad:
        logger.warning(f"[Anchors] Model emitted malformed lore update tag(s) — UUID expected: {bad}")
        cleaned = LORE_UPDATE_BAD_PATTERN.sub('', cleaned)
    return cleaned, ids, bad


def scan_and_inject(messages: list, config_name: str, char_name: str = "the character", lore_labels: bool = True, extra_lore_names: list = None) -> list:
    """
    Scan recent messages for anchors keyword matches and return
    matching system messages to inject, sorted by priority (highest first),
    within token budget.

    extra_lore_names: optional list of additional config names whose lore
    entries are merged in (deduped by entry id).

    Returns list of {"role": "system", "content": ...} dicts.
    """
    if not config_name:
        logger.debug("[Anchors] scan_and_inject called with no config_name — skipping")
        return []

    entries = load_anchors(config_name)

    if extra_lore_names:
        seen_ids = {e.get('id') for e in entries if e.get('id')}
        for extra in extra_lore_names:
            if not extra or extra == config_name:
                continue
            for entry in load_anchors(extra):
                eid = entry.get('id')
                if eid and eid in seen_ids:
                    continue
                entries.append(entry)
                if eid:
                    seen_ids.add(eid)
    logger.debug(f"[Anchors] Scanning for {config_name!r} — {len(entries)} entries loaded")
    if not entries:
        return []

    # Build scan text from last lore_scan_depth non-system messages
    recent = [m for m in messages if m.get("role") != "system"]
    scan_msgs = recent[-memory_settings.get('lore_scan_depth'):]
    scan_text = " ".join(
        (m.get("content") or "") if isinstance(m.get("content"), str)
        else " ".join(p.get("text", "") for p in m.get("content", []) if isinstance(p, dict))
        for m in scan_msgs
    ).lower()

    # Find matching enabled entries
    matched = []
    for entry in entries:
        if not entry.get("enabled", True):
            continue
        keywords = entry.get("keywords", [])
        if not keywords:
            continue
        for kw in keywords:
            # Word-boundary on first and last word; handles multi-word phrases
            kw_lower = kw.lower()
            parts = re.escape(kw_lower).split(r'\ ')
            pattern = r'\b' + r'\s+'.join(parts) + r'\b'
            if re.search(pattern, scan_text):
                matched.append(entry)
                break  # Don't double-count entries with multiple matching keywords

    logger.debug(f"[Anchors] Scan text (truncated): {scan_text[:200]!r}")
    logger.debug(f"[Anchors] Matched {len(matched)} entries")

    if not matched:
        return []

    # Sort by priority descending (higher = more important = injected first)
    matched.sort(key=lambda e: e.get("priority", 0), reverse=True)

    # Apply token budget (rough estimate: 4 chars ≈ 1 token)
    result = []
    used_tokens = 0
    for entry in matched:
        content = entry.get("content", "").strip()
        if not content:
            continue
        est_tokens = len(content) // 4
        if used_tokens + est_tokens > memory_settings.get('lore_token_budget'):
            break

        if entry.get("character_aware", True):
            msg_content = f"[Lore]\n{content}" if lore_labels else content
        else:
            # Awareness injection — character doesn't know this yet
            entry_id = entry.get("id", "")
            aware_prefix = f"[Lore | {char_name} NOT YET AWARE — id:{entry_id}]" if lore_labels else f"[{char_name} NOT YET AWARE — id:{entry_id}]"
            msg_content = (
                f"{aware_prefix}\n"
                f"{content}\n"
                f"INSTRUCTION: {char_name} does not know this yet. "
                f"The moment this fact is revealed in the conversation — whether stated, implied, or discovered — "
                f"copy the following token verbatim into your response (do not paraphrase or substitute):\n"
                f"[LORE_UPDATE:{entry_id}]\n"
                f"It is stripped before display. Do not break character. Do not explain. Just include it.\n"
                f"If an OOC note tells you a reveal was missed, copy [LORE_UPDATE:{entry_id}] into your next response."
            )

        result.append({"role": "system", "content": msg_content})
        used_tokens += est_tokens

    if result:
        logger.info(f"[Anchors] Injecting {len(result)} entries ({used_tokens} est. tokens) for {config_name}")

    return result


def get_matched_entries(messages: list, config_name: str) -> list:
    """
    Return matched anchors entry metadata (keywords + content preview) without
    building injection messages. Used by the prompt preview endpoint.
    Returns list of {"keywords": [...], "preview": str} dicts.
    """
    if not config_name:
        return []
    entries = load_anchors(config_name)
    if not entries:
        return []

    recent = [m for m in messages if m.get("role") != "system"]
    scan_msgs = recent[-memory_settings.get('lore_scan_depth'):]
    scan_text = " ".join(
        (m.get("content") or "") if isinstance(m.get("content"), str)
        else " ".join(p.get("text", "") for p in m.get("content", []) if isinstance(p, dict))
        for m in scan_msgs
    ).lower()

    matched = []
    for entry in entries:
        if not entry.get("enabled", True):
            continue
        keywords = entry.get("keywords", [])
        if not keywords:
            continue
        for kw in keywords:
            kw_lower = kw.lower()
            parts = re.escape(kw_lower).split(r'\ ')
            pattern = r'\b' + r'\s+'.join(parts) + r'\b'
            if re.search(pattern, scan_text):
                matched.append({
                    "keywords": keywords,
                    "preview": entry.get("content", "")[:80].strip()
                })
                break

    return matched
