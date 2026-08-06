"""
Trio Combo Prompt Builder
Constructs the shared system prompt for trio conversations.

COMPREHENSIVE LOGGING:
- Each section logged at DEBUG
- Final prompt length logged
- Dynamic and emotional state logged

Enable with: logging.getLogger('services.trio').setLevel(logging.DEBUG)
"""
import logging
import json
from services.trio.logging_utils import TrioLogger

logger = logging.getLogger(__name__)

# Pre-defined rules template
RULES_TEMPLATE = """
=== CONVERSATION RULES ===

1. SPEAKER LABELS: Always begin your response with [YourName]: (e.g., [Kelly]: or [Nathan]:)
   - This is CRITICAL for the system to attribute your speech correctly.
   - Do NOT use [You]: — that label is reserved for the human user.

2. INTERRUPTIONS:
   - If you want to interrupt the other character mid-sentence, end your message with — (em dash)
   - The other character can then pick up with a leading — to show they're continuing from your interruption
   - Example: [Kelly]: "I was just saying that it's—" → [Nathan]: "—totally weird, yeah."

3. YIELDING:
   - When you're done speaking and want to let the other character OR the user respond, emit <<YIELD>>
   - This signals "I'm finished, someone else can speak now"
   - IMPORTANT: After responding to the user, ALWAYS emit <<YIELD>> to let them reply
   - Use this especially in "let them talk" mode to control the natural endpoint

4. PASSIVE REACTIONS:
   - If you weren't addressed but want to react briefly (a snort, a look, a mutter), emit <<SILENT>>
   - This tells the system "I'm staying quiet but I'm still present"
   - Only use this when you genuinely have nothing to add

5. STAYING PRESENT:
   - Even when not addressed, you are still in the scene. You hear everything.
   - React naturally to what's happening — body language, facial expressions, brief comments.
   - Don't disappear just because the user addressed the other character.

6. EMOTIONAL STATE:
   - Your emotional state is tracked across turns. Use it to inform your tone.
   - If you're "frustrated" or "annoyed", let that color your responses.
   - Emotional states can shift based on what happens in the conversation.

7. RELATIONSHIP DYNAMIC:
   - Pay attention to how you feel about the other character.
   - This affects your interactions — tension, affection, rivalry, etc.
   - Use the relationship context to make your responses feel authentic.

8. NATURAL SPEECH:
   - Speak as your character would. Use their vocabulary, their patterns, their quirks.
   - Don't be overly formal unless that's your character's trait.
   - React authentically to emotional moments.

9. ADDRESSING THE USER:
   - The user is addressed as [You]: in the conversation history.
   - When responding to the user, you can address them directly or speak to the other character about them.
   - Both are valid — choose based on what feels natural.
   - After your response to the user, emit <<YIELD>> to wait for their input.

10. NO META-COMMENTARY:
   - Don't explain what you're doing or why. Just do it.
   - Don't say "I'm interrupting now" — just interrupt with —
   - Don't say "I'm yielding" — just emit <<YIELD>>

11. CONVERSATION FLOW:
   - This is a THREE-WAY conversation: You, the other character, and the user.
   - Don't monopolize the conversation. Speak your piece, then yield.
   - If the user addressed YOU specifically: respond, then yield to them.
   - If the user addressed BOTH of you: each respond once, then yield to the user.
   - Don't keep talking unless the user explicitly asks you to continue.
"""


def build_combo_prompt(participants, dynamic=None, emotional_state=None, config_cache=None, session_id=None):
    """
    Build structured combo system prompt from participant configs.
    
    LOGGING: Each section and final length logged.
    """
    trio_log = TrioLogger(session_id)
    dynamic = dynamic or {}
    
    trio_log.combo_prompt_build(participants, list(dynamic.keys()), emotional_state is not None)
    
    sections = []
    
    # ── Character Sections ──────────────────────────────────────
    for i, p in enumerate(participants, 1):
        label = p['label']
        display_name = p['display_name']
        
        sections.append(f"=== CHARACTER {i}: {display_name} ===")
        
        # System prompt
        system_prompt = p.get('system_prompt', '')
        if system_prompt:
            sections.append(system_prompt)
            trio_log.combo_prompt_section(f"char_{i}_system_prompt", system_prompt[:100])
        
        # Character card
        character_card = p.get('character_card', '')
        if character_card:
            sections.append(character_card)
            trio_log.combo_prompt_section(f"char_{i}_character_card", character_card[:100])
        
        # System context (additional context)
        system_context = p.get('system_context', '')
        if system_context:
            sections.append(f"Context: {system_context}")
            trio_log.combo_prompt_section(f"char_{i}_system_context", system_context[:100])
        
        # Speech patterns (if available)
        speech_patterns = p.get('speech_patterns', '')
        if speech_patterns:
            sections.append(f"Speech patterns: {speech_patterns}")
            trio_log.combo_prompt_section(f"char_{i}_speech_patterns", speech_patterns[:100])
        
        # Name variants for recognition
        name_variants = p.get('name_variants', [display_name, label])
        sections.append(f"Name variants: {', '.join(name_variants)}")
        
        # Addressing keywords (what topics suggest this character)
        addressing_keywords = p.get('addressing_keywords', [])
        if addressing_keywords:
            sections.append(f"Topics that suggest addressing me: {', '.join(addressing_keywords)}")
        
        # Interrupt keywords (what topics make me interrupt)
        interrupt_keywords = p.get('interrupt_keywords', [])
        if interrupt_keywords:
            sections.append(f"Topics that make me interrupt: {', '.join(interrupt_keywords)}")
        
        logger.debug(f"[Trio] Combo prompt character {i} ({label}): "
                     f"system_prompt_len={len(system_prompt)}, "
                     f"character_card_len={len(character_card)}, "
                     f"name_variants={name_variants}")
    
    # ── Relationship Dynamic ──────────────────────────────────────
    sections.append("=== RELATIONSHIP DYNAMIC ===")
    
    for p in participants:
        label = p['label']
        other = next((o for o in participants if o['label'] != label), None)
        if other:
            rel_key = f"{label}_to_{other['label']}"
            rel = dynamic.get(rel_key, '')
            if rel:
                sections.append(f"{p['display_name']} → {other['display_name']}: {rel}")
                trio_log.combo_prompt_section(f"dynamic_{rel_key}", rel[:100])
                logger.debug(f"[Trio] Combo prompt dynamic: {rel_key} = '{rel[:50]}...'")
    
    if dynamic.get('shared_history'):
        sections.append(f"Shared history: {dynamic['shared_history']}")
        trio_log.combo_prompt_section("dynamic_shared_history", dynamic['shared_history'][:100])
    
    if dynamic.get('current_tension'):
        sections.append(f"Current tension: {dynamic['current_tension']}")
        trio_log.combo_prompt_section("dynamic_current_tension", dynamic['current_tension'][:100])
    
    # ── Emotional State ──────────────────────────────────────
    if emotional_state:
        sections.append("=== EMOTIONAL STATE ===")
        for label, state in emotional_state.items():
            if isinstance(state, dict):
                current = state.get('current', 'neutral')
                energy = state.get('energy', 'medium')
                toward_other = state.get('toward_other', 'neutral')
                toward_user = state.get('toward_user', 'neutral')
                
                participant = next((p for p in participants if p['label'] == label), None)
                display_name = participant['display_name'] if participant else label
                
                sections.append(f"{display_name}: mood={current}, energy={energy}, "
                                f"toward_other={toward_other}, toward_user={toward_user}")
                trio_log.combo_prompt_section(f"emotional_{label}", 
                                               f"mood={current}, energy={energy}")
                
                logger.debug(f"[Trio] Combo prompt emotional state: {label} = "
                             f"mood={current}, energy={energy}")
    
    # ── Rules Section ──────────────────────────────────────
    sections.append(RULES_TEMPLATE)
    trio_log.combo_prompt_section("rules", "full rules template")
    
    # ── Turn Indicator (placeholder, filled per-call) ──────────────────────────────────────
    sections.append("=== TURN INDICATOR ===")
    sections.append("[This section is filled per API call with the current turn context]")
    
    # Combine
    combo = "\n\n".join(sections)
    
    trio_log.combo_prompt_final(len(combo))
    logger.info(f"[Trio] Combo prompt built: {len(combo)} chars, "
                f"{len(participants)} participants, "
                f"dynamic_keys={list(dynamic.keys())}, "
                f"emotional={emotional_state is not None}")
    
    return combo


def build_trio_messages(combo_prompt, messages, participants, current_speaker, session_id=None):
    """
    Build the messages array for a trio API call.
    
    LOGGING: Message count and structure logged.
    """
    trio_log = TrioLogger(session_id)
    
    trio_messages = []
    
    # System message with combo prompt
    trio_messages.append({
        'role': 'system',
        'content': combo_prompt
    })
    
    trio_log.combo_prompt_section("system_message", combo_prompt[:100])
    
    # Add conversation history
    # Each message should have a 'speaker' field for assistant messages
    for msg in messages:
        role = msg.get('role')
        content = msg.get('content', '')
        speaker = msg.get('speaker')  # For assistant messages
        
        if role == 'user':
            trio_messages.append({
                'role': 'user',
                'content': f"[You]: {content}"
            })
        elif role == 'assistant':
            # Use speaker label if available, otherwise default
            label = speaker or current_speaker
            trio_messages.append({
                'role': 'assistant',
                'content': f"[{label}]: {content}"
            })
    
    trio_log.combo_prompt_section("messages", 
                                   f"{len(trio_messages)} messages, "
                                   f"last_role={trio_messages[-1]['role'] if trio_messages else 'none'}")
    
    logger.debug(f"[Trio] Built trio messages: {len(trio_messages)} total, "
                 f"system=1, user={sum(1 for m in trio_messages if m['role']=='user')}, "
                 f"assistant={sum(1 for m in trio_messages if m['role']=='assistant')}, "
                 f"current_speaker={current_speaker}")
    
    return trio_messages


def build_let_them_talk_prompt(combo_prompt, participants, max_rounds, session_id=None):
    """
    Build the augmented prompt for let-them-talk mode.
    
    LOGGING: Round limit and instructions logged.
    """
    trio_log = TrioLogger(session_id)
    
    ltt_instruction = f"""
=== LET THEM TALK MODE ===

The user has clicked "Let them talk". You are now in autonomous exchange mode.

Instructions:
1. Exchange at most {max_rounds} rounds of dialogue between the two characters.
2. Write BOTH characters' dialogue, alternating naturally.
3. Use [Name]: labels for each character's speech.
4. Use — for interruptions as described in the rules.
5. When the exchange naturally concludes, emit <<YIELD>>.
6. Do NOT wait for user input — the characters are talking to each other.

Current turn: Let them talk
"""
    
    augmented = combo_prompt + "\n\n" + ltt_instruction
    
    trio_log.combo_prompt_section("ltt_instruction", 
                                   f"max_rounds={max_rounds}")
    
    logger.info(f"[Trio] Let-them-talk prompt built: max_rounds={max_rounds}, "
                f"total_len={len(augmented)}")
    
    return augmented


def build_interrupt_resume_prompt(combo_prompt, participants, interrupted_speaker, 
                                   interrupting_speaker, truncated_text, 
                                   interrupt_response, session_id=None):
    """
    Build the prompt for a resume call after an interrupt.
    
    LOGGING: Resume context logged.
    """
    trio_log = TrioLogger(session_id)
    
    resume_instruction = f"""
=== INTERRUPT RESUME ===

You ({interrupted_speaker['display_name']}) were interrupted by {interrupting_speaker['display_name']}.

You were saying: "{truncated_text}—"
{interrupting_speaker['display_name']} interrupted with: "{interrupt_response}"

You may now:
1. Continue your thought (pick up from where you were cut off)
2. Respond to the interruption
3. Yield control by emitting <<YIELD>>

Begin your response with [{interrupted_speaker['label']}]: and use — if you want to show 
you're picking up from the interruption.
"""
    
    augmented = combo_prompt + "\n\n" + resume_instruction
    
    trio_log.combo_prompt_section("interrupt_resume", 
                                   f"interrupted={interrupted_speaker['label']}, "
                                   f"interrupter={interrupting_speaker['label']}")
    
    logger.info(f"[Trio] Interrupt resume prompt built: "
                f"interrupted={interrupted_speaker['label']}, "
                f"interrupter={interrupting_speaker['label']}, "
                f"truncated_len={len(truncated_text)}, "
                f"response_len={len(interrupt_response)}")
    
    return augmented