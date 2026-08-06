"""
Trio Chat Route
Handles three-way conversations: 2 AI characters + 1 human user.

COMPREHENSIVE LOGGING GUIDE:
- All logs use [Trio] prefix for easy filtering
- DEBUG level: detailed flow, state changes, token-by-token info
- INFO level: key decisions, routing results, interrupt fires
- WARNING level: unexpected but handled situations
- ERROR level: failures with full traceback

To enable trio debug logging in terminal:
  export TRIO_DEBUG=1
Or in Flask console:
  import logging; logging.getLogger('routes.trio').setLevel(logging.DEBUG)
  logging.getLogger('services.trio').setLevel(logging.DEBUG)
"""
import os
import re
import json
import logging
import httpx
import time
from flask import Blueprint, request, jsonify, Response
from config import CHATS_DIR, CONFIG_DIR, VENICE_API_BASE, DEFAULT_MODEL
from services.storage import get_api_key, get_together_api_key, get_zai_api_key
from services.installed_models import load as load_installed_models
from services.trio.combo_prompt import build_combo_prompt, build_trio_messages
from services.trio.addressing import resolve_addressee, update_trio_state
from services.trio.token_buffer import TokenBufferQueue
from services.trio.interrupt_monitor import InterruptMonitor, truncate_at_boundary
from services.trio.logging_utils import TrioLogger

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# Session ID for correlating logs across a single request
_request_counter = 0
def _session_id():
    global _request_counter
    _request_counter += 1
    return f"T{_request_counter:04d}"

trio_bp = Blueprint('trio', __name__)


def _load_character_config(config_name):
    """Load a character config from the configs/ directory."""
    if not config_name:
        return None
    filename = config_name if config_name.endswith('.json') else config_name + '.json'
    path = os.path.join(CONFIG_DIR, filename)
    try:
        with open(path) as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"[Trio] Failed to load character config {config_name}: {e}")
        return None


def _build_participants(trio_config):
    """
    Build participant dicts from trio config.
    Each participant has: label, display_name, system_prompt, character_card,
    system_context, color, avatar, name_variants, addressing_keywords,
    interrupt_keywords, patience_threshold, patience_interrupt_probability,
    patience_decay, reaction_probability
    """
    participants = []
    char_configs = trio_config.get('participants', [])

    # Default colors
    default_colors = ['#e85d4a', '#4a9eff']

    for i, char_ref in enumerate(char_configs):
        if isinstance(char_ref, dict):
            cfg = char_ref
            config_name = cfg.get('config_name', f'character_{i}')
            # If config_name is provided, load the full config and merge
            if config_name and config_name != f'character_{i}':
                loaded = _load_character_config(config_name)
                if loaded:
                    loaded.update(cfg)
                    cfg = loaded
        else:
            config_name = char_ref
            cfg = _load_character_config(config_name)

        if not cfg:
            logger.warning(f"[Trio] Could not load participant {i}: {char_ref}")
            continue

        # label: prefer 'label' (plan format), fall back to 'trio_label'
        label = cfg.get('label') or cfg.get('trio_label') or _derive_label(cfg.get('character_name', f'char{i}'))
        display_name = cfg.get('character_name', label)

        participants.append({
            'label': label,
            'display_name': display_name,
            'system_prompt': cfg.get('system_prompt', ''),
            'character_card': cfg.get('character_card', ''),
            'system_context': cfg.get('system_context', ''),
            'color': cfg.get('trio_color', cfg.get('color', default_colors[i % len(default_colors)])),
            'avatar': cfg.get('avatar_url', ''),
            'name_variants': cfg.get('name_variants', [display_name, label]),
            'addressing_keywords': cfg.get('addressing_keywords', []),
            'interrupt_keywords': cfg.get('interrupt_keywords', []),
            'patience_threshold': cfg.get('patience_threshold', 400),
            'patience_interrupt_probability': cfg.get('patience_interrupt_probability', 0.15),
            'patience_decay': cfg.get('patience_decay', 0.05),
            'max_interrupts': cfg.get('max_interrupts', 3),
            'interrupt_cooldown': cfg.get('interrupt_cooldown', 500),
            'reaction_probability': cfg.get('reaction_probability', 0.35),
            'model': cfg.get('model', ''),
            'temperature': cfg.get('temperature', 0.7),
            'max_tokens': cfg.get('max_tokens', 2048),
            'config_name': config_name if isinstance(char_ref, (str,)) else None,
        })

    return participants


def _derive_label(name):
    """Derive a lowercase label from a display name."""
    return re.sub(r'[^a-z0-9]', '', name.split()[0].lower()) if name else 'unknown'


def _infer_provider(model_id, config):
    """Return provider from config, falling back to installed_models lookup."""
    explicit = config.get('provider')
    if explicit:
        return explicit
    if model_id:
        data = load_installed_models()
        entry = next((m for m in data.get('models', []) if m['id'] == model_id), None)
        if entry:
            return entry.get('provider', 'venice')
    return 'venice'


def _get_api_target(model_name, config, data):
    """Determine API base URL and key for a model."""
    provider = _infer_provider(model_name, config)
    api_key = get_api_key()

    if provider == 'ollama':
        ollama_url = (data.get('ollama_url') or 'http://localhost:11434').rstrip('/')
        return ollama_url + '/v1', 'ollama', provider
    elif provider == 'together':
        return 'https://api.together.xyz/v1', get_together_api_key(), provider
    elif provider == 'zai':
        return 'https://api.z.ai/api/paas/v4', get_zai_api_key(), provider
    elif provider == 'custom':
        base = data.get('custom_base_url', '').rstrip('/')
        key = data.get('custom_api_key', '') or 'no-key'
        return base, key, provider

    return VENICE_API_BASE, api_key, provider


def _call_llm_stream(messages, model_name, config, api_base, api_key, provider):
    """
    Make a streaming LLM API call. Yields text chunks.
    """
    logger.debug(f"[Trio/LLM] Calling {model_name} via {provider} at {api_base}")
    logger.debug(f"[Trio/LLM] Messages: {len(messages)}, last msg role: {messages[-1].get('role') if messages else 'none'}")
    
    payload = {
        "model": model_name,
        "messages": messages,
        "max_tokens": int(config.get('max_tokens', 2048)),
        "stream": True
    }

    # Provider-specific handling
    if provider == 'zai':
        # z.ai requires temperature <= 1.0
        temp = float(config.get('temperature', 0.7))
        if temp > 1.0:
            logger.warning(f"[Trio/ZAI] temperature {temp} > 1.0, clamping to 1.0")
        payload["temperature"] = min(temp, 1.0)
        # Higher max_tokens default for z.ai
        if payload.get("max_tokens", 2048) <= 2048:
            payload["max_tokens"] = 65536
        # do_sample for deterministic mode control
        payload["do_sample"] = bool(config.get('zai_do_sample', True))
        # Thinking control for GLM-4.5+ models
        is_vision = model_name.startswith('glm-4.6v') or model_name.startswith('glm-4.5v')
        supports_thinking = not is_vision and (
            model_name.startswith('glm-4.5') or
            model_name.startswith('glm-4.6') or
            model_name.startswith('glm-5')
        )
        if supports_thinking:
            enable_thinking = config.get('zai_enable_thinking', True)
            if config.get('disable_thinking', False):
                enable_thinking = False
            payload["thinking"] = {"type": "enabled" if enable_thinking else "disabled"}
    else:
        payload["temperature"] = float(config.get('temperature', 0.7))

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    if provider == 'venice':
        # Trio is conversation mode — disable thinking by default for fast response
        disable_think = config.get('disable_thinking', True)
        payload["venice_parameters"] = {
            "include_venice_system_prompt": False,
            "disable_thinking": disable_think,
            "strip_thinking_response": config.get('strip_thinking', True) or disable_think,
        }

    # Track whether to strip thinking from output
    strip_thinking = config.get('strip_thinking', False) or config.get('disable_thinking', False)
    thinking_buffer = ""


    try:
        with httpx.Client(timeout=120.0) as client:
            with client.stream("POST", f"{api_base}/chat/completions",
                               json=payload, headers=headers) as response:
                logger.debug(f"[Trio/LLM] Response status: {response.status_code}")
                if response.status_code != 200:
                    error_text = response.read().decode('utf-8', errors='replace')
                    logger.error(f"[Trio] API error {response.status_code}: {error_text[:500]}")
                    yield f"[API Error: {response.status_code}]"
                    return

                chunk_count = 0
                for line in response.iter_lines():
                    if not line or not line.startswith('data: '):
                        continue
                    raw = line[6:].strip()
                    if raw == '[DONE]':
                        logger.debug(f"[Trio/LLM] Stream done, received {chunk_count} chunks")
                        break
                    try:
                        chunk = json.loads(raw)
                        delta = chunk.get('choices', [{}])[0].get('delta', {})
                        content = delta.get('content', '')
                        if content:
                            chunk_count += 1
                            if chunk_count <= 5:
                                logger.debug(f"[Trio/LLM] Chunk {chunk_count}: {content[:50]}...")
                        
                        # Handle thinking/reasoning blocks
                        if content and strip_thinking:
                            thinking_buffer += content
                            # Strip complete thinking blocks
                            start_tag = chr(60)+chr(60)+chr(116)+chr(104)+chr(105)+chr(110)+chr(107)+chr(105)+chr(110)+chr(103)+chr(62)+chr(62)
                            end_tag = chr(60)+chr(47)+chr(116)+chr(104)+chr(105)+chr(110)+chr(107)+chr(105)+chr(110)+chr(103)+chr(62)+chr(62)
                            while start_tag in thinking_buffer and end_tag in thinking_buffer:
                                start = thinking_buffer.find(start_tag)
                                end = thinking_buffer.find(end_tag) + len(end_tag)
                                thinking_buffer = thinking_buffer[:start] + thinking_buffer[end:]
                            # If mid-thinking tag, buffer and wait
                            if start_tag in thinking_buffer and end_tag not in thinking_buffer:
                                start = thinking_buffer.find(start_tag)
                                to_yield = thinking_buffer[:start]
                                thinking_buffer = thinking_buffer[start:]
                            else:
                                to_yield = thinking_buffer
                                thinking_buffer = ""
                            if to_yield:
                                yield to_yield
                        elif content:
                            yield content
                    except (json.JSONDecodeError, IndexError, KeyError):
                        continue
    except Exception as e:
        logger.error(f"[Trio] LLM stream error: {e}", exc_info=True)
        yield f"[Stream Error: {str(e)}]"


@trio_bp.route('/api/chat/trio', methods=['POST'])
def stream_trio_chat():
    """
    Main trio chat endpoint.
    Expects:
        messages: conversation history (with 'speaker' field on assistant msgs)
        config: trio config with 'mode': 'trio', 'participants': [...]
        trio_state: {last_speaker, consecutive_default_turns (dict), active_thread}
        emotional_state: {label: {current, energy, toward_other, toward_user}}

    Session config toggles (all optional, with defaults):
        interruptions_enabled: bool (default True) — master interrupt toggle
        passive_presence_enabled: bool (default True) — allow <<SILENT>> passive reactions
        emotional_tracking_enabled: bool (default True) — include emotional context in prompt
        ambient_responses: bool (default False) — Tier 4 group response (both respond)
        max_consecutive_turns: int (default 2) — alternation threshold
        turn_order: 'context' | 'sequential' (default 'context')
        let_them_talk_rounds: int (default 2) — rounds for let-them-talk
    
    LOGGING: Comprehensive logging with session ID for correlation.
    """
    # Create session ID for this request
    session_id = _session_id()
    trio_log = TrioLogger(session_id)
    
    data = request.json
    trio_log.request_start(json.dumps(data, indent=2)[:500])
    
    messages = data.get('messages', [])
    config = data.get('config', {})
    chat_id = data.get('chat_id')
    trio_state = data.get('trio_state', {
        'last_speaker': None,
        'consecutive_default_turns': {},
        'active_thread': None,
    })
    emotional_state = data.get('emotional_state', {})

    logger.info(f"[Trio/{session_id}] === REQUEST START ===")
    logger.debug(f"[Trio/{session_id}] Messages: {len(messages)}, Config mode: {config.get('mode')}")
    logger.debug(f"[Trio/{session_id}] Trio state: {json.dumps(trio_state)}")
    logger.debug(f"[Trio/{session_id}] Emotional state: {json.dumps(emotional_state)}")
    
    # Session config toggles
    interruptions_enabled = config.get('interruptions_enabled', True)
    passive_presence_enabled = config.get('passive_presence_enabled', True)
    emotional_tracking_enabled = config.get('emotional_tracking_enabled', True)
    ambient_responses = config.get('ambient_responses', False)
    max_consecutive = config.get('max_consecutive_turns', 2)
    turn_order = config.get('turn_order', 'context')
    let_them_talk_rounds = config.get('let_them_talk_rounds', 2)
    
    logger.debug(f"[Trio/{session_id}] Toggles: interrupts={interruptions_enabled}, "
                 f"passive={passive_presence_enabled}, emotional={emotional_tracking_enabled}, "
                 f"ambient={ambient_responses}, max_consecutive={max_consecutive}")

    # Inject max_consecutive into trio_state for the resolver
    trio_state['max_consecutive_turns'] = max_consecutive

    participants = _build_participants(config)
    trio_log.participants_build(config.get('participants', []))
    
    if len(participants) < 2:
        trio_log.error("validation", "Less than 2 participants")
        return Response(
            f"data: {json.dumps({'event': 'error', 'error': 'Trio mode requires at least 2 participants'})}\n\n",
            mimetype='text/event-stream'
        )
    
    logger.info(f"[Trio/{session_id}] Participants: {[p['label'] for p in participants]}")

    # Build config cache for addressing resolver
    config_cache = {}
    for p in participants:
        if p.get('config_name'):
            cfg = _load_character_config(p['config_name'])
            if cfg:
                config_cache[p['label']] = cfg
                trio_log.participant_loaded(p['label'], p['config_name'], 
                                            cfg.get('name_variants', []),
                                            cfg.get('addressing_keywords', []))

    # Get the last user message
    last_user_msg = next(
        (m.get('content', '') for m in reversed(messages) if m.get('role') == 'user'),
        ''
    )
    logger.debug(f"[Trio/{session_id}] Last user message: '{last_user_msg[:100]}...'")

    # Resolve addressee (with session_id for logging)
    addressee, routing_info = resolve_addressee(
        last_user_msg, participants, trio_state, config_cache, session_id
    )

    logger.info(f"[Trio/{session_id}] === ROUTING RESULT ===")
    logger.info(f"[Trio/{session_id}] Addressee: {addressee}")
    logger.info(f"[Trio/{session_id}] Tier: {routing_info['tier']}, Method: {routing_info['method']}")
    logger.info(f"[Trio/{session_id}] Details: {routing_info.get('details', 'N/A')}")

    # Update trio state (with session_id for logging)
    trio_state = update_trio_state(trio_state, addressee, routing_info, participants, trio_log)

    # Build combo prompt (with session_id for logging)
    dynamic = config.get('dynamic', {})
    # Filter emotional state if tracking is disabled
    effective_emotional = emotional_state if emotional_tracking_enabled else None
    combo = build_combo_prompt(participants, dynamic, effective_emotional, config_cache, session_id)
    
    logger.debug(f"[Trio/{session_id}] Combo prompt length: {len(combo)} chars")

    # Determine which participants respond
    if addressee == 'both':
        responders = participants
        logger.debug(f"[Trio/{session_id}] Both-addressing: both participants respond")
    elif ambient_responses and routing_info['tier'] == 4:
        # Ambient mode: both respond on Tier 4
        responders = participants
        logger.debug(f"[Trio/{session_id}] Ambient mode (Tier 4): both participants respond")
    else:
        responders = [p for p in participants if p['label'] == addressee]
        logger.debug(f"[Trio/{session_id}] Single responder: {addressee}")

    # Get API target (single shared model — Option A per plan §4.3)
    model_name = config.get('model') or responders[0].get('model', DEFAULT_MODEL)
    api_base, api_key, provider = _get_api_target(model_name, config, data)

    trio_log.llm_call_start(model_name, provider, api_base, len(messages))
    logger.info(f"[Trio/{session_id}] Model: {model_name}, Provider: {provider}")
    logger.debug(f"[Trio/{session_id}] API base: {api_base}")
    logger.debug(f"[Trio/{session_id}] Responders: {[p['label'] for p in responders]}")

    if not api_key and provider not in ('ollama', 'custom'):
        trio_log.error("api_key", f"No API key for provider {provider}")
        return Response(
            f"data: {json.dumps({'event': 'error', 'error': 'API key not configured'})}\n\n",
            mimetype='text/event-stream'
        )

    def generate():
        import uuid
        new_chat_id = chat_id or f"{uuid.uuid4()}.json"

        # Send start event
        yield f"data: {json.dumps({'event': 'start', 'chat_id': new_chat_id, 'trio': True})}\n\n"

        # Send trio state update
        yield f"data: {json.dumps({'event': 'trio_state', 'trio_state': trio_state, 'addressee': addressee})}\n\n"

        # Send participant info
        yield f"data: {json.dumps({'event': 'trio_participants', 'participants': [{'label': p['label'], 'display_name': p['display_name'], 'color': p['color'], 'avatar': p['avatar']} for p in participants]})}\n\n"

        all_responses = {}  # label → full text

        for responder in responders:
            label = responder['label']
            logger.debug(f"[Trio] Starting response for {label}")

            # Build messages for this responder
            trio_messages = build_trio_messages(combo, messages, participants, label)
            logger.debug(f"[Trio] Built {len(trio_messages)} messages for {label}")

            # Send speaker_start event
            yield f"data: {json.dumps({'event': 'speaker_start', 'speaker': label, 'display_name': responder['display_name']})}\n\n"

            # Set up interrupt monitor (other participant watches)
            # Only if interrupts are enabled and this isn't a "both" response
            monitor = None
            if interruptions_enabled and len(responders) == 1:
                other_participants = [p for p in participants if p['label'] != label]
                if other_participants:
                    monitor = InterruptMonitor(other_participants[0], responder, trio_state)

            full_text = ""
            queue = TokenBufferQueue(label, participants)

            try:
                for chunk in _call_llm_stream(trio_messages, model_name, config, api_base, api_key, provider):
                    full_text += chunk

                    # Check for interrupts
                    if monitor:
                        trigger = monitor.check(chunk)
                        if trigger:
                            # Truncate current response at sentence boundary
                            truncate_pos = len(full_text) - len(chunk)
                            truncated = truncate_at_boundary(full_text, truncate_pos)

                            # Flush queue with truncated text
                            remaining = truncated[len(full_text) - len(chunk):] if len(truncated) < len(full_text) else ''
                            if remaining:
                                for ev in queue.feed(remaining):
                                    if ev['type'] == 'delta':
                                        yield f"data: {json.dumps({'event': 'trio_delta', 'speaker': ev['speaker'], 'delta': ev['delta']})}\n\n"

                            # Send interrupt event
                            yield f"data: {json.dumps({'event': 'trio_interrupt', 'by': other_participants[0]['label'], 'truncated_text': truncated})}\n\n"

                            # Switch to interrupter
                            interrupter = other_participants[0]
                            int_label = interrupter['label']

                            yield f"data: {json.dumps({'event': 'speaker_start', 'speaker': int_label, 'display_name': interrupter['display_name']})}\n\n"

                            # Build messages for interrupter (include truncated response as context)
                            int_messages = build_trio_messages(
                                combo,
                                messages + [{'role': 'assistant', 'speaker': label, 'content': truncated + '—'}],
                                participants, int_label
                            )

                            int_queue = TokenBufferQueue(int_label, participants)
                            int_text = ""

                            for int_chunk in _call_llm_stream(int_messages, model_name, config, api_base, api_key, provider):
                                int_text += int_chunk
                                for ev in int_queue.feed(int_chunk):
                                    if ev['type'] == 'delta':
                                        yield f"data: {json.dumps({'event': 'trio_delta', 'speaker': ev['speaker'], 'delta': ev['delta']})}\n\n"
                                    elif ev['type'] == 'speaker_change':
                                        yield f"data: {json.dumps({'event': 'trio_speaker_change', 'speaker': ev['speaker']})}\n\n"
                                    elif ev['type'] == 'yield':
                                        yield f"data: {json.dumps({'event': 'trio_yield', 'speaker': ev['speaker']})}\n\n"
                                    elif ev['type'] == 'silent':
                                        if passive_presence_enabled:
                                            yield f"data: {json.dumps({'event': 'trio_silent', 'speaker': ev['speaker']})}\n\n"

                            # Flush
                            for ev in int_queue.flush():
                                if ev['type'] == 'delta':
                                    yield f"data: {json.dumps({'event': 'trio_delta', 'speaker': ev['speaker'], 'delta': ev['delta']})}\n\n"

                            # Resume original speaker if they were truncated and haven't hit max interrupts
                            if monitor.interrupt_count < monitor.max_interrupts:
                                logger.info(f"[Trio] Resuming {label} after interrupt by {int_label}")
                                
                                # Build resume messages - include both truncated response and interrupt
                                resume_messages = build_trio_messages(
                                    combo,
                                    messages + [
                                        {'role': 'assistant', 'speaker': label, 'content': truncated + '—'},
                                        {'role': 'assistant', 'speaker': int_label, 'content': int_text}
                                    ],
                                    participants, label
                                )
                                
                                # Add resume instruction
                                resume_messages.append({
                                    'role': 'system',
                                    'content': f"You were interrupted by {interrupter['display_name']}. You may now continue your thought or respond to what they said. Pick up naturally from where you were cut off."
                                })
                                
                                yield f"data: {json.dumps({'event': 'speaker_start', 'speaker': label, 'display_name': responder['display_name']})}\\n\\n"
                                
                                queue = TokenBufferQueue(label, participants)
                                resume_text = ""
                                
                                for resume_chunk in _call_llm_stream(resume_messages, model_name, config, api_base, api_key, provider):
                                    resume_text += resume_chunk
                                    for ev in queue.feed(resume_chunk):
                                        if ev['type'] == 'delta':
                                            yield f"data: {json.dumps({'event': 'trio_delta', 'speaker': ev['speaker'], 'delta': ev['delta']})}\\n\\n"
                                        elif ev['type'] == 'yield':
                                            yield f"data: {json.dumps({'event': 'trio_yield', 'speaker': ev['speaker']})}\\n\\n"
                                            # Yield means they're done - finish and break
                                            for flush_ev in queue.flush():
                                                if flush_ev['type'] == 'delta':
                                                    yield f"data: {json.dumps({'event': 'trio_delta', 'speaker': flush_ev['speaker'], 'delta': flush_ev['delta']})}\\n\\n"
                                            all_responses[label] = resume_text
                                            yield f"data: {json.dumps({'event': 'speaker_end', 'speaker': label})}\\n\\n"
                                            break
                                
                                # Flush remaining
                                for ev in queue.flush():
                                    if ev['type'] == 'delta':
                                        yield f"data: {json.dumps({'event': 'trio_delta', 'speaker': ev['speaker'], 'delta': ev['delta']})}\\n\\n"
                                
                                all_responses[label] = resume_text
                                yield f"data: {json.dumps({'event': 'speaker_end', 'speaker': label})}\\n\\n"

                            monitor.reset()
                            break

                    # Feed through token buffer queue
                    for ev in queue.feed(chunk):
                        if ev['type'] == 'delta':
                            yield f"data: {json.dumps({'event': 'trio_delta', 'speaker': ev['speaker'], 'delta': ev['delta']})}\n\n"
                        elif ev['type'] == 'speaker_change':
                            yield f"data: {json.dumps({'event': 'trio_speaker_change', 'speaker': ev['speaker']})}\n\n"
                        elif ev['type'] == 'yield':
                            yield f"data: {json.dumps({'event': 'trio_yield', 'speaker': ev['speaker']})}\n\n"
                            logger.info(f"[Trio] {label} yielded - ending stream")
                            # Flush and end - user gets to speak now
                            for flush_ev in queue.flush():
                                if flush_ev['type'] == 'delta':
                                    yield f"data: {json.dumps({'event': 'trio_delta', 'speaker': flush_ev['speaker'], 'delta': flush_ev['delta']})}\n\n"
                            all_responses[label] = full_text
                            yield f"data: {json.dumps({'event': 'speaker_end', 'speaker': label})}\n\n"
                            # Send end event and stop streaming entirely
                            end_event = {'event': 'end', 'trio': True, 'responses': all_responses, 'trio_state': trio_state}
                            yield f"data: {json.dumps(end_event)}\n\n"
                            return  # Exit the generator entirely
                        elif ev['type'] == 'silent':
                            if passive_presence_enabled:
                                yield f"data: {json.dumps({'event': 'trio_silent', 'speaker': ev['speaker']})}\n\n"

                # Flush remaining buffer
                for ev in queue.flush():
                    if ev['type'] == 'delta':
                        yield f"data: {json.dumps({'event': 'trio_delta', 'speaker': ev['speaker'], 'delta': ev['delta']})}\n\n"

                all_responses[label] = full_text

                # Send speaker_end event
                yield f"data: {json.dumps({'event': 'speaker_end', 'speaker': label})}\n\n"

            except Exception as e:
                logger.error(f"[Trio] Error streaming {label}: {e}", exc_info=True)
                yield f"data: {json.dumps({'event': 'error', 'error': f'{label}: {str(e)}'})}\n\n"

        # Send end event with all responses
        end_event = {
            'event': 'end',
            'trio': True,
            'responses': all_responses,
            'trio_state': trio_state,
        }
        yield f"data: {json.dumps(end_event)}\n\n"

    return Response(generate(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})



@trio_bp.route('/api/chat/trio/let-them-talk', methods=['POST'])
def let_them_talk():
    """
    Let-them-talk endpoint: characters exchange N rounds autonomously.
    Single API call with [Name]: label parsing.

    A "round" is one exchange pair (Character A speaks, then Character B speaks).
    So 2 rounds = 4 messages total.
    """
    data = request.json
    messages = data.get('messages', [])
    config = data.get('config', {})
    trio_state = data.get('trio_state', {})
    emotional_state = data.get('emotional_state', {})
    max_rounds = data.get('max_rounds') or config.get('let_them_talk_rounds', 2)

    participants = _build_participants(config)
    if len(participants) < 2:
        return Response(
            f"data: {json.dumps({'event': 'error', 'error': 'Need 2 participants'})}\n\n",
            mimetype='text/event-stream'
        )

    config_cache = {}
    for p in participants:
        if p.get('config_name'):
            cfg = _load_character_config(p['config_name'])
            if cfg:
                config_cache[p['label']] = cfg

    dynamic = config.get('dynamic', {})
    emotional_tracking_enabled = config.get('emotional_tracking_enabled', True)
    effective_emotional = emotional_state if emotional_tracking_enabled else None
    combo = build_combo_prompt(participants, dynamic, effective_emotional, config_cache)

    # Add instruction for let-them-talk
    combo += f"\n\n--- LET THEM TALK ---\n"
    combo += f"The user wants to watch the characters talk to each other. Exchange at most {max_rounds} rounds "
    combo += f"(a round = one exchange pair: Character A speaks, then Character B speaks, so {max_rounds} rounds = {max_rounds * 2} messages). "
    combo += "Use [Name]: labels to switch speakers. Emit <<YIELD>> when the exchange is naturally complete.\n"

    model_name = config.get('model') or participants[0].get('model', DEFAULT_MODEL)
    api_base, api_key, provider = _get_api_target(model_name, config, data)

    if not api_key and provider not in ('ollama', 'custom'):
        return Response(
            f"data: {json.dumps({'event': 'error', 'error': 'API key not configured'})}\n\n",
            mimetype='text/event-stream'
        )

    def generate():
        import uuid
        new_chat_id = data.get('chat_id') or f"{uuid.uuid4()}.json"

        yield f"data: {json.dumps({'event': 'start', 'chat_id': new_chat_id, 'trio': True})}\n\n"
        yield f"data: {json.dumps({'event': 'trio_participants', 'participants': [{'label': p['label'], 'display_name': p['display_name'], 'color': p['color'], 'avatar': p['avatar']} for p in participants]})}\n\n"

        # Build messages - start with first participant as current speaker
        # Build messages - start with first participant as current speaker
        current_speaker = participants[0]['label']
        trio_messages = build_trio_messages(combo, messages, participants, current_speaker)
        trio_messages.append({"role": "system", "content": "Begin the exchange. Start with whichever character naturally speaks first."})

        yield f"data: {json.dumps({'event': 'speaker_start', 'speaker': current_speaker, 'display_name': participants[0]['display_name']})}\\n\\n"
        queue = TokenBufferQueue(current_speaker, participants)
        full_text = ""
        speaker_changes = 0
        round_count = 0
        force_end = False

        try:
            for chunk in _call_llm_stream(trio_messages, model_name, config, api_base, api_key, provider):
                if force_end:
                    break

                full_text += chunk

                for ev in queue.feed(chunk):
                    if ev['type'] == 'delta':
                        yield f"data: {json.dumps({'event': 'trio_delta', 'speaker': ev['speaker'], 'delta': ev['delta']})}\n\n"
                    elif ev['type'] == 'speaker_change':
                        speaker_changes += 1
                        # Every 2 speaker changes = 1 round (A→B is one round)
                        round_count = (speaker_changes + 1) // 2
                        yield f"data: {json.dumps({'event': 'trio_speaker_change', 'speaker': ev['speaker']})}\n\n"
                        if round_count >= max_rounds:
                            force_end = True
                            break
                    elif ev['type'] == 'yield':
                        yield f"data: {json.dumps({'event': 'trio_yield', 'speaker': ev['speaker']})}\n\n"
                        force_end = True
                        break
                    elif ev['type'] == 'silent':
                        if config.get('passive_presence_enabled', True):
                            yield f"data: {json.dumps({'event': 'trio_silent', 'speaker': ev['speaker']})}\n\n"

            # Flush
            for ev in queue.flush():
                if ev['type'] == 'delta':
                    yield f"data: {json.dumps({'event': 'trio_delta', 'speaker': ev['speaker'], 'delta': ev['delta']})}\n\n"

        except Exception as e:
            logger.error(f"[Trio] Let-them-talk error: {e}", exc_info=True)
            yield f"data: {json.dumps({'event': 'error', 'error': str(e)})}\n\n"

        yield f"data: {json.dumps({'event': 'end', 'trio': True, 'responses': {queue.current_speaker: full_text}})}\n\n"

    return Response(generate(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})
