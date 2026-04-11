"""
Chat Routes
Handles chat messaging, streaming, saving, and importing.
"""
import os
import re
import json
import uuid
import logging
import httpx
from flask import Blueprint, request, jsonify, Response

from config import CHATS_DIR, VENICE_API_BASE, DEFAULT_MODEL, CONTEXT_WINDOWS, DEFAULT_CONTEXT_WINDOW, RECENT_MESSAGES_TO_KEEP, CREATIVE_FICTION_SYSTEM_PROMPT
from services.storage import get_api_key, get_together_api_key, get_zai_api_key, get_chat_display_name
from services.installed_models import load as load_installed_models
from services.context import (
    manage_context, trigger_background_summarization, load_cached_summary, count_message_tokens,
    load_summary_stack, append_to_summary_stack, delete_summary_entry,
    generate_detailed_summary, _sync_to_disk, build_summary_messages, approve_pending_summary,
    _generate_summary
)
from services.anchors import scan_and_inject as lore_scan, mark_aware as lore_mark_aware, strip_lore_updates, get_matched_entries as lore_get_matched
from services.rag import retrieve as rag_retrieve, trigger_background_chunking

logger = logging.getLogger(__name__)
chat_bp = Blueprint('chat', __name__)


def _infer_provider(model_id, config):
    """Return provider from config, falling back to installed_models lookup, then 'venice'."""
    explicit = config.get('provider')
    if explicit:
        return explicit
    if model_id:
        data = load_installed_models()
        entry = next((m for m in data.get('models', []) if m['id'] == model_id), None)
        if entry:
            return entry.get('provider', 'venice')
    return 'venice'


def _process_lore_chunk(text: str, lore_buf: list, char_name: str) -> tuple:
    """
    Buffer text to catch [LORE_UPDATE:uuid] signals that may span chunk boundaries.
    lore_buf is a single-element list used as a mutable buffer.
    Returns (safe_text_to_yield, list_of_sse_json_strings).
    """
    combined = lore_buf[0] + text
    combined, fired_ids, bad_tags = strip_lore_updates(combined)

    events = []
    for eid in fired_ids:
        if char_name:
            entry = lore_mark_aware(char_name, eid)
            if entry:
                kws = entry.get('keywords', [])
                events.append(json.dumps({'event': 'lore_update', 'entry_id': eid, 'keywords': kws}))
    if bad_tags:
        events.append(json.dumps({'event': 'lore_update_failed', 'tags': bad_tags}))

    if len(combined) > 50:
        lore_buf[0] = combined[-50:]
        return combined[:-50], events
    else:
        lore_buf[0] = combined
        return "", events


def _flush_lore_buf(lore_buf: list, char_name: str) -> tuple:
    """Drain the lore buffer at stream end. Returns (remaining_text, sse_events)."""
    remaining = lore_buf[0]
    lore_buf[0] = ""
    remaining, fired_ids, bad_tags = strip_lore_updates(remaining)

    events = []
    for eid in fired_ids:
        if char_name:
            entry = lore_mark_aware(char_name, eid)
            if entry:
                kws = entry.get('keywords', [])
                events.append(json.dumps({'event': 'lore_update', 'entry_id': eid, 'keywords': kws}))
    if bad_tags:
        events.append(json.dumps({'event': 'lore_update_failed', 'tags': bad_tags}))
    return remaining, events


@chat_bp.route('/api/chat', methods=['POST'])
def stream_chat():
    data = request.json
    messages = data.get('messages', [])
    config = data.get('config', {})
    chat_id = data.get('chat_id')
    summarize_mode = data.get('summarize_mode', 'auto')

    api_key = get_api_key()
    model_name = config.get('model', DEFAULT_MODEL)
    provider = _infer_provider(model_name, config)
    if not api_key and provider not in ('ollama', 'custom', 'together', 'zai'):
        return Response("data: {\"error\": \"Venice API key not configured.\"}\n\n", mimetype='text/event-stream')
    logger.info(f"[Chat] {model_name} | chat={chat_id or 'NEW'} | {len(messages)} messages")
    
    # Process messages for vision models - MOVE BEFORE manage_context
    image_data = data.get('image')
    image_mime = data.get('image_mime', 'image/png')

    if image_data:
        # Find the last user message to attach image to
        for i in range(len(messages) - 1, -1, -1):
            if messages[i].get('role') == 'user':
                current_content = messages[i].get('content', '')
                # If it's already a list, append; otherwise create list
                if isinstance(current_content, str):
                    messages[i]['content'] = [
                        {"type": "text", "text": current_content},
                        {"type": "image_url", "image_url": {"url": f"data:{image_mime};base64,{image_data}"}}
                    ]
                elif isinstance(current_content, list):
                    messages[i]['content'].append(
                        {"type": "image_url", "image_url": {"url": f"data:{image_mime};base64,{image_data}"}}
                    )
                logger.info(f"Attached image to user message at index {i}")
                break

    # ── RAG: retrieve semantically similar past chunks ─────────────────────────
    parent_config = data.get('parent_config')
    last_user_msg = next(
        (m.get('content', '') for m in reversed(messages) if m.get('role') == 'user'),
        ''
    )
    if isinstance(last_user_msg, list):
        last_user_msg = ' '.join(p.get('text', '') for p in last_user_msg if isinstance(p, dict))

    if chat_id and last_user_msg and parent_config:
        rag_msgs = rag_retrieve(chat_id, last_user_msg)
        if rag_msgs:
            # Inject after last system message, before conversation
            last_sys_idx = -1
            for i, m in enumerate(messages):
                if m.get('role') == 'system':
                    last_sys_idx = i
            for j, rm in enumerate(rag_msgs):
                messages.insert(last_sys_idx + 1 + j, rm)

    # ── Anchors: keyword-triggered lore injection ────────────────────────────
    char_name = parent_config.replace('.json', '') if parent_config else None
    logger.debug(f"[Anchors] parent_config={parent_config!r}")
    if parent_config:
        lore_msgs = lore_scan(messages, char_name, char_name)
        if lore_msgs:
            # Inject after RAG (after last system message), before conversation
            last_sys_idx = -1
            for i, m in enumerate(messages):
                if m.get('role') == 'system':
                    last_sys_idx = i
            for j, lm in enumerate(lore_msgs):
                messages.insert(last_sys_idx + 1 + j, lm)

    # ── Author's Note: depth-positioned re-injection (character chats only) ──
    author_note = config.get('author_note', '').strip()
    if author_note and parent_config:
        depth = max(1, int(config.get('author_note_depth', 4)))
        note_msg = {"role": "system", "content": f"[Author's Note]\n{author_note}"}
        non_sys_count = sum(1 for m in messages if m.get('role') != 'system')
        insert_from_end = min(depth, non_sys_count)
        if insert_from_end > 0:
            counted = 0
            insert_pos = len(messages)
            for i in range(len(messages) - 1, -1, -1):
                if messages[i].get('role') != 'system':
                    counted += 1
                    if counted == insert_from_end:
                        insert_pos = i
                        break
            messages.insert(insert_pos, note_msg)
        else:
            # No conversation yet — append after last system message
            last_sys_idx = max((i for i, m in enumerate(messages) if m.get('role') == 'system'), default=-1)
            messages.insert(last_sys_idx + 1, note_msg)
        logger.info(f"[AN] Injected Author's Note at depth {depth}")

    # Determine Provider
    provider = _infer_provider(model_name, config)
    is_ollama = provider == 'ollama'
    is_custom = provider == 'custom'
    is_together = provider == 'together'
    is_zai = provider == 'zai'
    is_venice = not is_ollama and not is_custom and not is_together and not is_zai
    is_e2ee = is_venice and model_name.startswith('e2ee-') and config.get('enable_e2ee', False)
    target_api_base = VENICE_API_BASE
    target_api_key = api_key

    if is_ollama:
        ollama_url = (data.get('ollama_url') or 'http://localhost:11434').rstrip('/')
        target_api_base = ollama_url + '/v1'
        target_api_key = 'ollama'
    elif is_together:
        target_api_base = 'https://api.together.xyz/v1'
        together_key = get_together_api_key()
        if not together_key:
            return Response("data: {\"error\": \"Together.ai API key not configured.\"}\n\n", mimetype='text/event-stream')
        target_api_key = together_key
    elif is_zai:
        target_api_base = 'https://api.z.ai/api/paas/v4'
        zai_key = get_zai_api_key()
        if not zai_key:
            return Response("data: {\"error\": \"Z.AI API key not configured.\"}\n\n", mimetype='text/event-stream')
        target_api_key = zai_key
    elif is_custom:
        target_api_base = data.get('custom_base_url', '').rstrip('/')
        custom_key = data.get('custom_api_key', '')
        target_api_key = custom_key if custom_key else 'no-key'
        model_name = data.get('custom_model_id', model_name)

    # Context management - may block for synchronous summarization if over 75% threshold
    pre_tokens = count_message_tokens(messages)
    messages, was_summarized, needs_review = manage_context(messages, model_name, api_key, chat_id=chat_id, summarize_mode=summarize_mode)
    post_tokens = count_message_tokens(messages)

    # Build payload
    payload = {
        "model": model_name,
        "messages": messages,
        "temperature": float(config.get('temperature', 0.7)),
        "top_p": float(config.get('top_p', 1.0)),
        "max_tokens": int(config.get('max_tokens', 2048)),
        "stream": True
    }

    if is_venice:
        # Build venice_parameters
        venice_params = {
            "enable_web_search": "on" if config.get('enable_web_search', False) else "off",
            "enable_web_scraping": config.get('enable_web_scraping', False),
            "include_venice_system_prompt": config.get('include_venice_system_prompt', False),
            "include_search_results_in_stream": False,
            "return_search_results_as_documents": True,
            "enable_web_citations": True if config.get('enable_web_search', False) else False,
            "strip_thinking_response": config.get('strip_thinking', False)
        }
        payload["venice_parameters"] = venice_params

    if is_zai:
        # z.ai thinking parameter - disabled when strip_thinking is true
        strip_thinking = config.get('strip_thinking', False)
        payload["thinking"] = {"type": "disabled" if strip_thinking else "enabled"}

    def generate():
        import time
        import re
        is_new_chat = not chat_id
        new_chat_id = chat_id or f"{uuid.uuid4()}.json"
        full_response = ""
        lore_buf = [""]  # mutable buffer for lore signal boundary detection
        last_usage = {}
        MAX_RETRIES = 5

        # COT stripping toggle (from config)
        strip_thinking = config.get('strip_thinking', False)
        thinking_buffer = ""

        try:
            # Notify frontend if context was modified (Pruning/Summarization happened)
            # Yield this BEFORE 'start' so the UI re-renders history first
            if needs_review:
                logger.info(f"[CONTEXT] Yielding 'review_needed' event for chat {new_chat_id}")
                yield f"data: {json.dumps({'event': 'review_needed'})}\n\n"
            elif was_summarized:
                logger.info(f"!!! [DEBUG] Yielding 'summarized' event to frontend for chat {new_chat_id}")
                yield f"data: {json.dumps({'event': 'summarized', 'message': 'Context optimized.', 'new_messages': messages})}\n\n"

            # Send start event
            start_event = {
                "event": "start",
                "chat_id": new_chat_id,
                "is_new_chat": is_new_chat
            }
            yield f"data: {json.dumps(start_event)}\n\n"

            # === E2EE SESSION SETUP ===
            e2ee_session_priv = None
            e2ee_session_pub_hex = None
            model_pub_key = None

            if is_e2ee:
                try:
                    from services.e2ee import generate_session_keypair, fetch_attestation, encrypt_messages, is_hex_encrypted, decrypt_chunk
                    e2ee_session_priv, e2ee_session_pub_hex = generate_session_keypair()
                    model_pub_key = fetch_attestation(model_name, target_api_key, target_api_base)
                    pre_enc = payload['messages']
                    logger.info(f"[E2EE] Encrypting {len(pre_enc)} messages: {[(m.get('role'), type(m.get('content')).__name__) for m in pre_enc]}")
                    payload['messages'] = encrypt_messages(pre_enc, model_pub_key)
                    # Strip features incompatible with E2EE
                    payload.pop('image', None)
                    payload.pop('image_mime', None)
                    if 'venice_parameters' in payload:
                        vp = payload['venice_parameters']
                        vp['enable_web_search'] = 'off'
                        vp['enable_web_scraping'] = False
                        vp['include_venice_system_prompt'] = False
                        vp['return_search_results_as_documents'] = False
                        vp['include_search_results_in_stream'] = False
                        vp['enable_web_citations'] = False
                    logger.info(f"[E2EE] Session established for {model_name}")
                    yield f"data: {json.dumps({'event': 'e2ee_active', 'model': model_name})}\n\n"
                except Exception as e:
                    logger.error(f"[E2EE] Setup failed: {e}")
                    yield f"data: {json.dumps({'event': 'e2ee_failed', 'error': str(e)})}\n\n"
                    return

            # === VENICE STREAMING ===
            # Retry loop for incomplete streams
            for retry in range(MAX_RETRIES):
                stream_complete = False
                got_finish_reason = False

                try:
                    # Use httpx to get access to response headers for balance info
                    # Long read timeout for slow/thinking models
                    timeout = httpx.Timeout(connect=30.0, read=600.0, write=30.0, pool=30.0)
                    with httpx.Client(timeout=timeout) as client:
                        if retry > 0:
                            logger.warning(f"Retry {retry}/{MAX_RETRIES} - stream was incomplete")
                            yield f"data: {json.dumps({'event': 'status', 'message': f'Stream interrupted, retrying ({retry}/{MAX_RETRIES})...'})}\n\n"

                        logger.info(f"[Chat] Sending to {provider} ({target_api_base}) | {len(payload.get('messages', []))} messages")

                        headers = {
                            "Authorization": f"Bearer {target_api_key}",
                            "Content-Type": "application/json"
                        }
                        if is_e2ee:
                            headers['X-Venice-TEE-Client-Pub-Key'] = e2ee_session_pub_hex
                            headers['X-Venice-TEE-Model-Pub-Key'] = model_pub_key
                            headers['X-Venice-TEE-Signing-Algo'] = 'ecdsa'

                        with client.stream(
                            "POST",
                            f"{target_api_base}/chat/completions",
                            headers=headers,
                            json=payload
                        ) as response:
                            if response.status_code >= 400:
                                error_body = response.read().decode('utf-8', errors='replace')
                                logger.error(f"[Chat] HTTP {response.status_code} from {provider}: {error_body[:500]}")
                                yield f"data: {json.dumps({'event': 'error', 'error': f'{provider} {response.status_code}: {error_body[:200]}'})}\n\n"
                                return

                            # Extract balance from headers (Venice only - Together AI has no balance API)
                            if is_venice:
                                balance_usd = response.headers.get('x-venice-balance-usd')
                                if balance_usd:
                                    try:
                                        balance_event = {
                                            "event": "balance",
                                            "usd": f"{float(balance_usd):.4f}",
                                            "provider": "venice"
                                        }
                                        yield f"data: {json.dumps(balance_event)}\n\n"
                                    except ValueError:
                                        pass
                            else:
                                yield f"data: {json.dumps({'event': 'balance', 'usd': None, 'provider': provider})}\n\n"

                            # Process SSE stream
                            buffer = ""
                            logged_model_name = False
                            for chunk in response.iter_text():
                                buffer += chunk
                                while "\n" in buffer:
                                    line, buffer = buffer.split("\n", 1)
                                    line = line.strip()
                                    if line.startswith("data: "):
                                        data_str = line[6:]
                                        if data_str == "[DONE]":
                                            stream_complete = True
                                            continue
                                        try:
                                            data_obj = json.loads(data_str)
                                            
                                            # Log the actual model name returned by the API (once per stream)
                                            if not logged_model_name and 'model' in data_obj:
                                                logged_model_name = True

                                            # Cache hit/write logging (Venice AI & Together AI prompt caching)
                                            if 'usage' in data_obj and data_obj['usage']:
                                                usage = data_obj['usage']
                                                provider_name = 'Venice' if is_venice else ('Ollama' if is_ollama else provider)

                                                # Venice uses: cache_read_input_tokens, cache_creation_input_tokens
                                                # Together uses: prompt_tokens_details.cached_tokens (read), or cached_prompt_tokens
                                                cache_read = usage.get('cache_read_input_tokens', 0)
                                                cache_write = usage.get('cache_creation_input_tokens', 0)

                                                # Together AI format
                                                if not cache_read:
                                                    cache_read = usage.get('cached_prompt_tokens', 0)
                                                    details = usage.get('prompt_tokens_details', {})
                                                    if details:
                                                        cache_read = details.get('cached_tokens', cache_read)

                                                if cache_read > 0:
                                                    saved = cache_read * 0.0000027
                                                    logger.info(f"🟢 [{provider_name}] CACHE HIT: {cache_read:,} tokens (saved ~${saved:.4f})")
                                                if cache_write > 0:
                                                    logger.info(f"🔵 [{provider_name}] CACHE WRITE: {cache_write:,} tokens")

                                                # Store usage for end event
                                                last_usage = {
                                                    'input_tokens': usage.get('prompt_tokens', 0),
                                                    'output_tokens': usage.get('completion_tokens', 0),
                                                    'cache_read_tokens': cache_read,
                                                    'cache_write_tokens': cache_write,
                                                }

                                            # Check root level for legacy search results / citations
                                            if 'web_search_results' in data_obj:
                                                yield f"data: {json.dumps({'event': 'search_results', 'data': data_obj['web_search_results']})}\n\n"

                                            if data_obj.get('choices'):
                                                choice = data_obj['choices'][0]
                                                delta = choice.get('delta', {})
                                                finish_reason = choice.get('finish_reason')

                                                if finish_reason:
                                                    got_finish_reason = True
                                                    stream_complete = True

                                                # Check for tool_calls (return_search_results_as_documents strategy)
                                                if 'tool_calls' in delta and delta['tool_calls']:
                                                    for tool_call in delta['tool_calls']:
                                                        fn_name = tool_call.get('function', {}).get('name')
                                                        if fn_name in ['venice_web_search_documents', 'web_search']:
                                                            args_str = tool_call['function'].get('arguments', '{}')
                                                            try:
                                                                args = json.loads(args_str)
                                                                if 'documents' in args:
                                                                    yield f"data: {json.dumps({'event': 'search_results', 'data': args['documents']})}\n\n"
                                                            except json.JSONDecodeError:
                                                                pass

                                                if 'content' in delta:
                                                    content = delta['content']
                                                    if content:
                                                        if is_e2ee:
                                                            if is_hex_encrypted(content):
                                                                try:
                                                                    content = decrypt_chunk(content, e2ee_session_priv)
                                                                except Exception as e:
                                                                    logger.warning(f"[E2EE] Chunk decrypt failed ({len(content)} chars): {e}")
                                                                    continue
                                                            else:
                                                                logger.warning(f"[E2EE] Unencrypted content chunk (len={len(content)}): {content[:80]!r}")
                                                        # Strip thinking tags for GLM models
                                                        if strip_thinking:
                                                            thinking_buffer += content
                                                            # Check for complete thinking blocks
                                                            while '<think>' in thinking_buffer and '</think>' in thinking_buffer:
                                                                start = thinking_buffer.find('<think>')
                                                                end = thinking_buffer.find('</think>') + len('</think>')
                                                                thinking_buffer = thinking_buffer[:start] + thinking_buffer[end:]
                                                            # If we're in the middle of a thinking tag, buffer it
                                                            if '<think>' in thinking_buffer and '</think>' not in thinking_buffer:
                                                                # Only yield content before the opening tag
                                                                start = thinking_buffer.find('<think>')
                                                                to_yield = thinking_buffer[:start]
                                                                thinking_buffer = thinking_buffer[start:]
                                                            else:
                                                                to_yield = thinking_buffer
                                                                thinking_buffer = ""
                                                            if to_yield:
                                                                safe, lore_events = _process_lore_chunk(to_yield, lore_buf, char_name)
                                                                full_response += safe
                                                                for ev in lore_events:
                                                                    yield f"data: {ev}\n\n"
                                                                if safe:
                                                                    yield f"data: {json.dumps({'event': 'chunk', 'content': safe})}\n\n"
                                                        else:
                                                            safe, lore_events = _process_lore_chunk(content, lore_buf, char_name)
                                                            full_response += safe
                                                            for ev in lore_events:
                                                                yield f"data: {ev}\n\n"
                                                            if safe:
                                                                yield f"data: {json.dumps({'event': 'chunk', 'content': safe})}\n\n"
                                                
                                                if 'reasoning_content' in delta:
                                                    reasoning = delta['reasoning_content']
                                                    if reasoning:
                                                        if is_e2ee and is_hex_encrypted(reasoning):
                                                            try:
                                                                reasoning = decrypt_chunk(reasoning, e2ee_session_priv)
                                                            except Exception as e:
                                                                logger.warning(f"[E2EE] reasoning_content decrypt failed: {e}")
                                                                reasoning = None
                                                        if reasoning and not strip_thinking:
                                                            yield f"data: {json.dumps({'event': 'reasoning', 'content': reasoning})}\n\n"

                                                if 'reasoning' in delta:
                                                    reasoning = delta['reasoning']
                                                    if reasoning:
                                                        if is_e2ee and is_hex_encrypted(reasoning):
                                                            try:
                                                                reasoning = decrypt_chunk(reasoning, e2ee_session_priv)
                                                            except Exception as e:
                                                                logger.warning(f"[E2EE] reasoning decrypt failed: {e}")
                                                                reasoning = None
                                                        if reasoning:
                                                            yield f"data: {json.dumps({'event': 'reasoning', 'content': reasoning})}\n\n"
                                        except json.JSONDecodeError:
                                            continue

                    # Check if stream completed properly
                    if stream_complete or got_finish_reason:
                        break  # Success, exit retry loop
                    else:
                        # Stream ended without finish_reason - retry
                        logger.warning(f"Stream ended without finish_reason, will retry")
                        if retry < MAX_RETRIES - 1:
                            time.sleep(1)  # Brief pause before retry
                            full_response = ""  # Reset for retry
                            lore_buf[0] = ""
                            continue
                        else:
                            yield f"data: {json.dumps({'event': 'error', 'error': 'Stream ended unexpectedly after multiple retries'})}\n\n"

                except (httpx.ReadTimeout, httpx.RemoteProtocolError, httpx.StreamClosed) as e:
                    logger.warning(f"Stream error on attempt {retry+1}: {e}")
                    if retry < MAX_RETRIES - 1:
                        yield f"data: {json.dumps({'event': 'status', 'message': f'Connection issue, retrying ({retry+1}/{MAX_RETRIES})...'})}\n\n"
                        time.sleep(2 ** retry)
                        full_response = ""  # Reset for retry
                        lore_buf[0] = ""
                        continue
                    else:
                        raise

            # Flush lore buffer (catches signals split across final chunks)
            remaining, lore_events = _flush_lore_buf(lore_buf, char_name)
            for ev in lore_events:
                yield f"data: {ev}\n\n"
            if remaining:
                full_response += remaining
                yield f"data: {json.dumps({'event': 'chunk', 'content': remaining})}\n\n"

            end_event = {'event': 'end', 'model': model_name}
            if last_usage:
                end_event['usage'] = last_usage
            yield f"data: {json.dumps(end_event)}\n\n"

        except Exception as e:
            logger.error(f"!!! CRITICAL ERROR in /api/chat stream: {e}", exc_info=True)
            error_event = {"event": "error", "error": str(e)}
            yield f"data: {json.dumps(error_event)}\n\n"
        
        finally:

            # AFTER streaming completes (success or fail): trigger background summarization + RAG chunking
            # This ensures that if a request fails due to context length, we still generate a summary for the retry
            try:
                updated_msgs = messages
                if full_response:
                    updated_msgs = messages + [{"role": "assistant", "content": full_response}]
                trigger_background_summarization(updated_msgs, model_name, api_key, new_chat_id)
                if parent_config:
                    trigger_background_chunking(new_chat_id, updated_msgs)
            except Exception as e:
                logger.error(f"Failed to trigger background summarization in finally block: {e}")

    return Response(generate(), mimetype='text/event-stream')


@chat_bp.route('/api/save_chat', methods=['POST'])
def save_chat():
    data = request.json
    chat_id = data.get('chat_id')
    messages = data.get('messages', [])
    config = data.get('config', {})
    parent_config = data.get('parent_config')
    display_name = data.get('display_name')
    kept_messages = data.get('kept_messages', [])

    if not chat_id:
        return jsonify({"error": "chat_id is required to save."}), 400

    try:
        if not display_name:
            display_name = get_chat_display_name(messages)

        chat_data_to_save = {
            'chat_id': chat_id,
            'display_name': display_name,
            'parent_config': parent_config,
            'messages': messages,
            'config': config,
            'kept_messages': kept_messages
        }

        filepath = os.path.join(CHATS_DIR, chat_id)
        with open(filepath, 'w') as f:
            json.dump(chat_data_to_save, f, indent=4)

        return jsonify({"success": True, "message": "Chat saved.", "display_name": display_name})

    except Exception as e:
        logger.error(f"!!! CRITICAL ERROR in /api/save_chat: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@chat_bp.route('/api/import_chat', methods=['POST'])
def import_chat():
    """Import a Venice chat log and create a new chat from it."""
    data = request.json
    raw_text = data.get('text', '')
    config = data.get('config', {})
    display_name = data.get('display_name', 'Imported Chat')

    if not raw_text.strip():
        return jsonify({"error": "No chat text provided"}), 400

    try:
        messages = []

        # Strip out <ip_reminder> tags and their content
        raw_text = re.sub(r'<ip_reminder>.*?</ip_reminder>', '', raw_text, flags=re.DOTALL)

        # Format 1: Venice legacy format — ***date - Role:*** headers with --- separators
        blocks = raw_text.split('---')
        for block in blocks:
            block = block.strip()
            if not block:
                continue
            header_match = re.search(r'\*\*\*.*? - (Venice|User):\*\*\*', block)
            if header_match:
                role_text = header_match.group(1)
                role = 'assistant' if role_text == 'Venice' else 'user'
                content = block[header_match.end():].strip()
                if content:
                    messages.append({'role': role, 'content': content})

        # Format 2: Lagoon export format — [USER]: / [ASSISTANT]: prefixes
        if not messages:
            lagoon_parts = re.split(r'\n?\[(USER|ASSISTANT)\]:\s*', raw_text)
            for i in range(1, len(lagoon_parts), 2):
                if i + 1 < len(lagoon_parts):
                    role_text = lagoon_parts[i]
                    content = lagoon_parts[i + 1].strip()
                    content = re.sub(r'\s*\n---\s*$', '', content).strip()
                    if content:
                        role = 'user' if role_text == 'USER' else 'assistant'
                        messages.append({'role': role, 'content': content})

        if not messages:
            return jsonify({"error": "Could not parse any messages from the text"}), 400

        # Create chat file
        chat_id = f"{uuid.uuid4()}.json"

        default_config = {
            'character_name': display_name,
            'model': 'qwen3-235b-a22b-instruct-2507',
            'system_prompt': '',
            'character_card': '',
            'system_context': '',
            'temperature': 0.7,
            'top_p': 1.0,
            'max_tokens': 4096,
            'enable_web_search': False,
            'include_venice_system_prompt': True,
            'avatar_url': None,
            'fiction_prompt_text': ''
        }
        default_config.update(config)

        chat_data = {
            'chat_id': chat_id,
            'display_name': display_name,
            'parent_config': config.get('parent_config'),  # Link to character if provided
            'messages': messages,
            'config': default_config
        }

        filepath = os.path.join(CHATS_DIR, chat_id)
        with open(filepath, 'w') as f:
            json.dump(chat_data, f, indent=4)

        return jsonify({
            "success": True,
            "chat_id": chat_id,
            "message_count": len(messages),
            "display_name": display_name
        })

    except Exception as e:
        logger.error(f"Error importing chat: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@chat_bp.route('/api/analyze_edit', methods=['POST'])
def analyze_edit():
    """Analyze user's edit to learn style preferences."""
    logger.info("[StyleLearn] analyze_edit endpoint called")
    data = request.json
    original = data.get('original', '')
    edited = data.get('edited', '')
    api_key = get_api_key()

    logger.info(f"[StyleLearn] original len={len(original)}, edited len={len(edited)}, has_key={bool(api_key)}")

    if not api_key or not original or not edited:
        logger.warning(f"[StyleLearn] Missing data: api_key={bool(api_key)}, original={bool(original)}, edited={bool(edited)}")
        return jsonify({"error": "Missing data"}), 400

    # Truncate to avoid huge prompts
    original_truncated = original[:3000]
    edited_truncated = edited[:3000]

    analysis_prompt = f"""You are analyzing a writing edit. Report ONLY what ACTUALLY changed - nothing more, nothing less.

ORIGINAL (AI):
{original_truncated}

EDITED (User):
{edited_truncated}

Return JSON:

{{
  "word_substitutions": [{{"from": "exact text from original", "to": "exact text from edit", "confidence": "high|low"}}],
  "deleted_phrases": ["exact text removed"],
  "added_terms": ["exact text added"],
  "structural_pattern": "description of length/rhythm change OR empty string",
  "example_pair": {{"before": "sentence that changed", "after": "how it looks now"}} OR null
}}

CRITICAL RULES:
1. word_substitutions: Quote EXACT text that was replaced. If "cat" became "dog", that's the substitution. Do NOT invent changes.
2. deleted_phrases: Only text that exists in ORIGINAL but is GONE from EDITED. Quote it exactly.
3. added_terms: Only text that exists in EDITED but was NOT in ORIGINAL. Quote it exactly.
4. example_pair: ONLY include if there is an actual before/after difference. If nothing meaningful changed, use null.
5. DO NOT list unchanged sentences as "changed". If a sentence is identical in both, it did NOT change.

VERIFICATION: Before writing each entry, verify the "from" text exists in ORIGINAL and "to" text exists in EDITED.

Return ONLY the JSON."""

    try:
        logger.info("[StyleLearn] Calling Venice API with venice-uncensored...")
        # Increased timeout for reasoning models which are slower
        with httpx.Client(timeout=120.0) as client:
            response = client.post(
                f"{VENICE_API_BASE}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "venice-uncensored",
                    "messages": [{"role": "user", "content": analysis_prompt}],
                    "temperature": 0.3,
                    "max_tokens": 2000,
                    "stream": False,
                    "venice_parameters": {
                        "include_venice_system_prompt": True
                    }
                }
            )
            if response.status_code != 200:
                logger.error(f"[StyleLearn] API Error {response.status_code}: {response.text}")
            
            logger.info(f"[StyleLearn] API response status: {response.status_code}")
            response.raise_for_status()
            result = response.json()
            logger.info(f"[StyleLearn] Full API response: {result}")
            analysis = result['choices'][0]['message']['content']
            # Strip COT thinking tags if present
            import re
            import json
            analysis = re.sub(r'<think>.*?</think>', '', analysis, flags=re.DOTALL).strip()
            logger.info(f"[StyleLearn] Analysis content: '{analysis}'")
            if not analysis or not analysis.strip():
                logger.warning("[StyleLearn] Empty analysis returned")
                return jsonify({"success": False, "error": "Empty analysis"}), 200
            return jsonify({"success": True, "analysis": analysis.strip()})
    except Exception as e:
        logger.error(f"[StyleLearn] Edit analysis failed: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@chat_bp.route('/api/force_summarize', methods=['POST'])
def force_summarize():
    """Force compact summarization of a chat, appending to the summary stack."""
    data = request.json
    chat_id = data.get('chat_id')

    if not chat_id:
        return jsonify({"error": "chat_id required"}), 400

    api_key = get_api_key()
    if not api_key:
        return jsonify({"error": "API key not configured"}), 400

    filepath = os.path.join(CHATS_DIR, chat_id)
    if not os.path.exists(filepath):
        return jsonify({"error": "Chat not found"}), 404

    try:
        with open(filepath, 'r') as f:
            chat_data = json.load(f)

        messages = data.get('messages') or chat_data.get('messages', [])
        conversation_messages = [m for m in messages if m.get('role') != 'system']

        if len(conversation_messages) < 4:
            return jsonify({"error": "Not enough messages to summarize"}), 400

        prior_summaries = [s for s in load_summary_stack(chat_id) if not s.get('pending_review')]
        msgs_to_keep = min(RECENT_MESSAGES_TO_KEEP * 2, max(4, len(conversation_messages) // 2))

        result = _generate_summary(
            conversation_messages, api_key, chat_id,
            blocking=True, pending_review=True, msgs_to_keep=msgs_to_keep,
            prior_summaries=prior_summaries or None
        )
        if not result:
            return jsonify({"error": "Summarization returned empty content"}), 500

        entry = load_summary_stack(chat_id)[-1]

        return jsonify({
            "success": True,
            "pending_review": True,
            "summary_id": entry["id"],
            "summary": entry["text"],
            "message_count": len(conversation_messages),
        })

    except Exception as e:
        logger.error(f"Force summarize failed: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500



def _extract_overseer_json(raw_text):
    """Bulletproof JSON extraction from chatty model responses."""
    if not raw_text:
        return None
    
    text = raw_text.strip()
    logger.debug(f"[OverseerParser] Input head: {text[:100]}...")

    def _try_parse(candidate):
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict) and 'violations' in parsed:
                return parsed
            if isinstance(parsed, list):
                return {'violations': parsed}
        except:
            pass
        return None

    # 1. Look for JSON blocks in markdown or braces
    # Search for anything between the first { and the last }
    first_brace = text.find('{')
    last_brace = text.rfind('}')
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        candidate = text[first_brace:last_brace+1]
        result = _try_parse(candidate)
        if result: return result

    # 2. Try middle-out extraction (finding the 'violations' key and expanding)
    v_idx = text.find('"violations"')
    if v_idx != -1:
        # Look backwards for the opening {
        start = text.rfind('{', 0, v_idx)
        if start != -1:
            # Look forwards for the closing }
            # Use brace counting to be sure
            depth = 0
            for i in range(start, len(text)):
                if text[i] == '{': depth += 1
                elif text[i] == '}': depth -= 1
                if depth == 0:
                    result = _try_parse(text[start:i+1])
                    if result: return result

    # 3. Fallback: Model is providing a verbal list but no JSON
    logger.warning("[OverseerParser] No JSON structure found. Attempting advanced prose extraction.")
    verbal_violations = []
    
    # Strategy 3a: Look for "offending" -> "correction" or "offending" should be "correction"
    matches = re.findall(r'["\'](.*?)["\']\s*(?:->|should be|to|=>)\s*["\'](.*?)["\']', text)
    for i, (offending, correction) in enumerate(matches):
        verbal_violations.append({
            "rule": i + 1, "scope": "local", "excerpt": offending[:100],
            "replacement": correction, "suggestion": "Extracted from correction pair"
        })
    
    # Strategy 3b: Look for "text" - [TYPE] VIOLATION (as seen in your logs)
    if not verbal_violations:
        # Match: - "Amy looks at me." - PRESENT TENSE VIOLATION
        violation_matches = re.findall(r'[-*]?\s*["\'](.*?)["\']\s*[-–]\s*(?:.*?)VIOLATION', text, re.IGNORECASE)
        for i, offending in enumerate(violation_matches):
            # Simple heuristic for past-tense correction if not provided
            correction = offending.replace("looks", "looked").replace("says", "said").replace("moves", "moved").replace("is ", "was ").replace("are ", "were ")
            verbal_violations.append({
                "rule": i + 1, "scope": "local", "excerpt": offending[:100],
                "replacement": correction, "suggestion": "Prose violation flagged"
            })

    if verbal_violations:
        logger.info(f"[OverseerParser] Regex fallback succeeded: found {len(verbal_violations)} issues")
        return {"violations": verbal_violations}

    logger.error(f"[OverseerParser] FAILED ALL EXTRACTION. Content: {text[:500]}")
    return None


@chat_bp.route('/api/overseer_check', methods=['POST'])
def overseer_check():
    """
    Style overseer: LLM-only review of an assistant response.
    Returns { violations: [{ rule, excerpt, suggestion }] }
    """
    logger.info("[Overseer] Request received")
    data = request.json
    text = (data.get('response_text') or '').strip()
    custom_rules = [r.strip() for r in (data.get('custom_rules') or []) if isinstance(r, str) and r.strip()]
    use_builtin_rules = data.get('use_builtin_rules', True)
    overseer_model = data.get('overseer_model') or 'grok-4-20-beta'
    logger.info(f"[Overseer] Model: {overseer_model}, Text length: {len(text)}, custom rules: {len(custom_rules)}, builtin: {use_builtin_rules}")
    if not text:
        return jsonify({"violations": []})

    api_key = get_api_key()
    logger.info(f"[Overseer] API key present: {bool(api_key)}")
    if not api_key:
        return jsonify({"violations": []})

    builtin_rules = [
        "No isolated single sentences standing alone as their own paragraph (dramatic line isolation)",
        "No double blank lines between paragraphs",
        "Strict 3rd person limited POV — do not narrate another character's inner state or intent",
        "No correction acknowledgment — phrases like 'I've adjusted', 'I've corrected', 'you're right', 'noted', 'as you said' break the fiction frame",
        "No verbatim echo of the user's input phrasing",
        "No unattributed dialogue — every dialogue line must have a clear speaker via tag or adjacent action",
    ]
    all_rules = (builtin_rules if use_builtin_rules else []) + custom_rules
    rules_text = "\n".join(f"RULE {i+1} — {r}" for i, r in enumerate(all_rules))
    
    overseer_system = (
        "### ROLE: SILENT PROSE VALIDATOR\n"
        "You return ONLY valid JSON. You never explain your process. You never say 'I found'.\n\n"
        f"### RULES TO ENFORCE:\n{rules_text}\n\n"
        "### OUTPUT FORMAT:\n"
        "Return exactly this structure:\n"
        "{\n"
        "  \"violations\": [\n"
        "    { \"rule\": N, \"scope\": \"local\", \"excerpt\": \"exact offending text\", \"replacement\": \"corrected version\", \"suggestion\": \"...\" }\n"
        "  ]\n"
        "}"
    )

    overseer_user = (
        "### TASK: Flag all rule violations in the TEXT below.\n"
        "### RESPONSE MANDATE: Output JSON only. If zero violations, return {\"violations\": []}.\n\n"
        f"TEXT:\n{text[:4000]}\n\n"
        "### JSON OUTPUT:"
    )

    violations = []
    try:
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(
                f"{VENICE_API_BASE}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": overseer_model,
                    "messages": [
                        {"role": "system", "content": overseer_system},
                        {"role": "user", "content": overseer_user}
                    ],
                    "temperature": 0.1, "max_tokens": 4000, "stream": False,
                    "venice_parameters": {
                        "include_venice_system_prompt": False,
                        "strip_thinking_response": False
                    }
                }
            )
            logger.info(f"[Overseer] API status: {resp.status_code}")
            if resp.status_code == 200:
                msg = resp.json()['choices'][0]['message']
                # Combine all possible fields where the JSON might be hiding
                raw = (msg.get('content') or '') + (msg.get('reasoning_content') or '') + (msg.get('thought') or '')
                logger.info(f"[Overseer] Raw response length: {len(raw)}")
                parsed = _extract_overseer_json(raw)
                if parsed:
                    violations = parsed.get('violations', [])
                    logger.info(f"[Overseer] Violations found: {len(violations)}")
                else:
                    logger.warning(f"[Overseer] No JSON found in response: {raw[:500]}")
            else:
                logger.warning(f"[Overseer] API error {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        logger.warning(f"[Overseer] LLM check failed: {e}")

    return jsonify({"violations": violations})


@chat_bp.route('/api/preview_prompt', methods=['POST'])
def preview_prompt():
    """Assemble the full prompt exactly as the LLM would receive it, without calling the API."""
    data = request.json
    messages = data.get('messages', [])
    config = data.get('config', {})
    chat_id = data.get('chat_id')
    parent_config = data.get('parent_config')

    api_key = get_api_key()
    if not api_key:
        return jsonify({"error": "API key not configured"}), 400

    try:
        model_name = config.get('model', DEFAULT_MODEL)

        # 1. Context management (summary stack injection + pruning)
        messages, _, _ = manage_context(messages, model_name, api_key, chat_id=chat_id, summarize_mode='off')

        # 2. Fiction framing
        if config.get('uncensored_mode'):
            fiction_text = config.get('fiction_prompt_text') or CREATIVE_FICTION_SYSTEM_PROMPT
            messages = [{"role": "system", "content": fiction_text}] + messages

        # 3. RAG
        rag_count = 0
        last_user_msg = next(
            (m.get('content', '') for m in reversed(messages) if m.get('role') == 'user'), ''
        )
        if isinstance(last_user_msg, list):
            last_user_msg = ' '.join(p.get('text', '') for p in last_user_msg if isinstance(p, dict))
        if chat_id and last_user_msg and parent_config:
            rag_msgs = rag_retrieve(chat_id, last_user_msg, exclude_last_n=1)
            if rag_msgs:
                rag_count = len(rag_msgs)
                last_sys_idx = max((i for i, m in enumerate(messages) if m.get('role') == 'system'), default=-1)
                for j, rm in enumerate(rag_msgs):
                    messages.insert(last_sys_idx + 1 + j, rm)

        # 4. Anchors — get matched metadata AND inject
        lore_matched = []
        char_name = parent_config.replace('.json', '') if parent_config else None
        if parent_config:
            lore_matched = lore_get_matched(messages, char_name)
            lore_msgs = lore_scan(messages, char_name, char_name)
            if lore_msgs:
                last_sys_idx = max((i for i, m in enumerate(messages) if m.get('role') == 'system'), default=-1)
                for j, lm in enumerate(lore_msgs):
                    messages.insert(last_sys_idx + 1 + j, lm)

        # 5. Author's note at depth
        author_note_index = -1
        author_note = config.get('author_note', '').strip()
        if author_note and parent_config:
            depth = max(1, int(config.get('author_note_depth', 4)))
            note_msg = {"role": "system", "content": f"[Author's Note]\n{author_note}"}
            non_sys_count = sum(1 for m in messages if m.get('role') != 'system')
            insert_from_end = min(depth, non_sys_count)
            if insert_from_end > 0:
                counted = 0
                insert_pos = len(messages)
                for i in range(len(messages) - 1, -1, -1):
                    if messages[i].get('role') != 'system':
                        counted += 1
                        if counted == insert_from_end:
                            insert_pos = i
                            break
                messages.insert(insert_pos, note_msg)
                author_note_index = insert_pos
            else:
                last_sys_idx = max((i for i, m in enumerate(messages) if m.get('role') == 'system'), default=-1)
                insert_pos = last_sys_idx + 1
                messages.insert(insert_pos, note_msg)
                author_note_index = insert_pos

        token_count = count_message_tokens(messages)

        return jsonify({
            "messages": messages,
            "token_count": token_count,
            "lore_matched": lore_matched,
            "rag_count": rag_count,
            "author_note_index": author_note_index,
        })

    except Exception as e:
        logger.error(f"[preview_prompt] Error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@chat_bp.route('/api/generate_detailed_summary', methods=['POST'])
def generate_detailed_summary_route():
    """Generate a detailed structured summary for user review (manual mode). Does NOT save."""
    data = request.json
    chat_id = data.get('chat_id')
    messages = data.get('messages', [])

    api_key = get_api_key()
    if not api_key:
        return jsonify({"error": "API key not configured"}), 400

    conversation_messages = [m for m in messages if m.get('role') != 'system']
    if len(conversation_messages) < 4:
        return jsonify({"error": "Not enough messages to summarize"}), 400

    summary_text = generate_detailed_summary(conversation_messages, api_key)
    if not summary_text:
        return jsonify({"error": "Summary generation failed"}), 500

    return jsonify({"summary_text": summary_text})


@chat_bp.route('/api/apply_summary', methods=['POST'])
def apply_summary_route():
    """Apply a user-curated summary: append to stack, prune old messages, sync to disk."""
    data = request.json
    chat_id = data.get('chat_id')
    summary_text = data.get('summary_text', '').strip()
    messages_to_drop_count = data.get('messages_to_drop_count', 0)
    messages = data.get('messages', [])

    if not chat_id or not summary_text:
        return jsonify({"error": "chat_id and summary_text required"}), 400

    conversation_messages = [m for m in messages if m.get('role') != 'system']
    # Strip legacy injected summary messages from system msgs
    config_system = [m for m in messages if m.get('role') == 'system'
                     and not m.get('content', '').startswith('[SUMMARY')]

    if messages_to_drop_count > 0:
        conversation_messages = conversation_messages[messages_to_drop_count:]

    append_to_summary_stack(chat_id, summary_text, messages_to_drop_count, 'user-curated')

    # Store raw only (no summary injections)
    raw_to_store = config_system + conversation_messages
    _sync_to_disk(chat_id, raw_to_store)

    return jsonify({"success": True, "messages": raw_to_store})


@chat_bp.route('/api/summary_stack', methods=['POST'])
def summary_stack_route():
    """Return the full summary stack for a chat."""
    data = request.json
    chat_id = data.get('chat_id')
    if not chat_id:
        return jsonify({"error": "chat_id required"}), 400
    summaries = load_summary_stack(chat_id)
    return jsonify({"summaries": summaries})


@chat_bp.route('/api/delete_summary', methods=['POST'])
def delete_summary_route():
    """Remove a specific summary entry from the stack by ID."""
    data = request.json
    chat_id = data.get('chat_id')
    summary_id = data.get('summary_id')

    if not chat_id or not summary_id:
        return jsonify({"error": "chat_id and summary_id required"}), 400

    deleted = delete_summary_entry(chat_id, summary_id)
    if not deleted:
        return jsonify({"error": "Summary not found"}), 404

    # No disk rebuild needed — the chat file already has only raw messages.
    # The stack file was already updated by delete_summary_entry().
    return jsonify({"success": True})


@chat_bp.route('/api/approve_summary', methods=['POST'])
def approve_summary_route():
    """Approve a pending-review summary: clears pending flag, prunes messages to disk."""
    data = request.json
    chat_id = data.get('chat_id')
    summary_id = data.get('summary_id')
    messages = data.get('messages', [])

    if not chat_id or not summary_id:
        return jsonify({"error": "chat_id and summary_id required"}), 400

    pruned = approve_pending_summary(chat_id, summary_id, messages)
    if pruned is None:
        return jsonify({"error": "Summary not found or not pending review"}), 404

    return jsonify({"success": True, "messages": pruned})


@chat_bp.route('/api/context_status', methods=['POST'])
def context_status():
    """Return context usage info, accounting for cached summary stack."""
    data = request.json
    chat_id = data.get('chat_id')
    messages = data.get('messages', [])
    model_name = data.get('model', DEFAULT_MODEL)

    context_window = CONTEXT_WINDOWS.get(model_name, DEFAULT_CONTEXT_WINDOW)
    raw_tokens = count_message_tokens(messages)

    summaries = load_summary_stack(chat_id) if chat_id else []
    has_summary = len(summaries) > 0
    total_summary_msgs = sum(s.get('message_count', 0) for s in summaries)

    # Estimate effective tokens (what would actually be sent after context management)
    effective_tokens = raw_tokens
    if has_summary:
        conversation_messages = [m for m in messages if m.get('role') != 'system']
        if len(conversation_messages) > RECENT_MESSAGES_TO_KEEP * 2 + 4:
            recent_messages = conversation_messages[-RECENT_MESSAGES_TO_KEEP * 2:]
            from services.context import build_summary_messages
            summary_msgs = build_summary_messages(summaries)
            system_messages = [m for m in messages if m.get('role') == 'system'
                               and not m.get('content', '').startswith('[SUMMARY')]
            effective_tokens = (count_message_tokens(system_messages) +
                                count_message_tokens(summary_msgs) +
                                count_message_tokens(recent_messages))

    raw_percent = min(100, round((raw_tokens / context_window) * 100))
    effective_percent = min(100, round((effective_tokens / context_window) * 100))

    return jsonify({
        "raw_tokens": raw_tokens,
        "effective_tokens": effective_tokens,
        "context_window": context_window,
        "raw_percent": raw_percent,
        "effective_percent": effective_percent,
        "has_summary": has_summary,
        "summary_count": len(summaries),
        "summary_message_count": total_summary_msgs
    })


@chat_bp.route('/api/tts', methods=['POST'])
def tts_stream():
    """Stream Text-to-Speech using Venice or Google AI."""
    data = request.json
    text = data.get('text', '')
    provider = data.get('provider', 'venice')
    voice = data.get('voice', 'af_sky')
    speed = float(data.get('speed', 1.0))
    
    if not text:
        return jsonify({"error": "No text provided"}), 400

    print(f"--- [TTS DEBUG] Provider received: '{provider}', Voice: '{voice}'")

    try:
        if provider == 'google':
            from services.storage import get_google_api_key
            google_key = get_google_api_key()
            if not google_key:
                return jsonify({"error": "Google API Key not configured."}), 400

            import base64

            # Use specialized Pro TTS preview model for high-fidelity speech synthesis
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-tts:streamGenerateContent?key={google_key}&alt=sse"

            payload = {
                "contents": [{"parts": [{"text": text}]}],
                "generationConfig": {
                    "responseModalities": ["AUDIO"],
                    "speechConfig": {
                        "voiceConfig": {
                            "prebuiltVoiceConfig": {"voiceName": voice}
                        }
                    }
                }
            }

            print(f"--- [TTS DEBUG] Streaming Gemini TTS for: {text[:30]}... (Voice: {voice})")

            # Collect all PCM from stream, wrap in WAV — frontend decodes via decodeAudioData
            pcm_chunks = []
            with httpx.Client(timeout=120.0) as client:
                with client.stream("POST", url, json=payload) as response:
                    if response.status_code != 200:
                        print(f"--- [TTS ERROR] Gemini API returned {response.status_code}: {response.read().decode('utf-8', errors='ignore')[:200]}")
                        return jsonify({"error": f"Gemini TTS error {response.status_code}"}), 500
                    for line in response.iter_lines():
                        if line.startswith('data: '):
                            try:
                                chunk_data = json.loads(line[6:])
                                candidates = chunk_data.get('candidates', [])
                                if candidates:
                                    parts = candidates[0].get('content', {}).get('parts', [])
                                    for part in parts:
                                        if 'inlineData' in part:
                                            audio_b64 = part['inlineData'].get('data', '')
                                            if audio_b64:
                                                pcm_chunks.append(base64.b64decode(audio_b64))
                            except json.JSONDecodeError:
                                continue

            pcm_data = b''.join(pcm_chunks)
            if not pcm_data:
                return jsonify({"error": "No audio data returned"}), 500

            # Wrap raw 16-bit 24kHz mono PCM in a WAV container
            import struct
            sample_rate = 24000
            num_channels = 1
            bits_per_sample = 16
            byte_rate = sample_rate * num_channels * bits_per_sample // 8
            block_align = num_channels * bits_per_sample // 8
            data_size = len(pcm_data)
            wav_header = struct.pack(
                '<4sI4s4sIHHIIHH4sI',
                b'RIFF', 36 + data_size, b'WAVE',
                b'fmt ', 16, 1, num_channels, sample_rate,
                byte_rate, block_align, bits_per_sample,
                b'data', data_size
            )
            return Response(
                wav_header + pcm_data,
                mimetype='audio/wav',
                headers={'Content-Length': str(len(wav_header) + data_size)}
            )
        else:
            api_key = get_api_key()
            if not api_key:
                return jsonify({"error": "Venice API Key not configured."}), 400
                
            url = f"{VENICE_API_BASE}/audio/speech"
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            
            # Map friendly names to Venice IDs
            VENICE_VOICE_MAP = {
                'Aoede': 'af_aoede', 'Alloy': 'af_alloy', 'Bella': 'af_bella', 
                'Heart': 'af_heart', 'Jadzia': 'af_jadzia', 'Jessica': 'af_jessica',
                'Kore': 'af_kore', 'Nicole': 'af_nicole', 'Nova': 'af_nova', 
                'River': 'af_river', 'Sarah': 'af_sarah', 'Sky': 'af_sky',
                'Adam': 'am_adam', 'Echo': 'am_echo', 'Eric': 'am_eric', 
                'Fenrir': 'am_fenrir', 'Liam': 'am_liam', 'Michael': 'am_michael',
                'Onyx': 'am_onyx', 'Puck': 'am_puck', 'Santa': 'am_santa',
                'Alice': 'bf_alice', 'Emma': 'bf_emma', 'Lily': 'bf_lily',
                'Daniel': 'bm_daniel', 'Fable': 'bm_fable', 'George': 'bm_george',
                'Lewis': 'bm_lewis'
            }
            
            # Use mapped voice if available, otherwise fallback to original
            voice_id = VENICE_VOICE_MAP.get(voice, voice)
            
            # Try different voice formats - Venice API might expect different format
            # First try the mapped/original format, then try with dashes
            if '_' in voice_id:
                # Try af_sky format first, then af-sky
                voice_options = [voice_id, voice_id.replace('_', '-')]
            else:
                voice_options = [voice_id]
            
            # Try each voice format
            for voice_attempt in voice_options:
                payload = {
                    "input": text,
                    "model": "tts-kokoro",
                    "voice": voice_attempt,
                    "response_format": "mp3",
                    "speed": speed
                }
                
                print(f"--- [TTS DEBUG] Trying Venice voice format: {voice_attempt}")
                print(f"--- [TTS DEBUG] URL: {url}")
                print(f"--- [TTS DEBUG] Payload: {payload}")
                
                with httpx.Client(timeout=60.0) as client:
                    response = client.post(url, headers=headers, json=payload)
                    print(f"--- [TTS DEBUG] Response Status: {response.status_code}")
                    
                    if response.status_code == 200:
                        print(f"--- [TTS DEBUG] Success with voice: {voice_attempt}")
                        audio_data = response.content
                        mimetype = "audio/mpeg"
                        return Response(audio_data, mimetype=mimetype)
                    elif response.status_code == 400:
                        print(f"--- [TTS DEBUG] Failed with voice {voice_attempt}: {response.text}")
                        if voice_attempt == voice_options[-1]:
                            # This was the last attempt, raise the error
                            response.raise_for_status()
                        else:
                            # Try next voice format
                            continue
                    else:
                        # Non-400 error, raise immediately
                        response.raise_for_status()
            
            # If we get here, all attempts failed
            return jsonify({"error": f"TTS failed with all voice formats: {voice_options}"}), 400

            print(f"--- [TTS DEBUG] Requesting Venice Audio for: {text[:30]}... (Voice: {voice})")
            print(f"--- [TTS DEBUG] URL: {url}")
            print(f"--- [TTS DEBUG] Headers: {headers}")
            print(f"--- [TTS DEBUG] Payload: {payload}")
            with httpx.Client(timeout=60.0) as client:
                response = client.post(url, headers=headers, json=payload)
                print(f"--- [TTS DEBUG] Response Status: {response.status_code}")
                if response.status_code != 200:
                    print(f"--- [TTS DEBUG] Response Body: {response.text}")
                response.raise_for_status()
                audio_data = response.content
                mimetype = "audio/mpeg"
            
        return Response(audio_data, mimetype=mimetype)

    except Exception as e:
        print(f"--- [TTS ERROR] {e}")
        logger.error(f"TTS Error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@chat_bp.route('/api/asr', methods=['POST'])
def asr_transcribe():
    """Transcribe audio using Venice ASR (nvidia/parakeet-tdt-0.6b-v3)."""
    import subprocess
    import tempfile
    import os as temp_os

    if 'audio' not in request.files:
        return jsonify({"error": "No audio file provided"}), 400

    audio_file = request.files['audio']

    api_key = get_api_key()
    if not api_key:
        return jsonify({"error": "Venice API Key not configured."}), 400

    try:
        url = f"{VENICE_API_BASE}/audio/transcriptions"

        # Read the audio data
        audio_data = audio_file.read()
        original_filename = audio_file.filename or 'audio.webm'
        content_type = audio_file.content_type or 'audio/webm'

        print(f"--- [ASR DEBUG] Received audio: {len(audio_data)} bytes, filename: {original_filename}, type: {content_type}")

        # Venice supports: WAV, WAVE, FLAC, M4A, AAC, MP4, MP3
        # Browser MediaRecorder typically outputs WebM - need to convert
        supported_types = ['audio/wav', 'audio/wave', 'audio/flac', 'audio/m4a', 'audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/mp3']
        needs_conversion = content_type not in supported_types and 'webm' in content_type.lower()

        if needs_conversion:
            print(f"--- [ASR DEBUG] Converting WebM to WAV using ffmpeg...")
            # Use ffmpeg to convert WebM to WAV
            with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as input_file:
                input_file.write(audio_data)
                input_path = input_file.name

            output_path = input_path.replace('.webm', '.wav')

            try:
                result = subprocess.run([
                    'ffmpeg', '-y', '-i', input_path,
                    '-ar', '16000', '-ac', '1', '-f', 'wav', output_path
                ], capture_output=True, text=True, timeout=30)

                if result.returncode != 0:
                    print(f"--- [ASR ERROR] ffmpeg failed: {result.stderr}")
                    return jsonify({"error": f"Audio conversion failed: {result.stderr}"}), 500

                with open(output_path, 'rb') as f:
                    audio_data = f.read()

                filename = 'audio.wav'
                content_type = 'audio/wav'
                print(f"--- [ASR DEBUG] Converted to WAV: {len(audio_data)} bytes")

            finally:
                # Cleanup temp files
                if temp_os.path.exists(input_path):
                    temp_os.unlink(input_path)
                if temp_os.path.exists(output_path):
                    temp_os.unlink(output_path)
        else:
            filename = original_filename

        # Prepare multipart form data - match Venice API example exactly
        import requests as req

        files = {"file": (filename, audio_data)}
        payload = {
            "model": "nvidia/parakeet-tdt-0.6b-v3",
            "response_format": "json",
            "timestamps": "false"
        }
        headers = {"Authorization": f"Bearer {api_key}"}

        print(f"--- [ASR DEBUG] Sending to Venice: {url}")
        print(f"--- [ASR DEBUG] Payload: {payload}")

        response = req.post(url, data=payload, files=files, headers=headers, timeout=60)

        print(f"--- [ASR DEBUG] Response Status: {response.status_code}")

        if response.status_code != 200:
            print(f"--- [ASR ERROR] Response: {response.text}")
            return jsonify({"error": f"ASR API error: {response.text}"}), response.status_code

        result = response.json()
        transcript = result.get('text', '')

        print(f"--- [ASR DEBUG] Transcript: {transcript}")

        return jsonify({"success": True, "text": transcript})

    except Exception as e:
        print(f"--- [ASR ERROR] {e}")
        logger.error(f"ASR Error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500
