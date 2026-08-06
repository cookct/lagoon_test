"""
Trio Interrupt Monitor
Monitors a character's streaming response for triggers that indicate
the other character should interrupt.

COMPREHENSIVE LOGGING:
- Every check logged at DEBUG
- Interrupt fires logged at INFO
- Patience probability rolls logged
- Truncation decisions logged

Enable with: logging.getLogger('services.trio').setLevel(logging.DEBUG)
"""
import random
import logging
import json
from services.trio.logging_utils import TrioLogger

logger = logging.getLogger(__name__)

# Special tokens
YIELD_TOKEN = '<<YIELD>>'


class InterruptMonitor:
    """
    Watches Character A's stream for triggers that Character B should interrupt.

    Trigger types:
        - 'yield': Character A emitted <<YIELD>>
        - 'keyword': Character A mentioned one of B's interrupt_keywords
        - 'patience': Character A exceeded B's patience_threshold (probabilistic,
          flat base probability with subtractive decay per consecutive patience interrupt)
    
    LOGGING: All checks and fires logged with full context.
    """

    def __init__(self, interrupting_participant, speaking_participant, trio_state=None, session_id=None):
        self.interrupter = interrupting_participant
        self.speaker = speaking_participant
        self.trio_state = trio_state or {}
        self.trio_log = TrioLogger(session_id)
        
        self.interrupt_keywords = interrupting_participant.get('interrupt_keywords', [])
        self.patience_threshold = interrupting_participant.get('patience_threshold', 400)
        self.patience_probability = interrupting_participant.get('patience_interrupt_probability', 0.15)
        self.patience_decay = interrupting_participant.get('patience_decay', 0.05)
        self.max_interrupts = interrupting_participant.get('max_interrupts', 3)
        self.cooldown_chars = interrupting_participant.get('interrupt_cooldown', 500)
        
        # Track state across checks
        self.char_count = 0
        self.interrupt_count = 0
        self.consecutive_patience_interrupts = 0
        self.cooldown_remaining = 0
        self.fired = False
        self.patience_checked = False  # Only check patience once per threshold crossing
        self._keyword_window = ""  # Last 200 chars for keyword detection
        
        # Log initialization
        self.trio_log.interrupt_monitor_init(interrupting_participant, speaking_participant, {
            'keywords': self.interrupt_keywords,
            'patience_threshold': self.patience_threshold,
            'patience_probability': self.patience_probability,
            'patience_decay': self.patience_decay,
            'max_interrupts': self.max_interrupts,
            'cooldown_chars': self.cooldown_chars
        })

    def check(self, new_text):
        """
        Check new text for interrupt triggers.
        Returns trigger type ('yield', 'keyword', 'patience') or None.
        
        LOGGING: Every check logged with current state.
        """
        if self.fired:
            self.trio_log.interrupt_check(self.char_count, self.cooldown_remaining, 
                                           trigger="already_fired")
            return None

        if self.interrupt_count >= self.max_interrupts:
            self.trio_log.interrupt_check(self.char_count, self.cooldown_remaining,
                                           trigger="max_interrupts_reached")
            return None

        self.char_count += len(new_text)
        
        # Update keyword window (last 200 chars for keyword detection)
        self._keyword_window = (self._keyword_window + new_text)[-200:]

        if self.cooldown_remaining > 0:
            self.cooldown_remaining -= len(new_text)
            if self.cooldown_remaining > 0:
                self.trio_log.interrupt_check(self.char_count, self.cooldown_remaining,
                                               trigger="cooldown_active")
                return None

        # ── Yield trigger ──────────────────────────────────────
        if YIELD_TOKEN in new_text or YIELD_TOKEN in self._keyword_window:
            self.trio_log.interrupt_check(self.char_count, self.cooldown_remaining,
                                           trigger="yield_detected")
            return self._fire('yield')

        # ── Keyword trigger ──────────────────────────────────────
        text_lower = self._keyword_window.lower()
        matched_keywords = []
        for kw in self.interrupt_keywords:
            if kw.lower() in text_lower:
                matched_keywords.append(kw)
        
        if matched_keywords:
            self.trio_log.interrupt_check(self.char_count, self.cooldown_remaining,
                                           trigger=f"keywords: {matched_keywords}")
            return self._fire('keyword')

        # ── Patience trigger (flat probability with subtractive decay) ──────────
        if self.char_count > self.patience_threshold and not self.patience_checked:
            self.patience_checked = True  # Only roll once per threshold crossing
            
            # Calculate effective probability with decay
            effective_prob = max(
                0.05,
                self.patience_probability - (self.consecutive_patience_interrupts * self.patience_decay)
            )
            
            # Roll the dice
            roll = random.random()
            
            self.trio_log.interrupt_check(self.char_count, self.cooldown_remaining,
                                           trigger=f"patience_check: threshold={self.patience_threshold}, "
                                                   f"effective_prob={effective_prob:.3f}, "
                                                   f"decay_factor={self.consecutive_patience_interrupts * self.patience_decay:.3f}, "
                                                   f"roll={roll:.3f}, fires={roll < effective_prob}")
            
            if roll < effective_prob:
                return self._fire('patience')
            else:
                # Didn't fire this threshold crossing
                self.trio_log.interrupt_check(self.char_count, self.cooldown_remaining,
                                               trigger="patience_roll_failed")
                # Reset buffer to prevent re-rolling every token
                self._keyword_window = self._keyword_window[-50:]

        return None

    def _fire(self, trigger_type):
        """Fire an interrupt. Log and update state."""
        self.fired = True
        self.interrupt_count += 1
        self.cooldown_remaining = self.cooldown_chars
        
        if trigger_type == 'patience':
            self.consecutive_patience_interrupts += 1
        else:
            # Non-patience interrupts reset the decay counter
            self.consecutive_patience_interrupts = 0
        
        self.trio_log.interrupt_fire(self.interrupter, trigger_type, 
                                      self.char_count, self.interrupt_count)
        
        logger.info(f"[Trio] Interrupt fired: {trigger_type} "
                    f"(interrupter={self.interrupter['label']}, "
                    f"speaker={self.speaker['label']}, "
                    f"count={self.interrupt_count}/{self.max_interrupts}, "
                    f"consecutive_patience={self.consecutive_patience_interrupts})")
        
        return trigger_type

    def reset(self):
        """Reset for next monitoring cycle (after interrupt resolves)."""
        old_state = {
            'char_count': self.char_count,
            'fired': self.fired,
            'patience_checked': self.patience_checked
        }
        
        self.fired = False
        self.char_count = 0
        self.patience_checked = False
        
        self.trio_log.interrupt_check(0, self.cooldown_remaining,
                                       trigger="reset_after_interrupt")
        
        logger.debug(f"[Trio] InterruptMonitor reset: {old_state} -> "
                     f"char_count=0, fired=False, patience_checked=False")

    def get_state(self):
        """Return current monitor state for debugging."""
        return {
            'interrupter': self.interrupter['label'],
            'speaker': self.speaker['label'],
            'char_count': self.char_count,
            'interrupt_count': self.interrupt_count,
            'consecutive_patience_interrupts': self.consecutive_patience_interrupts,
            'cooldown_remaining': self.cooldown_remaining,
            'fired': self.fired,
            'patience_checked': self.patience_checked,
            'keywords': self.interrupt_keywords,
            'patience_threshold': self.patience_threshold,
            'patience_probability': self.patience_probability,
            'patience_decay': self.patience_decay,
            'max_interrupts': self.max_interrupts,
            'keyword_window': self._keyword_window[:100] + "..." if len(self._keyword_window) > 100 else self._keyword_window
        }


def truncate_at_boundary(text, pos, trio_log=None):
    """
    Truncate text at the last sentence/clause boundary before pos.
    Falls back to pos if no boundary found.
    
    LOGGING: Truncation decision logged with boundary type.
    """
    trio_log = trio_log or TrioLogger()
    
    if pos >= len(text):
        trio_log.interrupt_truncate(text, pos, text)
        return text

    # Try sentence boundary first, then clause
    boundary_found = None
    boundary_type = None
    
    for sep, sep_name in [('. ', 'sentence'), ('! ', 'sentence'), ('? ', 'sentence'),
                          (', ', 'clause'), ('; ', 'clause'), (' — ', 'em_dash'), (' ', 'word')]:
        boundary = text[:pos].rfind(sep)
        if boundary > pos * 0.5:  # Don't truncate too early
            boundary_found = boundary + len(sep)
            boundary_type = sep_name
            truncated = text[:boundary_found].rstrip()
            trio_log.interrupt_truncate(text, pos, truncated)
            trio_log.routing_tier(1, "truncate_boundary", 
                                  f"type={boundary_type}, pos={boundary_found}, "
                                  f"original_len={len(text)}, truncated_len={len(truncated)}")
            logger.debug(f"[Trio] Truncated at {boundary_type} boundary: "
                         f"pos={pos} -> boundary={boundary_found}, "
                         f"'{text[:50]}...' -> '{truncated[:50]}...'")
            return truncated

    # No boundary found, truncate at pos
    truncated = text[:pos]
    trio_log.interrupt_truncate(text, pos, truncated)
    trio_log.routing_tier(1, "truncate_fallback", 
                          f"no boundary found, truncating at pos={pos}")
    logger.debug(f"[Trio] Truncated at pos (no boundary): '{text[:50]}...' -> '{truncated[:50]}...'")
    return truncated