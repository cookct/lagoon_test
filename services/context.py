"""
Context Management Service

Architecture:
- Chat files store ONLY raw messages (config system prompts + user/assistant conversation).
  Summary messages are NEVER written to disk.
- The summary stack (chats/.summaries/<id>.summary.json) is the single source of truth
  for summaries.
- manage_context() assembles the LLM payload at request time:
    [config system msgs] + [stack summary msgs] + [recent conversation]
  and returns it for the API call. Only the raw pruned history is synced to disk.
- Token counting uses tiktoken (cl100k_base) for accuracy.
"""
import os
import json
import uuid
import threading
import logging
from datetime import datetime

import tiktoken

from config import (
    CONTEXT_WINDOWS,
    DEFAULT_CONTEXT_WINDOW,
    MAX_REQUEST_BYTES,
    VENICE_API_BASE,
    CHATS_DIR
)
from services import memory_settings

logger = logging.getLogger(__name__)

# ── Tiktoken ────────────────────────────────────────────────────────────────
_encoder = None

def _get_encoder():
    global _encoder
    if _encoder is None:
        _encoder = tiktoken.get_encoding("cl100k_base")
    return _encoder


def count_tokens(text):
    """Count tokens in a single string."""
    if not text:
        return 0
    try:
        return len(_get_encoder().encode(text))
    except Exception:
        return len(text) // 4  # fallback on encode failure


def count_message_tokens(messages):
    """
    Count tokens for a list of messages, including per-message overhead
    (~4 tokens per message for role/delimiter framing).
    """
    enc = _get_encoder()
    total = 0
    for msg in messages:
        total += 4  # per-message overhead
        content = msg.get('content', '')
        try:
            if isinstance(content, str):
                total += len(enc.encode(content))
            elif isinstance(content, list):
                for item in content:
                    if isinstance(item, dict) and item.get('type') == 'text':
                        total += len(enc.encode(item.get('text', '')))
        except Exception:
            if isinstance(content, str):
                total += len(content) // 4
    return total


# ── In-memory caches ─────────────────────────────────────────────────────────
_summary_cache = {}          # chat_id -> file_data dict
_pending_summarizations = set()


# ── Disk helpers ─────────────────────────────────────────────────────────────

def _sync_to_disk(chat_id, raw_messages):
    """
    Write raw messages (no injected summary system messages) back to the chat file.
    Only called with config system msgs + pruned conversation — never with assembled LLM payload.
    """
    chat_path = os.path.join(CHATS_DIR, chat_id)
    if not os.path.exists(chat_path):
        return
    try:
        with open(chat_path, 'r') as f:
            chat_data = json.load(f)
        chat_data['messages'] = raw_messages
        with open(chat_path, 'w') as f:
            json.dump(chat_data, f, indent=4)
        logger.info(f"[CONTEXT] Synced {len(raw_messages)} raw messages to {chat_id}")
    except Exception as e:
        logger.error(f"[CONTEXT] Failed to sync to disk: {e}")


def _get_summary_path(chat_id):
    if not chat_id:
        return None
    summary_dir = os.path.join(CHATS_DIR, '.summaries')
    os.makedirs(summary_dir, exist_ok=True)
    return os.path.join(summary_dir, f"{chat_id}.summary.json")


# ── Summary stack ─────────────────────────────────────────────────────────────

def _load_summary_file(chat_id):
    """Load summary file, migrating old single-summary format to stack format."""
    summary_path = _get_summary_path(chat_id)
    if not summary_path or not os.path.exists(summary_path):
        return None
    try:
        with open(summary_path, 'r') as f:
            data = json.load(f)
        # Migrate old format
        if 'summary' in data and 'summaries' not in data:
            migrated = {"summaries": [{
                "id": str(uuid.uuid4()),
                "text": data['summary'],
                "message_count": data.get('message_count', 0),
                "model": data.get('model', 'unknown'),
                "created_at": datetime.utcnow().isoformat()
            }]}
            with open(summary_path, 'w') as f:
                json.dump(migrated, f)
            return migrated
        return data
    except Exception as e:
        logger.warning(f"Failed to load summary file: {e}")
        return None


def _save_summary_file(chat_id, file_data):
    summary_path = _get_summary_path(chat_id)
    if not summary_path:
        return
    try:
        with open(summary_path, 'w') as f:
            json.dump(file_data, f)
    except Exception as e:
        logger.warning(f"Failed to save summary file: {e}")


def load_summary_stack(chat_id):
    """Return list of stacked summary entries (empty list if none)."""
    if not chat_id:
        return []
    cached = _summary_cache.get(chat_id)
    if cached and isinstance(cached, dict) and cached.get('summaries'):
        return cached['summaries']
    file_data = _load_summary_file(chat_id)
    if file_data and file_data.get('summaries'):
        _summary_cache[chat_id] = file_data
        return file_data['summaries']
    return []


def append_to_summary_stack(chat_id, text, message_count, model, pending_review=False, msgs_to_keep=None):
    """Append a new summary entry to the stack. Returns the entry."""
    if not chat_id or not text:
        return None
    entry = {
        "id": str(uuid.uuid4()),
        "text": text,
        "message_count": message_count,
        "model": model,
        "created_at": datetime.utcnow().isoformat()
    }
    if pending_review:
        entry["pending_review"] = True
        entry["msgs_to_keep"] = msgs_to_keep
    file_data = _load_summary_file(chat_id) or {"summaries": []}
    file_data.setdefault("summaries", [])
    file_data["summaries"].append(entry)
    _summary_cache[chat_id] = file_data
    _save_summary_file(chat_id, file_data)
    logger.info(f"[CONTEXT] Appended summary {entry['id']} for {chat_id} (stack: {len(file_data['summaries'])})")
    return entry


def delete_summary_entry(chat_id, summary_id):
    """Remove a summary entry by ID. Returns True if deleted."""
    if not chat_id or not summary_id:
        return False
    file_data = _load_summary_file(chat_id)
    if not file_data:
        return False
    before = len(file_data.get("summaries", []))
    file_data["summaries"] = [s for s in file_data.get("summaries", []) if s.get("id") != summary_id]
    if len(file_data["summaries"]) == before:
        return False
    _summary_cache[chat_id] = file_data
    _save_summary_file(chat_id, file_data)
    return True


def approve_pending_summary(chat_id, summary_id, raw_messages):
    """
    Approve a pending-review summary: clear the pending flag, then prune and
    sync raw_messages to disk using the msgs_to_keep stored in the entry.
    Returns the pruned messages list, or None on failure.
    """
    if not chat_id or not summary_id:
        return None
    file_data = _load_summary_file(chat_id)
    if not file_data:
        return None

    entry = next((s for s in file_data.get("summaries", []) if s.get("id") == summary_id), None)
    if not entry or not entry.get("pending_review"):
        return None

    msgs_to_keep = entry.get("msgs_to_keep")
    entry.pop("pending_review", None)
    entry.pop("msgs_to_keep", None)
    _summary_cache[chat_id] = file_data
    _save_summary_file(chat_id, file_data)

    # Prune raw messages to disk
    config_system = [m for m in raw_messages if m.get('role') == 'system'
                     and not m.get('content', '').startswith('[SUMMARY')]
    conversation = [m for m in raw_messages if m.get('role') != 'system']

    if msgs_to_keep and msgs_to_keep > 0:
        conversation = conversation[-msgs_to_keep:]

    pruned = config_system + conversation
    _sync_to_disk(chat_id, pruned)
    logger.info(f"[CONTEXT] Approved summary {summary_id} for {chat_id}, pruned to {len(pruned)} messages")
    return pruned


def build_summary_messages(summaries):
    """Convert summary stack to system messages for LLM injection (oldest first)."""
    if not summaries:
        return []
    n = len(summaries)
    if n == 1:
        return [{"role": "system", "content": (
            f"[PRIOR EVENTS]\n\n{summaries[0]['text']}\n\n"
            f"[END PRIOR EVENTS — story continues in the conversation below]"
        )}]
    msgs = []
    for i, s in enumerate(summaries):
        part = i + 1
        if part == 1:
            header = f"[PRIOR EVENTS — Part {part} of {n}]"
            footer = f"[END PART {part} — continued in Part {part + 1}]"
        elif part == n:
            header = f"[PRIOR EVENTS — Part {part} of {n}, follows Part {part - 1}]"
            footer = f"[END PART {part} — story continues in the conversation below]"
        else:
            header = f"[PRIOR EVENTS — Part {part} of {n}, follows Part {part - 1}]"
            footer = f"[END PART {part} — continued in Part {part + 1}]"
        msgs.append({"role": "system", "content": f"{header}\n\n{s['text']}\n\n{footer}"})
    return msgs


# Backward-compat shim
def load_cached_summary(chat_id):
    stack = load_summary_stack(chat_id)
    if not stack:
        return None
    latest = stack[-1]
    return {"summary": latest["text"], "message_count": latest.get("message_count", 0), "model": latest.get("model", "unknown")}


def save_summary_cache(chat_id, summary_data):
    if not chat_id or not summary_data or not summary_data.get('summary'):
        return
    append_to_summary_stack(chat_id, summary_data['summary'], summary_data.get('message_count', 0), summary_data.get('model', 'unknown'))


# ── Summary generation ────────────────────────────────────────────────────────

def _build_conversation_text(messages):
    """Flatten messages to plain text for summarization prompts."""
    text = ""
    for msg in messages:
        role = msg.get('role', 'unknown').upper()
        content = msg.get('content', '')
        if isinstance(content, list):
            parts = []
            for item in content:
                if isinstance(item, dict):
                    if item.get('type') == 'text':
                        parts.append(item.get('text', ''))
                    elif item.get('type') == 'image_url':
                        parts.append('[Image Attached]')
            content = ' '.join(parts)
        if role != 'SYSTEM':
            text += f"[{role}]: {content}\n\n"
    if len(text) > 500000:
        text = text[:500000] + "\n\n[...truncated...]"
    return text


def _call_venice(api_key, prompt, max_tokens=1000):
    """Make a blocking Venice API call for summarization. Returns text or None."""
    import httpx
    try:
        with httpx.Client(timeout=180.0) as client:
            response = client.post(
                f"{VENICE_API_BASE}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": memory_settings.get('summary_model'),
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.3,
                    "max_tokens": max_tokens,
                    "stream": False,
                    "venice_parameters": {"disable_thinking": True}
                }
            )
            response.raise_for_status()
            choice = response.json()['choices'][0]
            return choice['message'].get('content') or choice['message'].get('reasoning_content') or None
    except Exception as e:
        logger.error(f"Venice API call failed: {e}")
        return None


def _generate_summary(messages_to_summarize, api_key, chat_id, blocking=False, pending_review=False, msgs_to_keep=None, prior_summaries=None):
    """Generate a detailed summary and append to stack."""
    conversation_text = _build_conversation_text(messages_to_summarize)

    if prior_summaries:
        prior_parts = "\n\n---\n\n".join(s['text'] for s in prior_summaries)
        prompt = (
            "You are extending a permanent record of an ongoing roleplay/fiction session.\n\n"
            "The following has already been recorded. Do not repeat, rephrase, echo, or summarize "
            "anything in it. The reader already has this. Your job is only what comes AFTER.\n\n"
            f"--- EXISTING RECORD ---\n{prior_parts}\n--- END EXISTING RECORD ---\n\n"
            "The conversation below is a direct continuation. Pick up exactly where the existing record ends.\n\n"
            "Write in natural literary prose, past tense, third person. Establish characters by name, then use pronouns naturally — avoid starting every sentence with a character's name. "
            "Do not editorialize, interpret, or evaluate. Only record what occurred.\n\n"
            "Write at scene level, not moment level. Capture what happened and why it matters — not sensory details, exact dialogue, or beat-by-beat mechanics. "
            "If a scene can be summarized in one sentence, use one sentence.\n\n"
            "Cover the new events only:\n\n"
            "CHARACTERS & STATE AT CONTINUATION POINT\n"
            "- Who is present, emotional state entering the scene\n\n"
            "EVENTS\n"
            "- What happened, in order. Group related actions into single sentences. Skip micro-details.\n\n"
            "EMOTIONAL & RELATIONAL STATE\n"
            "- How the relationship shifted. Power dynamics, trust, conflict — the arc, not the texture.\n\n"
            "SEXUAL/PHYSICAL CONTENT (if present)\n"
            "- What happened and how it ended, physically and emotionally. No mechanics.\n\n"
            "SCENE END\n"
            "- Where characters are, their emotional state, what is unresolved.\n\n"
            f"NEW CONVERSATION:\n{conversation_text}\n\nCONTINUATION RECORD:"
        )
    else:
        prompt = (
            "You are creating a permanent record of a roleplay/fiction session. "
            "This record will be the ONLY reference to these events in all future sessions — "
            "treat it as the authoritative archive.\n\n"
            "Write at scene level, not moment level. Capture what happened and why it matters — not sensory details, exact dialogue, or beat-by-beat mechanics. "
            "If a scene can be summarized in one sentence, use one sentence.\n\n"
            "Write in natural literary prose, past tense, third person. Establish characters by name, then use pronouns naturally. "
            "Do not editorialize or evaluate. Only record what occurred.\n\n"
            "Cover:\n\n"
            "CHARACTERS & STATE\n"
            "- Who is present, their emotional state, and what they want\n\n"
            "SETTING\n"
            "- Location, time, atmosphere\n\n"
            "EVENTS\n"
            "- What happened, in order. Group related actions into single sentences. Skip micro-details.\n\n"
            "EMOTIONAL & RELATIONAL STATE\n"
            "- How the relationship shifted. Power dynamics, trust, conflict — the arc, not the texture.\n\n"
            "SEXUAL/PHYSICAL CONTENT (if present)\n"
            "- What happened and how it ended, physically and emotionally. No mechanics.\n\n"
            "SCENE END\n"
            "- Where characters are, their emotional state, what is unresolved.\n\n"
            f"CONVERSATION:\n{conversation_text}\n\nRECORD:"
        )
    summary_model = memory_settings.get('summary_model')
    text = _call_venice(api_key, prompt, max_tokens=memory_settings.get('summary_max_tokens'))
    if not text:
        logger.error(f"Summarization returned empty content for chat {chat_id}")
        return None
    append_to_summary_stack(chat_id, text, len(messages_to_summarize), summary_model,
                            pending_review=pending_review, msgs_to_keep=msgs_to_keep)
    logger.info(f"[CONTEXT] Summary generated for chat {chat_id} (pending_review={pending_review})")
    return {"summary": text, "message_count": len(messages_to_summarize), "model": summary_model}


def generate_detailed_summary(messages_to_summarize, api_key):
    """Generate a detailed structured summary for user review (manual mode). Does NOT save."""
    conversation_text = _build_conversation_text(messages_to_summarize)
    prompt = (
        "Create a comprehensive, structured summary of this conversation for long-term context continuity.\n"
        "Use headers and bullet points. Cover every topic, code change, decision, question answered, and important detail.\n"
        "Be thorough — the user will curate this and keep only what matters.\n\n"
        "Format as:\n## [Topic or Section Title]\n- Key point\n- Key point\n\n"
        f"CONVERSATION:\n{conversation_text}\n\nDETAILED SUMMARY:"
    )
    return _call_venice(api_key, prompt, max_tokens=2000)


def _generate_summary_background(messages_to_summarize, api_key, model_name, chat_id, msgs_to_keep=None):
    if chat_id in _pending_summarizations:
        return
    _pending_summarizations.add(chat_id)
    try:
        prior = [s for s in load_summary_stack(chat_id) if not s.get('pending_review')]
        _generate_summary(messages_to_summarize, api_key, chat_id, blocking=False,
                          pending_review=True, msgs_to_keep=msgs_to_keep,
                          prior_summaries=prior or None)
    finally:
        _pending_summarizations.discard(chat_id)


def trigger_background_summarization(messages, model_name, api_key, chat_id, summarize_mode='auto'):
    """
    Pre-warm the summary stack after streaming completes. Non-blocking.
    Marks the generated summary as pending_review=True so the user can approve
    before messages are pruned from disk.
    `messages` should be raw messages (no injected summaries).
    """
    if summarize_mode != 'auto' or not chat_id or not api_key:
        return
    if chat_id in _pending_summarizations:
        return

    # Skip if a pending review already exists — don't stack up unapproved summaries
    summaries = load_summary_stack(chat_id)
    if any(s.get('pending_review') for s in summaries):
        return

    stack_msgs = build_summary_messages(summaries)
    assembled_tokens = count_message_tokens(stack_msgs + messages)

    context_window = CONTEXT_WINDOWS.get(model_name, DEFAULT_CONTEXT_WINDOW)
    threshold = int(context_window * memory_settings.get('summarize_threshold'))

    if assembled_tokens < threshold:
        return

    conversation_messages = [m for m in messages if m.get('role') != 'system']
    if len(conversation_messages) < 6:
        return

    msgs_to_keep = max(4, min(memory_settings.get('recent_messages_to_keep') * 2, len(conversation_messages) // 2))
    messages_to_summarize = conversation_messages[:-msgs_to_keep]

    thread = threading.Thread(
        target=_generate_summary_background,
        args=(messages_to_summarize, api_key, model_name, chat_id),
        kwargs={'msgs_to_keep': msgs_to_keep},
        daemon=True
    )
    thread.start()
    logger.info(f"[CONTEXT] Started background summarization for chat {chat_id} (pending review)")


# ── Core context management ───────────────────────────────────────────────────

def manage_context(messages, model_name, api_key, chat_id=None, max_bytes=None, summarize_mode='auto'):
    """
    Assemble the LLM payload and prune history if needed.

    Input `messages` are raw (config system msgs + conversation).
    Any [SUMMARY] system messages are stripped (migration from old behavior).

    Returns: (llm_payload, was_modified)

    llm_payload  = config_system_msgs + stack_summary_msgs + recent_conversation
    Disk write   = config_system_msgs + pruned_conversation  (NO summaries ever written)
    """
    if max_bytes is None:
        max_bytes = MAX_REQUEST_BYTES
    if not messages:
        return messages, False

    # Strip any legacy injected summary messages — stack file is authoritative
    config_system_msgs = [m for m in messages
                          if m.get('role') == 'system' and not m.get('content', '').startswith('[SUMMARY')]
    conversation_msgs = [m for m in messages if m.get('role') != 'system']

    context_window = CONTEXT_WINDOWS.get(model_name, DEFAULT_CONTEXT_WINDOW)
    threshold = int(context_window * memory_settings.get('summarize_threshold'))

    summaries = load_summary_stack(chat_id) if chat_id else []
    stack_msgs = build_summary_messages(summaries)

    assembled_tokens = count_message_tokens(config_system_msgs + stack_msgs + conversation_msgs)
    logger.info(
        f"[CONTEXT] chat={chat_id}, model={model_name}, assembled={assembled_tokens}/{context_window} "
        f"({int(100*assembled_tokens/context_window)}%), threshold={threshold}, "
        f"conv={len(conversation_msgs)}, summaries={len(summaries)}, mode={summarize_mode}"
    )

    was_modified = False
    # conversation_to_store tracks what we'll write back to disk (raw, no summaries)
    conversation_to_store = list(conversation_msgs)

    if assembled_tokens >= threshold and len(conversation_msgs) >= 6:
        msgs_to_keep = max(4, min(memory_settings.get('recent_messages_to_keep') * 2, len(conversation_msgs) // 2))

        if summarize_mode == 'auto' and not summaries:
            # Generate summary — mark pending_review so user approves before disk prune
            to_summarize = conversation_msgs[:-msgs_to_keep]
            logger.info(f"[CONTEXT] Auto: summarizing {len(to_summarize)} messages synchronously (pending review)")
            _generate_summary(to_summarize, api_key, chat_id, blocking=True,
                              pending_review=True, msgs_to_keep=msgs_to_keep)
            summaries = load_summary_stack(chat_id)
            stack_msgs = build_summary_messages(summaries)
        elif summarize_mode == 'auto':
            logger.info(f"[CONTEXT] Auto: {len(summaries)} summaries in stack")

        # Only prune from raw storage if all summaries are approved
        has_pending = any(s.get('pending_review') for s in summaries)
        if not has_pending:
            conversation_to_store = conversation_msgs[-msgs_to_keep:]
            was_modified = True
        else:
            logger.info(f"[CONTEXT] Skipping disk prune — pending review summary exists for {chat_id}")

    # Build LLM payload (NEVER written to disk)
    llm_payload = config_system_msgs + stack_msgs + conversation_to_store

    # Token pruning fallback: if still over 95%, drop oldest conversation messages
    current_tokens = count_message_tokens(llm_payload)
    hard_threshold = int(context_window * 0.95)
    target_tokens = int(context_window * 0.90)

    if current_tokens > hard_threshold:
        logger.warning(f"[CONTEXT] Payload still {current_tokens} tokens — pruning conversation")
        conv = list(conversation_to_store)
        while conv and count_message_tokens(config_system_msgs + stack_msgs + conv) > target_tokens:
            conv.pop(0)
            was_modified = True
        conversation_to_store = conv
        llm_payload = config_system_msgs + stack_msgs + conversation_to_store
        logger.info(f"[CONTEXT] Pruned to {count_message_tokens(llm_payload)} tokens")

    # Compute needs_review: any pending summary in the stack
    needs_review = any(s.get('pending_review') for s in (load_summary_stack(chat_id) if chat_id else []))

    # Sync RAW history to disk only when no pending review summary exists
    if was_modified and chat_id and not needs_review:
        raw_to_store = config_system_msgs + conversation_to_store
        _sync_to_disk(chat_id, raw_to_store)

    # Hard byte limit on LLM payload only
    while len(json.dumps(llm_payload)) > max_bytes and len(llm_payload) > 3:
        for i in range(len(llm_payload)):
            if llm_payload[i].get('role') != 'system':
                llm_payload.pop(i)
                was_modified = True
                break
        else:
            break

    return llm_payload, was_modified, needs_review
