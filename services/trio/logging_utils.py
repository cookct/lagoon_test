"""
Trio Logging Utilities
Provides structured, comprehensive logging for Trio mode debugging.

LOG LEVELS:
- DEBUG: Token-by-token, state transitions, internal decisions
- INFO: Routing results, interrupt fires, speaker changes
- WARNING: Unexpected but handled situations
- ERROR: Failures with context

USAGE:
  from services.trio.logging_utils import TrioLogger
  trio_log = TrioLogger(session_id)
  trio_log.routing("Kelly", tier=1, method="name", msg_preview="Kelly, what...")
  trio_log.interrupt("Nathan", trigger="keyword", char_count=150)
  trio_log.token_chunk("Kelly", delta="I could hear", buffer_state="...")
"""
import logging
import json
import time
from functools import wraps

# Get the trio logger
trio_logger = logging.getLogger('services.trio')
trio_logger.setLevel(logging.DEBUG)

class TrioLogger:
    """Structured logger for Trio mode with session correlation."""
    
    def __init__(self, session_id=None):
        self.session_id = session_id or "T0000"
        self.start_time = time.time()
        self.event_count = 0
    
    def _prefix(self):
        elapsed = time.time() - self.start_time
        return f"[Trio/{self.session_id}][{elapsed:.2f}s][#{self.event_count}]"
    
    def _inc(self):
        self.event_count += 1
    
    # ── Request Lifecycle ──
    
    def request_start(self, data_preview):
        """Log incoming request."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} REQUEST_START: {data_preview[:200]}...")
    
    def request_end(self, success=True, error=None):
        """Log request completion."""
        self._inc()
        elapsed = time.time() - self.start_time
        if success:
            trio_logger.info(f"{self._prefix()} REQUEST_END: success, elapsed={elapsed:.2f}s")
        else:
            trio_logger.error(f"{self._prefix()} REQUEST_END: FAILED - {error}")
    
    # ── Routing/Addressing ──
    
    def routing_start(self, msg_preview, trio_state):
        """Log start of addressing resolution."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} ROUTING_START: msg='{msg_preview[:50]}...', "
                          f"last_speaker={trio_state.get('last_speaker')}, "
                          f"consecutive={json.dumps(trio_state.get('consecutive_default_turns', {}))}")
    
    def routing_tier(self, tier, method, details):
        """Log each tier check."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} ROUTING_TIER_{tier}: method={method}, {details}")
    
    def routing_result(self, addressee, tier, method, reset_counters):
        """Log final routing decision."""
        self._inc()
        trio_logger.info(f"{self._prefix()} ROUTING_RESULT: addressee={addressee}, "
                         f"tier={tier}, method={method}, reset_counters={reset_counters}")
    
    def routing_trailing_vocative(self, original, overridden_by):
        """Log trailing vocative override."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} VOCATIVE_OVERRIDE: {original} -> {overridden_by}")
    
    # ── Name Detection ──
    
    def name_detect_word_boundary(self, msg, matches):
        """Log word-boundary name detection."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} NAME_DETECT_WORD: msg='{msg[:30]}...', "
                          f"matches={json.dumps(matches)}")
    
    def name_detect_prefix(self, msg, matches):
        """Log prefix fallback name detection."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} NAME_DETECT_PREFIX: msg='{msg[:30]}...', "
                          f"matches={json.dumps(matches)}")
    
    def name_detect_no_match(self, msg):
        """Log no name found."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} NAME_DETECT_NONE: msg='{msg[:30]}...'")
    
    # ── Interrupt Monitoring ──
    
    def interrupt_monitor_init(self, interrupter, speaker, config):
        """Log interrupt monitor initialization."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} INTERRUPT_INIT: interrupter={interrupter['label']}, "
                          f"speaker={speaker['label']}, "
                          f"keywords={interrupter.get('interrupt_keywords', [])}, "
                          f"patience={interrupter.get('patience_threshold', 400)}, "
                          f"prob={interrupter.get('patience_interrupt_probability', 0.15)}")
    
    def interrupt_check(self, char_count, cooldown_remaining, trigger=None):
        """Log interrupt check (no fire)."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} INTERRUPT_CHECK: chars={char_count}, "
                          f"cooldown={cooldown_remaining}, trigger={trigger}")
    
    def interrupt_fire(self, interrupter, trigger_type, char_count, interrupt_count):
        """Log interrupt fired."""
        self._inc()
        trio_logger.info(f"{self._prefix()} INTERRUPT_FIRE: interrupter={interrupter['label']}, "
                         f"trigger={trigger_type}, chars={char_count}, "
                         f"count={interrupt_count}")
    
    def interrupt_truncate(self, text, pos, truncated_text):
        """Log text truncation."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} INTERRUPT_TRUNCATE: pos={pos}, "
                          f"original='{text[:50]}...', truncated='{truncated_text[:50]}...'")
    
    def interrupt_resume(self, speaker, resume_prompt_preview):
        """Log resume call."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} INTERRUPT_RESUME: speaker={speaker}, "
                          f"prompt='{resume_prompt_preview[:100]}...'")
    
    # ── Token Buffer Queue ──
    
    def token_buffer_init(self, speaker, participants):
        """Log token buffer initialization."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} TOKEN_BUFFER_INIT: speaker={speaker}, "
                          f"participants={[p['label'] for p in participants]}")
    
    def token_feed(self, raw_chunk, buffer_len):
        """Log token feed."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} TOKEN_FEED: chunk='{raw_chunk[:30]}...', "
                          f"buffer_len={buffer_len}")
    
    def token_event(self, event_type, speaker, delta=None):
        """Log emitted event."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} TOKEN_EVENT: type={event_type}, "
                          f"speaker={speaker}, delta='{delta[:30] if delta else None}...'")
    
    def token_speaker_change(self, old_speaker, new_speaker):
        """Log speaker change from [Name]: label."""
        self._inc()
        trio_logger.info(f"{self._prefix()} SPEAKER_CHANGE: {old_speaker} -> {new_speaker}")
    
    def token_yield(self, speaker):
        """Log <<YIELD>> token."""
        self._inc()
        trio_logger.info(f"{self._prefix()} YIELD: speaker={speaker}")
    
    def token_silent(self, speaker):
        """Log <<SILENT>> token."""
        self._inc()
        trio_logger.info(f"{self._prefix()} SILENT: speaker={speaker}")
    
    def token_flush(self, remaining_len):
        """Log buffer flush."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} TOKEN_FLUSH: remaining={remaining_len}")
    
    def token_partial_hold(self, partial_text, safe_text):
        """Log partial marker hold."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} TOKEN_PARTIAL_HOLD: "
                          f"partial='{partial_text}', safe='{safe_text[:30]}...'")
    
    # ── Combo Prompt ──
    
    def combo_prompt_build(self, participants, dynamic_keys, emotional_enabled):
        """Log combo prompt construction."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} COMBO_BUILD: "
                          f"participants={[p['label'] for p in participants]}, "
                          f"dynamic={dynamic_keys}, emotional={emotional_enabled}")
    
    def combo_prompt_section(self, section_name, content_preview):
        """Log each combo prompt section."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} COMBO_SECTION: {section_name}, "
                          f"preview='{content_preview[:100]}...'")
    
    def combo_prompt_final(self, total_len):
        """Log final combo prompt."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} COMBO_FINAL: total_chars={total_len}")
    
    # ── LLM Call ──
    
    def llm_call_start(self, model, provider, api_base, msg_count):
        """Log LLM call start."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} LLM_START: model={model}, "
                          f"provider={provider}, api={api_base}, msgs={msg_count}")
    
    def llm_chunk(self, chunk_num, content_preview):
        """Log LLM chunk (first few)."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} LLM_CHUNK_{chunk_num}: '{content_preview[:50]}...'")
    
    def llm_stream_end(self, total_chunks):
        """Log LLM stream end."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} LLM_END: total_chunks={total_chunks}")
    
    def llm_error(self, status_code, error_text):
        """Log LLM error."""
        self._inc()
        trio_logger.error(f"{self._prefix()} LLM_ERROR: status={status_code}, "
                          f"error='{error_text[:200]}...'")
    
    # ── State Updates ──
    
    def state_update(self, trio_state_before, trio_state_after):
        """Log trio state update."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} STATE_UPDATE: "
                          f"before={json.dumps(trio_state_before)}, "
                          f"after={json.dumps(trio_state_after)}")
    
    def consecutive_counter(self, label, old_count, new_count, reset=False):
        """Log consecutive counter change."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} CONSECUTIVE: {label} {old_count}->{new_count}, "
                          f"reset={reset}")
    
    # ── Let Them Talk ──
    
    def ltt_start(self, max_rounds):
        """Log let-them-talk start."""
        self._inc()
        trio_logger.info(f"{self._prefix()} LTT_START: max_rounds={max_rounds}")
    
    def ltt_round(self, round_num, speaker_a, speaker_b):
        """Log let-them-talk round."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} LTT_ROUND_{round_num}: {speaker_a} -> {speaker_b}")
    
    def ltt_end(self, reason, total_rounds):
        """Log let-them-talk end."""
        self._inc()
        trio_logger.info(f"{self._prefix()} LTT_END: reason={reason}, rounds={total_rounds}")
    
    # ── Passive Presence ──
    
    def passive_check(self, other_label, probability, roll_result):
        """Log passive presence probability check."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} PASSIVE_CHECK: {other_label}, "
                          f"prob={probability}, roll={roll_result}, fires={roll_result < probability}")
    
    def passive_reaction(self, speaker, reaction_text_preview):
        """Log passive reaction."""
        self._inc()
        trio_logger.info(f"{self._prefix()} PASSIVE_REACTION: {speaker}, "
                         f"text='{reaction_text_preview[:50]}...'")
    
    # ── SSE Events ──
    
    def sse_emit(self, event_type, data_preview):
        """Log SSE event emission."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} SSE_EMIT: {event_type}, "
                          f"data='{json.dumps(data_preview)[:100]}...'")
    
    # ── Participants ──
    
    def participants_build(self, configs):
        """Log participant building."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} PARTICIPANTS_BUILD: "
                          f"configs={[c.get('label', c.get('character_name', 'unknown')) for c in configs]}")
    
    def participant_loaded(self, label, config_name, name_variants, keywords):
        """Log participant loaded."""
        self._inc()
        trio_logger.debug(f"{self._prefix()} PARTICIPANT_LOADED: {label}, "
                          f"config={config_name}, variants={name_variants}, "
                          f"keywords={keywords}")
    
    # ── Error Handling ──
    
    def error(self, context, error_msg, exc_info=False):
        """Log error with context."""
        self._inc()
        trio_logger.error(f"{self._prefix()} ERROR: {context} - {error_msg}", 
                          exc_info=exc_info)
    
    def warning(self, context, warning_msg):
        """Log warning."""
        self._inc()
        trio_logger.warning(f"{self._prefix()} WARNING: {context} - {warning_msg}")


def log_function_call(logger_instance, func_name):
    """Decorator to log function entry/exit."""
    @wraps
    def decorator(func):
        def wrapper(*args, **kwargs):
            logger_instance._inc()
            trio_logger.debug(f"{logger_instance._prefix()} FUNC_ENTER: {func_name}")
            try:
                result = func(*args, **kwargs)
                logger_instance._inc()
                trio_logger.debug(f"{logger_instance._prefix()} FUNC_EXIT: {func_name}")
                return result
            except Exception as e:
                logger_instance._inc()
                trio_logger.error(f"{logger_instance._prefix()} FUNC_ERROR: {func_name} - {e}")
                raise
        return wrapper
    return decorator