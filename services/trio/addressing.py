"""
Trio Addressing Resolver
Determines which character(s) the user is addressing based on their message.
4-tier resolution: name detection → both keywords → content inference → last-speaker default

COMPREHENSIVE LOGGING:
All routing decisions are logged at DEBUG level. Key results at INFO level.
Enable with: logging.getLogger('services.trio').setLevel(logging.DEBUG)
"""
import re
import logging
import json
from services.trio.logging_utils import TrioLogger

logger = logging.getLogger(__name__)


def resolve_addressee(user_message, participants, trio_state, config_cache=None, session_id=None):
    """
    Main entry point. Returns (addressee_label, routing_info_dict).

    routing_info contains:
        tier: 1-4 (which tier matched)
        method: 'name', 'both', 'content', 'last_speaker', 'alternation'
        reset_counters: bool (whether to reset consecutive_default_turns)
        details: str (human-readable explanation of why this routing was chosen)
    
    LOGGING: Every tier check and final result is logged.
    """
    trio_log = TrioLogger(session_id)
    
    msg_clean = user_message.strip()
    msg_preview = msg_clean[:50] + "..." if len(msg_clean) > 50 else msg_clean
    
    trio_log.routing_start(msg_preview, trio_state)
    
    # Strip @mentions for matching, but remember they indicate intent
    msg_for_match = re.sub(r'@(\w+)', r'\1', msg_clean)
    
    # ── Tier 1: Name Detection ──────────────────────────────────────
    trio_log.routing_tier(1, "name_detection", f"checking '{msg_preview}'")
    
    name_match = _detect_names(msg_for_match, participants, config_cache, trio_log)
    if not name_match:
        trio_log.routing_tier(1, "name_detection_prefix", "word-boundary failed, trying prefix fallback")
        name_match = _detect_names_prefix(msg_for_match, participants, trio_log)

    if name_match:
        # Check for trailing vocative override (e.g. "yeah, Kelly" → Kelly)
        trailing = _check_trailing_vocative(msg_for_match, participants, config_cache, trio_log)
        if trailing and trailing != name_match:
            trio_log.routing_trailing_vocative(name_match, trailing)
            name_match = trailing

        trio_log.routing_result(name_match, 1, 'name', True)
        return name_match, {
            'tier': 1, 'method': 'name', 'reset_counters': True,
            'details': f"Name '{name_match}' detected in message"
        }

    # ── Tier 2: "Both" Keywords ──────────────────────────────────────
    trio_log.routing_tier(2, "both_keywords", "checking for 'you two', 'both', etc.")
    
    if _check_both_keywords(msg_for_match, trio_log):
        trio_log.routing_result('both', 2, 'both', True)
        return 'both', {
            'tier': 2, 'method': 'both', 'reset_counters': True,
            'details': "Both-addressing keyword found (e.g. 'you two', 'both')"
        }

    # ── Tier 3: Content Inference ──────────────────────────────────────
    trio_log.routing_tier(3, "content_inference", "checking character-specific keywords")
    
    content_match = _content_inference(msg_for_match, participants, config_cache, trio_log)
    if content_match:
        trio_log.routing_result(content_match, 3, 'content', False)
        return content_match, {
            'tier': 3, 'method': 'content', 'reset_counters': False,
            'details': f"Content keywords suggest addressing '{content_match}'"
        }

    # ── Tier 4: Last-Speaker Default with Alternation ───────────────────
    trio_log.routing_tier(4, "last_speaker_default", "no explicit routing signal, using fallback")
    
    last_speaker = trio_state.get('last_speaker')
    consecutive = trio_state.get('consecutive_default_turns', {})
    if isinstance(consecutive, int):
        # Migration: convert legacy int to per-character dict
        consecutive = {last_speaker: consecutive} if last_speaker else {}
    
    max_consecutive = trio_state.get('max_consecutive_turns', 2)
    
    trio_log.routing_tier(4, "alternation_check", 
                          f"last_speaker={last_speaker}, consecutive={json.dumps(consecutive)}, max={max_consecutive}")

    if last_speaker:
        char_consecutive = consecutive.get(last_speaker, 0)
        trio_log.routing_tier(4, "consecutive_count", 
                              f"{last_speaker} has {char_consecutive} consecutive turns")
        
        if char_consecutive < max_consecutive:
            trio_log.routing_result(last_speaker, 4, 'last_speaker', False)
            return last_speaker, {
                'tier': 4, 'method': 'last_speaker', 'reset_counters': False,
                'details': f"Defaulting to last speaker '{last_speaker}' (consecutive={char_consecutive}/{max_consecutive})"
            }
        else:
            # Force alternation to the other character
            other = next((p['label'] for p in participants if p['label'] != last_speaker), None)
            if other:
                trio_log.routing_tier(4, "forced_alternation", 
                                      f"{last_speaker} hit max ({max_consecutive}), switching to {other}")
                trio_log.routing_result(other, 4, 'alternation', True)
                return other, {
                    'tier': 4, 'method': 'alternation', 'reset_counters': True,
                    'details': f"Forced alternation from '{last_speaker}' to '{other}' (max consecutive reached)"
                }

    # Fallback: first participant
    if participants:
        fallback = participants[0]['label']
        trio_log.routing_result(fallback, 4, 'fallback', True)
        return fallback, {
            'tier': 4, 'method': 'fallback', 'reset_counters': True,
            'details': f"No routing signal, falling back to first participant '{fallback}'"
        }

    trio_log.routing_result(None, 4, 'fallback', True)
    return None, {
        'tier': 4, 'method': 'fallback', 'reset_counters': True,
        'details': "No routing signal and no participants"
    }


def _detect_names(msg, participants, config_cache=None, trio_log=None):
    """
    Word-boundary regex matching against name_variants.
    Returns matched label or None.
    
    LOGGING: All matches and positions are logged.
    """
    matches = {}
    first_positions = {}
    
    trio_log = trio_log or TrioLogger()

    for p in participants:
        label = p['label']
        variants = p.get('name_variants', [p['display_name']])
        if config_cache and label in config_cache:
            cached = config_cache[label]
            variants = cached.get('name_variants', variants)
        
        trio_log.routing_tier(1, f"checking_{label}", f"variants={variants}")

        for variant in set(variants):
            # Word-boundary match, case-insensitive
            pattern = r'\b' + re.escape(variant) + r'\b'
            m = re.search(pattern, msg, re.IGNORECASE)
            if m:
                matches[label] = True
                first_positions[label] = m.start()
                trio_log.name_detect_word_boundary(msg, {
                    'label': label,
                    'variant': variant,
                    'position': m.start(),
                    'matched_text': m.group()
                })
                break

    if not matches:
        trio_log.name_detect_no_match(msg)
        return None

    # If both characters matched, first-mentioned wins (by position in message)
    if len(matches) > 1:
        winner = min(first_positions, key=first_positions.get)
        trio_log.routing_tier(1, "multi_match", 
                              f"both matched, first-mentioned wins: {winner} at pos {first_positions[winner]}")
        return winner

    return next(iter(matches))


def _detect_names_prefix(msg, participants, trio_log=None):
    """
    Prefix fallback: if no word-boundary match, check if message starts with
    a prefix of any name variant (min 3 chars).
    
    LOGGING: All prefix attempts logged.
    """
    trio_log = trio_log or TrioLogger()
    
    msg_lower = msg.lower().strip()
    if msg_lower.startswith('@'):
        msg_lower = msg_lower[1:]

    # Only run on short messages (< 100 chars) where vocative is plausible
    if len(msg_lower) > 100:
        trio_log.routing_tier(1, "prefix_skip", f"msg too long ({len(msg_lower)} chars), skipping prefix check")
        return None

    matches = {}
    for p in participants:
        label = p['label']
        variants = p.get('name_variants', [p['display_name']])

        for variant in variants:
            v_lower = variant.lower()
            if len(v_lower) >= 3 and msg_lower.startswith(v_lower[:min(len(v_lower), len(msg_lower))]):
                match_len = min(len(v_lower), len(msg_lower))
                if match_len >= 3 and v_lower.startswith(msg_lower[:match_len]):
                    matches[label] = match_len
                    trio_log.name_detect_prefix(msg, {
                        'label': label,
                        'variant': variant,
                        'match_len': match_len,
                        'prefix': msg_lower[:match_len]
                    })
                    break

    if not matches:
        trio_log.name_detect_no_match(msg)
        return None

    if len(matches) > 1:
        winner = max(matches, key=matches.get)
        trio_log.routing_tier(1, "prefix_multi", f"both matched by prefix, longest wins: {winner}")
        return winner

    return next(iter(matches))


def _check_trailing_vocative(msg, participants, config_cache=None, trio_log=None):
    """
    Check for trailing vocative: "yeah, Kelly" or "right, Kel"
    Returns matched label or None.

    This overrides first-mentioned routing when the message ends with a
    vocative comma + name. Example: "Tell Nathan he's wrong, Kelly" → Kelly.
    
    LOGGING: Vocative detection logged.
    """
    trio_log = trio_log or TrioLogger()
    
    m = re.search(r',\s*([A-Za-z]+)[\s.!?]*$', msg)
    if not m:
        trio_log.routing_tier(1, "vocative_check", "no trailing vocative pattern found")
        return None

    vocative = m.group(1)
    trio_log.routing_tier(1, "vocative_found", f"trailing vocative candidate: '{vocative}'")
    
    result = _detect_names(vocative, participants, config_cache, trio_log) or \
             _detect_names_prefix(vocative, participants, trio_log)
    
    if result:
        trio_log.routing_tier(1, "vocative_match", f"trailing vocative resolved to: {result}")
    else:
        trio_log.routing_tier(1, "vocative_no_match", f"'{vocative}' not recognized as name")
    
    return result


def _check_both_keywords(msg, trio_log=None):
    """Check if user is addressing both characters."""
    trio_log = trio_log or TrioLogger()
    
    both_patterns = [
        r'\byou two\b',
        r'\byou both\b',
        r'\bboth of you\b',
        r'\byou guys\b',
        r'\bboth\b',
    ]
    msg_lower = msg.lower()
    for pattern in both_patterns:
        m = re.search(pattern, msg_lower)
        if m:
            trio_log.routing_tier(2, "both_keyword_match", 
                                  f"pattern '{pattern}' matched: '{m.group()}'")
            return True
    
    trio_log.routing_tier(2, "both_keyword_none", "no both-addressing keywords found")
    return False


def _content_inference(msg, participants, config_cache=None, trio_log=None):
    """
    Infer addressee from content keywords.
    Each character has addressing_keywords that hint they're being addressed.
    
    LOGGING: Keyword matches logged per character.
    """
    trio_log = trio_log or TrioLogger()
    
    msg_lower = msg.lower()
    scores = {}

    for p in participants:
        label = p['label']
        keywords = p.get('addressing_keywords', [])
        if config_cache and label in config_cache:
            keywords = config_cache[label].get('addressing_keywords', keywords)
        
        trio_log.routing_tier(3, f"keywords_{label}", f"checking {keywords}")
        
        matched_keywords = []
        for kw in keywords:
            if kw.lower() in msg_lower:
                scores[label] = scores.get(label, 0) + 1
                matched_keywords.append(kw)
        
        if matched_keywords:
            trio_log.routing_tier(3, f"keywords_{label}_match", 
                                  f"matched: {matched_keywords}, score={scores[label]}")

    if not scores:
        trio_log.routing_tier(3, "keywords_none", "no keyword matches for any character")
        return None

    # Only return if one character clearly wins (no tie)
    if len(scores) == 1:
        winner = next(iter(scores))
        trio_log.routing_tier(3, "keywords_winner", f"single winner: {winner}")
        return winner
    
    trio_log.routing_tier(3, "keywords_tie", f"tie between {list(scores.keys())}, falling through")
    return None


def update_trio_state(trio_state, addressee_label, routing_info, participants, trio_log=None):
    """
    Update trio_state after resolving addressee.
    consecutive_default_turns is a per-character dict: {label: count}
    
    LOGGING: State changes logged.
    """
    trio_log = trio_log or TrioLogger()
    
    old_state = {
        'last_speaker': trio_state.get('last_speaker'),
        'consecutive_default_turns': trio_state.get('consecutive_default_turns', {}),
        'active_thread': trio_state.get('active_thread')
    }
    
    # Ensure consecutive_default_turns is a dict (migration from legacy int)
    if 'consecutive_default_turns' not in trio_state:
        trio_state['consecutive_default_turns'] = {}
    elif isinstance(trio_state['consecutive_default_turns'], int):
        old = trio_state['consecutive_default_turns']
        trio_state['consecutive_default_turns'] = {}
        if trio_state.get('last_speaker'):
            trio_state['consecutive_default_turns'][trio_state['last_speaker']] = old
            trio_log.warning("state_migration", 
                             f"converted legacy int consecutive ({old}) to dict")

    consecutive = trio_state['consecutive_default_turns']
    
    old_count = consecutive.get(addressee_label, 0)
    
    if routing_info['reset_counters']:
        # Reset the routed character's counter
        consecutive[addressee_label] = 0
        trio_log.consecutive_counter(addressee_label, old_count, 0, reset=True)
    else:
        if routing_info['method'] == 'last_speaker':
            consecutive[addressee_label] = consecutive.get(addressee_label, 0) + 1
            trio_log.consecutive_counter(addressee_label, old_count, 
                                          consecutive[addressee_label], reset=False)

    trio_state['last_speaker'] = addressee_label
    trio_state['active_thread'] = addressee_label
    
    new_state = {
        'last_speaker': trio_state['last_speaker'],
        'consecutive_default_turns': trio_state['consecutive_default_turns'],
        'active_thread': trio_state['active_thread']
    }
    
    trio_log.state_update(old_state, new_state)
    
    return trio_state