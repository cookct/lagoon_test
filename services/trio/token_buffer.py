"""
Trio Token Buffer Queue
Buffers raw streaming tokens, resolves [Name]: labels and <<YIELD>>/<<SILENT>> tokens,
and emits structured SSE events with pre-resolved speaker fields.

COMPREHENSIVE LOGGING:
- Every token feed logged at DEBUG
- Speaker changes logged at INFO
- Partial marker holds logged
- Buffer flushes logged

Enable with: logging.getLogger('services.trio').setLevel(logging.DEBUG)
"""
import re
import logging
import json
from services.trio.logging_utils import TrioLogger

logger = logging.getLogger(__name__)

# Label pattern: [name]: at start of a line or after whitespace
LABEL_PATTERN = re.compile(r'\[([A-Za-z\s]+)\]:\s*', re.MULTILINE)

# Special tokens
YIELD_TOKEN = '<<YIELD>>'
SILENT_TOKEN = '<<SILENT>>'

# Partial marker prefixes to hold back (might be start of a label or special token)
PARTIAL_PREFIXES = ['[', '<<']


class TokenBufferQueue:
    """
    Buffers raw tokens from a streaming response, resolves [Name]: labels
    and special tokens, and emits structured events.

    Usage:
        queue = TokenBufferQueue(current_speaker, participants)
        for chunk in stream:
            for event in queue.feed(chunk):
                yield event  # event is a dict
        for event in queue.flush():
            yield event
    
    LOGGING: All feeds, events, and speaker changes logged.
    """

    def __init__(self, current_speaker, participants, session_id=None):
        self.current_speaker = current_speaker
        self.participants = {p['label']: p for p in participants}
        self.trio_log = TrioLogger(session_id)
        
        # Build name-to-label mapping
        self.name_to_label = {}
        for p in participants:
            label = p['label']
            self.name_to_label[label.lower()] = label
            for variant in p.get('name_variants', [p['display_name']]):
                self.name_to_label[variant.lower()] = label
        
        self.buffer = ""
        self.finished = False
        self._event_count = 0
        
        self.trio_log.token_buffer_init(current_speaker, participants)
        logger.debug(f"[Trio] TokenBufferQueue initialized: speaker={current_speaker}, "
                     f"name_map={json.dumps(self.name_to_label)}")

    def feed(self, text):
        """
        Feed a chunk of text into the buffer.
        Yields event dicts: {type: 'delta'|'speaker_change'|'yield'|'silent', speaker, delta}
        
        LOGGING: Feed and all emitted events logged.
        """
        self.trio_log.token_feed(text, len(self.buffer) + len(text))
        
        self.buffer += text
        events = []

        while True:
            event = self._process_buffer()
            if event is None:
                break
            events.append(event)
            self._log_event(event)

        return events

    def flush(self):
        """Flush remaining buffer at stream end."""
        events = []
        
        self.trio_log.token_flush(len(self.buffer))

        # Process any remaining complete patterns
        while True:
            event = self._process_buffer()
            if event is None:
                break
            events.append(event)
            self._log_event(event)

        # Emit remaining buffer as a final delta
        if self.buffer:
            event = {
                'type': 'delta',
                'speaker': self.current_speaker,
                'delta': self.buffer
            }
            events.append(event)
            self._log_event(event)
            self.buffer = ""

        return events

    def _log_event(self, event):
        """Log an emitted event."""
        self._event_count += 1
        
        if event['type'] == 'delta':
            self.trio_log.token_event('delta', event['speaker'], event['delta'])
        elif event['type'] == 'speaker_change':
            self.trio_log.token_speaker_change(event.get('previous_speaker', '?'), event['speaker'])
        elif event['type'] == 'yield':
            self.trio_log.token_yield(event['speaker'])
        elif event['type'] == 'silent':
            self.trio_log.token_silent(event['speaker'])
        
        logger.debug(f"[Trio] TokenBuffer event #{self._event_count}: "
                     f"type={event['type']}, speaker={event['speaker']}, "
                     f"delta_len={len(event.get('delta', ''))}")

    def _process_buffer(self):
        """Try to extract the next event from the buffer. Returns event or None."""
        if not self.buffer:
            return None

        # Check for special tokens first
        for token, event_type in [(YIELD_TOKEN, 'yield'), (SILENT_TOKEN, 'silent')]:
            idx = self.buffer.find(token)
            if idx != -1:
                # Emit any text before the token as a delta
                if idx > 0:
                    before = self.buffer[:idx]
                    self.buffer = self.buffer[idx:]
                    return {
                        'type': 'delta',
                        'speaker': self.current_speaker,
                        'delta': before
                    }
                # Consume the token
                self.buffer = self.buffer[len(token):]
                return {
                    'type': event_type,
                    'speaker': self.current_speaker
                }

            # Check for partial token at end
            partial_len = self._check_partial(self.buffer, token)
            if partial_len:
                # Hold back - might be start of token
                hold = self.buffer[-partial_len:]
                safe = self.buffer[:-partial_len]
                if safe:
                    self.buffer = hold
                    self.trio_log.token_partial_hold(hold, safe)
                    logger.debug(f"[Trio] TokenBuffer partial hold: "
                                 f"partial='{hold}', safe_len={len(safe)}")
                    return {
                        'type': 'delta',
                        'speaker': self.current_speaker,
                        'delta': safe
                    }
                return None  # Wait for more

        # Check for [Name]: labels
        match = LABEL_PATTERN.search(self.buffer)
        if match:
            name = match.group(1).strip().lower()
            label = self.name_to_label.get(name)
            
            logger.debug(f"[Trio] TokenBuffer label match: "
                         f"name='{name}', resolved_label={label}, "
                         f"position={match.start()}, buffer_len={len(self.buffer)}")

            if label:
                # Emit text before the label as delta for current speaker
                before = self.buffer[:match.start()]
                if before:
                    self.buffer = self.buffer[match.start():]
                    return {
                        'type': 'delta',
                        'speaker': self.current_speaker,
                        'delta': before
                    }
                # Consume the label and switch speaker
                self.buffer = self.buffer[match.end():]
                if label != self.current_speaker:
                    old = self.current_speaker
                    self.current_speaker = label
                    return {
                        'type': 'speaker_change',
                        'speaker': label,
                        'previous_speaker': old
                    }
                # Same speaker, just consume the label
                return self._process_buffer()  # Recurse to process rest
            else:
                # Unknown label - treat as text, skip past the bracket
                logger.warning(f"[Trio] TokenBuffer unknown label: '{name}' - treating as text")
                self.buffer = self.buffer[match.end():]
                return self._process_buffer()

        # Check for partial label at end of buffer
        partial = self._check_partial_label(self.buffer)
        if partial:
            hold = self.buffer[-partial:]
            safe = self.buffer[:-partial]
            if safe:
                self.buffer = hold
                self.trio_log.token_partial_hold(hold, safe)
                logger.debug(f"[Trio] TokenBuffer partial label hold: "
                             f"partial_len={partial}, safe_len={len(safe)}")
                return {
                    'type': 'delta',
                    'speaker': self.current_speaker,
                    'delta': safe
                }
            return None  # Wait for more

        # No patterns found - emit all as delta
        delta = self.buffer
        self.buffer = ""
        return {
            'type': 'delta',
            'speaker': self.current_speaker,
            'delta': delta
        }

    def _check_partial(self, text, token):
        """Check if text ends with a partial prefix of token. Returns prefix length or 0."""
        for i in range(min(len(token) - 1, len(text)), 0, -1):
            if text.endswith(token[:i]):
                return i
        return 0

    def _check_partial_label(self, text):
        """Check if text ends with a partial [Name]: label. Returns partial length or 0."""
        # Look for partial patterns: "[", "[K", "[Kel", "[Kelly", "[Kelly]"
        # But not "[Kelly]:" (that's complete)
        
        # If ends with "[", might be start of label
        if text.endswith('['):
            return 1
        
        # If ends with partial name inside brackets
        # Pattern: [...[<partial_name>
        bracket_pos = text.rfind('[')
        if bracket_pos != -1:
            after_bracket = text[bracket_pos:]
            # Check if it's incomplete (no closing bracket + colon)
            if ']: ' not in after_bracket:
                # It's a partial label - hold back from bracket
                return len(text) - bracket_pos
        
        return 0

    def get_state(self):
        """Return current buffer state for debugging."""
        return {
            'current_speaker': self.current_speaker,
            'buffer_len': len(self.buffer),
            'buffer_preview': self.buffer[:100] + "..." if len(self.buffer) > 100 else self.buffer,
            'name_to_label': self.name_to_label,
            'event_count': self._event_count
        }