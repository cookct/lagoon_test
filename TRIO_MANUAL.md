# Trio Mode — Operator's Manual

A guide to running three-way conversations (2 AI characters + 1 human) in Lagoon.

---

## Table of Contents

1. [What Is Trio Mode](#1-what-is-trio-mode)
2. [Quick Start](#2-quick-start)
3. [Character Configuration](#3-character-configuration)
4. [Trio Session Configuration](#4-trio-session-configuration)
5. [The Addressing System](#5-the-addressing-system)
6. [Interrupts](#6-interrupts)
7. [Let Them Talk](#7-let-them-talk)
8. [The Participant Strip](#8-the-participant-strip)
9. [Emotional State](#9-emotional-state)
10. [Message Format & Labels](#10-message-format--labels)
11. [API Endpoints](#11-api-endpoints)
12. [Troubleshooting](#12-troubleshooting)
13. [Advanced Tuning](#13-advanced-tuning)

---

## 1. What Is Trio Mode

Trio Mode lets you put **two AI characters** in a single conversation with **one human user**. Both characters are always present in the scene — they hear everything, even when only one is speaking. The non-speaking character can react passively, interrupt the speaker, or yield their turn.

This is different from simply switching between two character configs. In Trio Mode:

- Both characters' personas are combined into a single system prompt.
- The system decides **who you're talking to** based on what you say.
- Characters can **interrupt each other** mid-sentence.
- You can step back and **let them talk to each other** autonomously.

### Architectural note: one shared model

Trio Mode uses a **single model** for both characters (plan §4.3, Option A). This is a deliberate design decision, not a limitation. The combo prompt, TokenBufferQueue, let-them-talk single-call design, and interrupt protocol all depend on both characters sharing the same model and context window. Per-character models are not supported and would require a fundamentally different architecture.

### When to use it

- Two characters with a dynamic relationship (siblings, rivals, lovers, co-workers).
- Scenes where you want to observe chemistry or conflict between characters.
- Roleplay where you interact with both characters and they react to each other.

### When NOT to use it

- You want tight control over who responds every turn (use regular chat with character switching instead).
- You need each character to have a completely separate context window (Trio shares one combined context).
- Token budget is very tight (the combo prompt is larger than a single-character prompt).

---

## 2. Quick Start

### Prerequisites

- Two character config files in `configs/` (e.g., `Kelly Bailey.json`, `Nathan Young.json`).
- A model configured and an API key set.

### Steps

1. **Add trio fields to each character config** (see [§3](#3-character-configuration)).
2. **Create a trio session config** — either save a JSON file or configure via the UI (see [§4](#4-trio-session-configuration)).
3. **Set `mode: "trio"`** in the session config.
4. **Load the config** and start chatting. The participant strip appears at the top of the chat area.

### Minimal Example

Character A (`configs/Kelly Bailey.json`) — add these fields:

```json
{
  "trio_label": "kelly",
  "trio_color": "#e85d4a",
  "name_variants": ["Kelly", "Kel", "Kels"],
  "addressing_keywords": ["art", "paint", "gallery"],
  "interrupt_keywords": ["boring", "whatever", "not listening"],
  "patience_threshold": 400
}
```

Character B (`configs/Nathan Young.json`) — add these fields:

```json
{
  "trio_label": "nathan",
  "trio_color": "#4a9eff",
  "name_variants": ["Nathan", "Nate", "Young"],
  "addressing_keywords": ["code", "tech", "computer"],
  "interrupt_keywords": ["idiot", "wrong", "stupid"],
  "patience_threshold": 350
}
```

Session config:

```json
{
  "mode": "trio",
  "model": "llama-3.3-70b",
  "participants": ["Kelly Bailey", "Nathan Young"],
  "dynamic": {
    "kelly_to_nathan": "Kelly finds Nathan insufferably annoying but secretly cares about him.",
    "nathan_to_kelly": "Nathan enjoys provoking Kelly because her reactions are entertaining.",
    "history_summary": "Haven't spoken in three years. Kelly left home at 18."
  },
  "emotional_state": {
    "kelly": { "current": "guarded", "energy": "low", "toward_other": "resentful", "toward_user": "neutral" },
    "nathan": { "current": "performing", "energy": "high", "toward_other": "defensive", "toward_user": "friendly" }
  },
  "temperature": 0.8,
  "max_tokens": 2048
}
```

Load this config, type a message, and the system routes it to the right character.

---

## 3. Character Configuration

Each character needs its standard fields (`system_prompt`, `character_card`, etc.) **plus** the following trio-specific fields. Add these to the character's JSON config file in `configs/`.

### Required Trio Fields

| Field | Type | Description |
|-------|------|-------------|
| `trio_label` | string | Short lowercase identifier used internally. Must be unique across participants. Example: `"kelly"`. |
| `trio_color` | string | Hex color for the character's message borders and participant card. Example: `"#e85d4a"`. |
| `name_variants` | array | All names/nicknames the character responds to. Used for name detection (Tier 1). Example: `["Nathan", "Nate"]`. |

### Optional Trio Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `addressing_keywords` | array | `[]` | Content keywords that hint this character is being addressed (Tier 3 inference). Example: `["art", "paint", "gallery"]`. |
| `interrupt_keywords` | array | `[]` | Words that, if spoken by the *other* character, trigger an interrupt from this character. Example: `["boring", "whatever"]`. |
| `patience_threshold` | int | `400` | Character count after which the other character may probabilistically interrupt. Lower = more interrupt-prone. |
| `patience_interrupt_probability` | float | `0.15` | Base probability of a patience-triggered interrupt once threshold is exceeded. |
| `patience_decay` | float | `0.05` | Subtractive decay per consecutive patience interrupt. Each patience interrupt reduces the next probability by this amount (floor: 0.05). |
| `max_interrupts` | int | `3` | Maximum interrupts per speaking turn for this character. |
| `interrupt_cooldown` | int | `500` | Characters of cooldown after each interrupt before another can fire. |
| `reaction_probability` | float | `0.35` | Probability of generating a passive reaction when not directly addressed. Used when `passive_presence_enabled` is true. |

### How to choose values

**`trio_label`**: Keep it short and lowercase — it's used in `[label]:` prefixes during streaming. Use the character's first name: `kelly`, `nathan`, `hermione`.

**`trio_color`**: Pick contrasting colors so messages are visually distinct. Use a color picker. Warm vs. cool pairs work well: red/blue, orange/teal, gold/purple.

**`name_variants`**: Include every name a user might type — full name, nickname, diminutive. The system matches using **word-boundary regex** (`\bname\b`), case-insensitive. This means `"Nate"` will not accidentally match inside `"Nathan"` and vice versa — order in the array does not matter. Include all variants you want recognized; the resolver tries each and breaks on first match per character.

**`addressing_keywords`**: Think about what topics are *unique* to this character. If Kelly is an artist, `["art", "paint", "canvas", "gallery"]` tells the system that a message about painting is probably directed at her.

**`interrupt_keywords`**: What would make this character snap? If Nathan is argumentative, `["wrong", "stupid", "idiot", "no"]` means he'll cut in when Kelly says those words. Keep this list short — 3-6 words. Too many keywords and the character interrupts constantly.

**`patience_threshold`**: Measured in characters of the other character's response. At 400, the other character can speak ~400 characters (~70 words) before interrupt probability is rolled. Lower this for impatient characters, raise it for patient ones.

**`patience_interrupt_probability`** and **`patience_decay`**: These control the patience-trigger probability. When the other character's response exceeds `patience_threshold`, a single probability roll is made:

```
effective_prob = max(0.05, patience_interrupt_probability - (consecutive_patience_interrupts × patience_decay))
```

With defaults (0.15 base, 0.05 decay): first patience check rolls at 15%, second at 10%, third at 5%, then floors at 5%. This prevents interrupt chains from spiraling.

---

## 4. Trio Session Configuration

The session config is what you load to start a trio chat. It can be saved as a JSON file in `configs/` or configured at runtime.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mode` | string | Yes | Must be `"trio"`. |
| `model` | string | Yes | Model ID used for **both** characters (shared model — see [§1](#1-what-is-trio-mode)). Example: `"llama-3.3-70b"`. |
| `participants` | array | Yes | List of character config names (without `.json`) or inline participant objects. Example: `["Kelly Bailey", "Nathan Young"]`. |
| `dynamic` | object | No | Relationship metadata with directional relationships (see below). |
| `emotional_state` | object | No | Per-character mood (see [§9](#9-emotional-state)). |
| `temperature` | float | No | Sampling temperature. Default `0.7`. |
| `max_tokens` | int | No | Max tokens per response. Default `2048`. |
| `trio_state` | object | No | Internal state (last speaker, turn counters). Managed automatically. |

### Session Config Toggles

These top-level fields control global behavior. All are optional with sensible defaults.

| Field | Type | Default | Description |
|-------|------|----------|-------------|
| `interruptions_enabled` | bool | `true` | Master toggle for interrupts. Set to `false` to disable all interrupts (yield triggers, keyword triggers, and patience triggers). |
| `passive_presence_enabled` | bool | `true` | Allow `<<SILENT>>` passive reactions. When `false`, `<<SILENT>>` tokens are ignored and not emitted as events. |
| `emotional_tracking_enabled` | bool | `true` | Include emotional context in the combo prompt. When `false`, `emotional_state` is omitted from the prompt entirely. |
| `ambient_responses` | bool | `false` | Tier 4 group response mode. When `true`, Tier 4 (last-speaker default) routes to *both* characters instead of one. |
| `max_consecutive_turns` | int | `2` | Alternation threshold. After this many consecutive Tier 4 defaults to the same character, the system forces a switch. |
| `turn_order` | string | `"context"` | `"context"` (resolve addressee from message content) or `"sequential"` (strict alternation, ignore content). |
| `let_them_talk_rounds` | int | `2` | Number of exchange rounds for Let Them Talk. A "round" is one exchange pair (A speaks, then B speaks), so 2 rounds = 4 messages. |

### `dynamic` Object — Directional Relationships

The `dynamic` object supports **directional relationships** — each character has their own internal model of the other. This is the core of what makes the combo prompt's RELATIONSHIP DYNAMIC section work. Use the `{label}_to_{label}` format:

```json
"dynamic": {
  "kelly_to_nathan": "Kelly finds Nathan insufferably annoying but secretly cares about him. She left home at 18 and never forgave him for not following.",
  "nathan_to_kelly": "Nathan enjoys provoking Kelly because her reactions are entertaining. Underneath, he's terrified she'll leave again and masks it with mockery.",
  "history_summary": "Haven't spoken in three years. Kelly left home at 18."
}
```

The combo prompt builder templates these as separate entries:

```
Kelly → Nathan: Kelly finds Nathan insufferably annoying but secretly cares...
Nathan → Kelly: Nathan enjoys provoking Kelly because her reactions are...
```

This is significantly more powerful than a single symmetric label like `"estranged siblings"`, which tells the model nothing about how each character processes the estrangement differently. **Use directional relationships.**

`history_summary` is optional shared backstory. Keep it under 200 words.

### Inline Participants

Instead of referencing config files by name, you can inline participant definitions:

```json
"participants": [
  {
    "config_name": "Kelly Bailey",
    "trio_label": "kelly",
    "trio_color": "#e85d4a"
  },
  {
    "config_name": "Nathan Young",
    "trio_label": "nathan",
    "trio_color": "#4a9eff"
  }
]
```

This lets you override trio fields per-session without editing the character config files. The backend reads `label` from the session config's participant array (falling back to `trio_label` from the character config). Both field names are supported.

---

## 5. The Addressing System

When you send a message, the system decides **who should respond** using a 4-tier resolver. It tries each tier in order and uses the first one that matches.

### Tier 1: Name Detection

The system scans your message for any of the characters' `name_variants` using **word-boundary regex** (`\bname\b`), case-insensitive.

- **"Kelly, what do you think?"** → Kelly responds.
- **"Hey Nate, pass me that."** → Nathan responds.
- **"I agree with Nathan."** → Nathan responds.

**First-mentioned wins**: If you name both characters ("Kelly, tell Nathan he's wrong"), the first-named character responds — *unless* the trailing vocative override applies (see below).

**Trailing vocative override**: If the message ends with ", Name" ("Tell Nathan he's wrong, Kelly"), the trailing name wins over any name earlier in the sentence. The system checks for a comma followed by a name at the end of the message. This handles the natural speech pattern of addressing someone by name at the end of a sentence.

**Prefix fallback**: If no word-boundary match is found, the system checks if your message *starts with* a prefix of any name variant (minimum 3 characters). This catches typos and partial names: "Kel" matches Kelly, "Nat" matches Nathan.

### Tier 2: "Both" Keywords

If no name is detected, the system checks for phrases addressing both characters:

- "you two"
- "you both"
- "both of you"
- "you guys"
- "both"

**"You two figure it out."** → Both characters respond (sequentially).

### Tier 3: Content Inference

If no name and no "both" keyword, the system checks each character's `addressing_keywords` against your message.

- Kelly's keywords: `["art", "paint", "gallery"]`
- **"Can you show me that painting again?"** → "paint" matches → Kelly responds.

This only fires if **exactly one** character's keywords match. If both match (or neither), it falls through to Tier 4.

### Tier 4: Last-Speaker Default with Alternation

If nothing else matched, the system defaults to the **last character who spoke**. This keeps a conversation flowing naturally — if you're going back and forth with Kelly, follow-up messages keep going to Kelly.

**Forced alternation**: After the same character responds `max_consecutive_turns` times in a row via Tier 4 (default: 2), the system forces a switch to the other character. This prevents one character from monopolizing the conversation when the user isn't explicitly directing traffic.

**Ambient mode**: If `ambient_responses` is `true`, Tier 4 routes to *both* characters instead of one. This creates a "group response" effect where both characters react to undirected messages.

### How to influence routing

| You want... | Do this |
|-------------|---------|
| Specific character | Say their name |
| Both characters | Say "you two" or "both" |
| Let the system decide | Don't name anyone; it follows the conversation flow |
| Force a switch | Name the other character, or let alternation kick in |

---

## 6. Interrupts

Characters can **interrupt each other** mid-response. This is the signature feature of Trio Mode.

### Master toggle

Interrupts can be globally disabled by setting `interruptions_enabled: false` in the session config. When disabled, no interrupts fire — characters speak to completion regardless of keywords, patience, or yield tokens.

### How interrupts work

While Character A is streaming their response, an **InterruptMonitor** watches for triggers from Character B:

1. **Yield trigger**: Character A emits `<<YIELD>>` (a special token the model can produce to voluntarily give up their turn).
2. **Keyword trigger**: Character A says one of Character B's `interrupt_keywords`. Example: Kelly says "boring" → Nathan (who has "boring" in his interrupt_keywords) cuts in.
3. **Patience trigger**: Character A's response exceeds Character B's `patience_threshold` (in characters). A single probability roll is made:

   ```
   effective_prob = max(0.05, patience_interrupt_probability - (consecutive_patience_interrupts × patience_decay))
   ```

   With defaults (0.15 base, 0.05 decay): first patience check rolls at 15%, second at 10%, third at 5%, then floors at 5%. The probability **does not increase** the longer A goes on — it's a flat roll made once when the threshold is crossed. The subtractive decay prevents interrupt chains from spiraling.

### What happens during an interrupt

1. Character A's response is **truncated at the last sentence boundary** before the trigger point.
2. An em-dash (`—`) is appended to A's message to indicate the cut-off.
3. Character B starts a new message bubble, visually marked as an interruption (slide-in animation).
4. Character A's participant card flashes red.
5. After B finishes, A **may resume** if they haven't been interrupted too many times (see below).

### Interrupt limits

- **Max 3 interrupts** per speaking turn per character (configurable via `max_interrupts`). After that, the speaker finishes uninterrupted.
- **Cooldown of 500 characters** (configurable via `interrupt_cooldown`) after each interrupt before another can fire. This prevents rapid-fire interrupt chains.
- **Patience decay**: Each consecutive patience interrupt reduces the next patience probability by `patience_decay` (default 0.05), flooring at 0.05.

### Resume after interrupt

When Character A is interrupted, the backend emits a `resume_available` event for A. The backend then automatically continues A's response (if they haven't hit `max_interrupts`). A's resumed text appears in a new bubble after B finishes. If A has been interrupted `max_interrupts` times, they do not resume — B's response is the final word.

### Tuning interrupts

| Behavior | Adjustment |
|----------|------------|
| Too many interrupts | Raise `patience_threshold`, lower `patience_interrupt_probability`, remove aggressive `interrupt_keywords` |
| Too few interrupts | Lower `patience_threshold`, raise `patience_interrupt_probability`, add more `interrupt_keywords` |
| No interrupts at all | Ensure `interrupt_keywords` are words the other character would actually say; check that `interruptions_enabled` is `true` |
| Interrupts feel abrupt | The truncation always cuts at sentence/clause boundaries, so this shouldn't happen. If it does, check that the model is producing well-punctuated output. |
| Disable all interrupts | Set `interruptions_enabled: false` in session config |

### Disabling interrupts per character

To disable interrupts *from* a specific character (they never interrupt), set their `interrupt_keywords` to `[]`, `patience_interrupt_probability` to `0`, and `patience_threshold` to a very high number (e.g., `99999`). The yield trigger will still work if the model emits `<<YIELD>>`.

---

## 7. Let Them Talk

The **"Let Them Talk"** button (🎭) in the participant strip triggers an autonomous exchange between the two characters. You step back and watch them talk to each other.

### How it works

1. A single API call is made with a special instruction: "The user wants to watch the characters talk to each other."
2. The model produces a multi-turn exchange using `[Name]:` labels to switch speakers.
3. The TokenBufferQueue parses the labels in real-time and emits `speaker_change` events.
4. Each speaker change creates a new message bubble with the correct color.
5. The exchange ends when the model emits `<<YIELD>>` or reaches the round limit.

### Round limit

Configured via the `let_them_talk_rounds` field in the session config. Default is **2 rounds**.

A "round" is **one exchange pair**: Character A speaks, then Character B speaks. So 2 rounds = 4 messages total. Set `let_them_talk_rounds: 4` for 8 messages, `let_them_talk_rounds: 6` for 12, etc.

This is a session config field — no source code editing required.

### When to use it

- After setting up a scene and wanting to see how the characters interact without your involvement.
- To generate organic dialogue you can react to.
- To test whether the characters' dynamic feels right.

### When NOT to use it

- You need precise control over the conversation direction.
- Token budget is tight (let-them-talk generates a lot of text in one call).
- The characters tend to go off-topic without user guidance.

---

## 8. The Participant Strip

The horizontal bar at the top of the chat area shows both characters and their current state.

### Elements

| Element | Description |
|---------|-------------|
| **Avatar** | Character's avatar image (or first initial if no avatar). **Click to insert an @mention** of that character into the input box. |
| **Name** | Character's display name. |
| **Mood dot** | Colored dot reflecting the character's current mood (from `emotional_state`). |
| **Energy label** | Text label for the character's energy level. |
| **Active highlight** | The currently-speaking character's card gets a colored border and glow. |
| **Interrupted flash** | When a character is interrupted, their card flashes red 3 times. |
| **Let Them Talk button** | 🎭 button on the right side of the strip. |

### @mention insertion

Clicking a character's avatar inserts `@Name ` at the cursor position in the input box. This is a convenience feature — the `@` prefix is stripped by the addressing resolver before name matching, so `@Kelly` works the same as typing `Kelly`.

### Active speaker

The active speaker's card is highlighted with their `trio_color` as a border and a subtle background tint. This updates in real-time as the speaking character changes.

### Mobile behavior

On screens narrower than 768px, the participant info (name/mood) is hidden by default and only shown for the active speaker. The strip becomes horizontally scrollable.

---

## 9. Emotional State

You can inject per-character emotional context that gets included in the combo prompt. This doesn't change behavior mechanically, but it nudges the model toward certain tones.

### Format

```json
"emotional_state": {
  "kelly": {
    "current": "guarded",
    "energy": "low",
    "toward_other": "resentful",
    "toward_user": "neutral"
  },
  "nathan": {
    "current": "performing",
    "energy": "high",
    "toward_other": "defensive",
    "toward_user": "friendly"
  }
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `current` | string | Mood label (see mood values below). |
| `energy` | string | Energy level: `low`, `medium`, `high`. |
| `toward_other` | string | How this character feels about the other character. |
| `toward_user` | string | How this character feels about the user. |

### Mood values

The system recognizes these mood labels for the mood dot color:

| Mood | Color | Description |
|------|-------|-------------|
| `happy` | green | Content, pleased |
| `excited` | amber | Energized, enthusiastic |
| `angry` | red | Furious, livid |
| `sad` | blue | Down, grieving |
| `neutral` | gray | Default, unreadable |
| `amused` | purple | Entertained, smug |
| `annoyed` | orange | Irritated, impatient |
| `guarded` | dark gray | Walled off, protective |
| `affectionate` | pink | Warm, tender |
| `vulnerable` | lavender | Exposed, raw |
| `performing` | amber-gold | Masking, putting on a show |
| `deflecting` | indigo | Avoiding, redirecting |
| `serious` | slate | No more jokes, genuine |
| `playful` | emerald | Teasing, lighthearted |

The last five (`vulnerable`, `performing`, `deflecting`, `serious`, `playful`) are specifically chosen to reflect **character arc progression**. A character might start at `performing` (masking with humor) and shift to `serious` or `vulnerable` as the conversation deepens. Unknown moods default to gray.

### Updating emotional state

**Currently, emotional state is manual.** You set it in the session config and it stays fixed for the conversation. To change it mid-conversation, update the config and reload.

Automatic emotional state updates (LLM-driven mood shifts after each exchange) are planned for a future version. When implemented, the `emotional_tracking_enabled` toggle will control whether the system both *reads* and *updates* emotional state automatically.

### Disabling emotional context

Set `emotional_tracking_enabled: false` in the session config to omit emotional state from the combo prompt entirely. The mood dots will still display whatever is in `emotional_state`, but the model won't see it.

---

## 10. Message Format & Labels

### How messages are stored

Trio messages in `state.messages` include a `speaker` field:

```javascript
{ role: "user", content: "Hey Kelly, what do you think?" }
{ role: "assistant", content: "I think...", speaker: "kelly" }
{ role: "assistant", content: "Wait, actually...", speaker: "nathan" }
```

### Label protocol

The combo prompt instructs the model to prefix every response with `[label]:`. The TokenBufferQueue strips these labels from the visible text and uses them internally for speaker attribution.

You will **not** see `[kelly]:` in the chat UI — the labels are consumed by the buffer queue. You'll only see the character's name in the message header and their color on the left border.

### Special tokens

The model may emit these tokens, which are consumed and never shown to the user:

| Token | Effect | Gated by |
|-------|--------|----------|
| `<<YIELD>>` | Speaker voluntarily gives up their turn. Triggers an interrupt from the other character. | `interruptions_enabled` |
| `<<SILENT>>` | Speaker chooses to stay silent (passive reaction only). The message bubble is marked as a passive reaction (dashed border, reduced opacity, ↳ prefix). | `passive_presence_enabled` |

If `passive_presence_enabled` is `false`, `<<SILENT>>` tokens are ignored — no event is emitted and the token is stripped from the output.

### Passive reactions

When `passive_presence_enabled` is `true` (default), a character can emit `<<SILENT>>` to produce a passive reaction — a short internal response (thought, gesture, expression) that doesn't advance the conversation. These are rendered with a dashed border, reduced opacity, and a `↳` prefix to visually distinguish them from active dialogue.

The `reaction_probability` field on each character config controls how likely the model is to produce a passive reaction when not directly addressed. This is included in the combo prompt as guidance to the model.

### User message sanitization

If you type `[kelly]: something` in your message, the system strips the label prefix. This prevents you from impersonating a character. Your messages are always prefixed with `[You]:` in the API payload.

---

## 11. API Endpoints

### `POST /api/chat/trio`

Main trio chat endpoint.

**Request body:**

```json
{
  "messages": [...],
  "config": {
    "mode": "trio",
    "model": "llama-3.3-70b",
    "participants": ["Kelly Bailey", "Nathan Young"],
    "dynamic": { "kelly_to_nathan": "...", "nathan_to_kelly": "..." },
    "interruptions_enabled": true,
    "passive_presence_enabled": true,
    "emotional_tracking_enabled": true,
    "ambient_responses": false,
    "max_consecutive_turns": 2,
    "turn_order": "context",
    "let_them_talk_rounds": 2
  },
  "chat_id": "uuid.json",
  "trio_state": {
    "last_speaker": "kelly",
    "consecutive_default_turns": { "kelly": 0, "nathan": 0 },
    "active_thread": "kelly"
  },
  "emotional_state": { "kelly": { "current": "guarded", ... }, "nathan": { ... } }
}
```

**`trio_state.consecutive_default_turns`** is a **per-character dict**, not a single integer. Each key is a character label, and the value is how many consecutive Tier 4 defaults have routed to that character. The resolver uses this to decide when to force alternation.

**Response:** Server-Sent Events stream.

**SSE events:**

| Event | Fields | Description |
|-------|--------|-------------|
| `start` | `chat_id`, `trio` | Stream started. |
| `trio_state` | `trio_state`, `addressee` | Updated trio state and resolved addressee. |
| `trio_participants` | `participants` | Participant metadata (label, name, color, avatar). |
| `speaker_start` | `speaker`, `display_name` | A character begins speaking. |
| `trio_delta` | `speaker`, `delta` | Text chunk from a character. |
| `trio_speaker_change` | `speaker` | Speaker changed (label detected in stream). |
| `trio_interrupt` | `by`, `truncated_text` | Interrupt fired. `by` = interrupting character. |
| `trio_yield` | `speaker` | Speaker emitted `<<YIELD>>`. |
| `trio_silent` | `speaker` | Speaker emitted `<<SILENT>>`. Only emitted if `passive_presence_enabled` is true. |
| `speaker_end` | `speaker` | A character finished speaking. |
| `resume_available` | `for` | Interrupted character is resuming. Emitted before the resumed response begins. |
| `end` | `trio`, `responses`, `trio_state` | Stream complete. `responses` = `{label: full_text}`. |
| `error` | `error` | Error occurred. |

### `POST /api/chat/trio/let-them-talk`

Autonomous character exchange.

**Request body:**

```json
{
  "messages": [...],
  "config": { "mode": "trio", ... },
  "chat_id": "uuid.json",
  "trio_state": { ... },
  "emotional_state": { ... },
  "max_rounds": 2
}
```

`max_rounds` defaults to the session config's `let_them_talk_rounds` (default 2). A "round" is one exchange pair (A speaks, B speaks), so 2 rounds = 4 messages.

**Response:** Same SSE event format as above.

---

## 12. Troubleshooting

### Both characters respond to every message

**Cause:** The addressing resolver is falling through to Tier 4 and `ambient_responses` is `true`, or alternation isn't kicking in.

**Fix:** Check that `ambient_responses` is `false` (default). Make sure your characters have `name_variants` set. Use character names in your messages. Check that `addressing_keywords` are distinct between characters (no overlap).

### One character never speaks

**Cause:** The other character's name is always detected first, or alternation isn't kicking in.

**Fix:** Check `name_variants` — ensure all variants are listed. Try explicitly addressing the silent character by name. Verify `trio_label` values are unique. Check that `max_consecutive_turns` isn't set too high (default 2).

### Interrupts fire too often

**Cause:** `patience_threshold` is too low, `patience_interrupt_probability` is too high, or `interrupt_keywords` are too common.

**Fix:** Raise `patience_threshold` to 600-800. Lower `patience_interrupt_probability` to 0.10. Remove common words from `interrupt_keywords` — keep only words that are specific to the character dynamic. Increase `patience_decay` to 0.08 for faster decay.

### Interrupts never fire

**Cause:** The model isn't producing the `interrupt_keywords`, `patience_threshold` is too high, or `interruptions_enabled` is `false`.

**Fix:** Check that `interruptions_enabled` is `true`. Lower `patience_threshold` to 200-300. Raise `patience_interrupt_probability` to 0.25. Choose `interrupt_keywords` that the other character would naturally say in conversation. Remember: the keywords are checked against what the *speaking* character says, not what the user says.

### Messages have no color / wrong color

**Cause:** `trio_color` is missing or invalid, or `trio_label` doesn't match.

**Fix:** Ensure each character config has a valid hex color in `trio_color` (e.g., `"#e85d4a"`). Check that `trio_label` values are unique and match between the character config and the session config.

### "Let Them Talk" produces one long monologue

**Cause:** The model isn't using `[Name]:` labels to switch speakers.

**Fix:** This is model-dependent. Try a different model. Ensure the combo prompt's behavioral rules are being followed (they're injected automatically). Some models need higher temperature (0.8-0.9) to produce multi-speaker dialogue.

### The participant strip doesn't appear

**Cause:** Trio mode isn't active, or the config wasn't loaded properly.

**Fix:** Verify `state.currentConfig.mode === 'trio'`. Check the browser console for TrioManager initialization logs. Ensure `trioManager.init()` is called when the config loads.

### API key error

**Cause:** No API key configured for the provider.

**Fix:** Set the Venice API key in settings. If using a custom provider, ensure `custom_base_url` and `custom_api_key` are in the request data.

### Characters speak out of character

**Cause:** The combo prompt is too long and the model is losing character definition, or the characters' personas conflict.

**Fix:** Shorten `system_prompt` and `character_card` for each character. The combo prompt combines both, so keep each concise. Ensure the personas are distinct enough that the model can tell them apart. Use directional relationships in `dynamic` so the model understands each character's separate internal model of the other.

### Trailing vocative doesn't work

**Test:** Type "Tell Nathan he's wrong, Kelly" and verify Kelly responds, not Nathan.

**If it fails:** The trailing vocative checker looks for a comma followed by a name at the end of the message. Ensure the name is in the character's `name_variants`. The check is case-insensitive and word-boundary matched.

---

## 13. Advanced Tuning

### Adjusting alternation frequency

The forced alternation threshold is controlled by the `max_consecutive_turns` session config field (default 2). Set it to `1` for faster alternation, or `3+` for slower. No code changes needed.

### Adjusting interrupt probability

The patience-trigger probability is controlled by three per-character config fields:

| Field | Default | Effect |
|-------|---------|--------|
| `patience_interrupt_probability` | 0.15 | Base probability when threshold is crossed |
| `patience_decay` | 0.05 | Subtracted per consecutive patience interrupt (floor: 0.05) |
| `patience_threshold` | 400 | Character count that triggers the probability roll |

Formula:

```
effective_prob = max(0.05, patience_interrupt_probability - (consecutive_patience_interrupts × patience_decay))
```

This is a **flat probability with subtractive decay**, not a ramp. The probability does not increase the longer the speaker goes on — it's a single roll made once when the threshold is crossed. The decay prevents interrupt chains from spiraling by making each consecutive patience interrupt less likely than the last.

### Adjusting max interrupts

Set `max_interrupts` on the character config (default 3). Set to `0` to disable interrupts from that character entirely (yield triggers still work if the model emits `<<YIELD>>`).

### Adjusting interrupt cooldown

Set `interrupt_cooldown` on the character config (default 500 characters). Higher = longer pause between interrupts.

### Global interrupt toggle

Set `interruptions_enabled: false` in the session config to disable all interrupts globally. This is the simplest way to turn off the feature without editing character configs.

### Custom combo prompt rules

The behavioral rules are in `build_combo_prompt()` in `services/trio/combo_prompt.py`. You can add, remove, or modify rules 1-10. Each rule is a string appended to the `parts` list.

### Per-character models: not supported

Trio Mode uses a single shared model for both characters (plan §4.3, Option A). This is a deliberate architectural decision — the combo prompt, TokenBufferQueue, let-them-talk single-call design, and interrupt protocol all depend on both characters sharing the same model and context window. Using different models per character would require:

- Separate API calls per character (breaking the single-call let-them-talk design)
- Separate context windows (breaking the "both characters hear everything" premise)
- A fundamentally different interrupt protocol (the monitor can't watch a stream that doesn't exist yet)

If you need different models per character, use regular chat mode and switch between character configs manually.

### Adding a third character

The system supports more than 2 participants in theory, but it's untested. The addressing resolver and interrupt monitor are designed for 2. If you try 3+:

- The alternation logic in Tier 4 only switches between 2 characters.
- The interrupt monitor only watches one "other" character.
- The combo prompt numbers characters 1, 2, 3... which should work.

Test thoroughly before relying on 3+ character support.

---

## Appendix: File Reference

| File | Purpose |
|------|---------|
| `services/trio/__init__.py` | Package init. |
| `services/trio/combo_prompt.py` | Builds combined system prompt with directional relationships. |
| `services/trio/addressing.py` | 4-tier addressee resolver with trailing vocative override. |
| `services/trio/token_buffer.py` | Stream token buffer with label resolution. |
| `services/trio/interrupt_monitor.py` | Interrupt trigger detection (flat probability with decay). |
| `routes/trio.py` | Flask endpoints (`/api/chat/trio`, `/api/chat/trio/let-them-talk`). |
| `js/components/TrioManager.js` | Frontend SSE handler and UI manager. |
| `css/trio.css` | Participant strip and message styling. |

---

## Appendix: Config Field Cross-Reference

### Character Config Fields

| Field | Required | Default | Where Used |
|-------|----------|---------|------------|
| `trio_label` | Yes | — | Addressing, combo prompt, message storage |
| `trio_color` | Yes | — | UI (message borders, participant card) |
| `name_variants` | Yes | `[display_name]` | Addressing Tier 1 |
| `addressing_keywords` | No | `[]` | Addressing Tier 3 |
| `interrupt_keywords` | No | `[]` | Interrupt monitor (keyword trigger) |
| `patience_threshold` | No | `400` | Interrupt monitor (patience trigger) |
| `patience_interrupt_probability` | No | `0.15` | Interrupt monitor (patience trigger) |
| `patience_decay` | No | `0.05` | Interrupt monitor (patience trigger) |
| `max_interrupts` | No | `3` | Interrupt monitor (limit) |
| `interrupt_cooldown` | No | `500` | Interrupt monitor (cooldown) |
| `reaction_probability` | No | `0.35` | Combo prompt (passive reaction guidance) |

### Session Config Fields

| Field | Required | Default | Where Used |
|-------|----------|---------|------------|
| `mode` | Yes | — | Must be `"trio"` |
| `model` | Yes | — | API call (shared by both characters) |
| `participants` | Yes | — | Participant building |
| `dynamic` | No | `{}` | Combo prompt (directional relationships) |
| `emotional_state` | No | `{}` | Combo prompt, UI mood dots |
| `temperature` | No | `0.7` | API call |
| `max_tokens` | No | `2048` | API call |
| `interruptions_enabled` | No | `true` | Interrupt monitor (master toggle) |
| `passive_presence_enabled` | No | `true` | `<<SILENT>>` token handling |
| `emotional_tracking_enabled` | No | `true` | Combo prompt (emotional context inclusion) |
| `ambient_responses` | No | `false` | Addressing Tier 4 (group response) |
| `max_consecutive_turns` | No | `2` | Addressing Tier 4 (alternation threshold) |
| `turn_order` | No | `"context"` | Addressing (reserved for sequential mode) |
| `let_them_talk_rounds` | No | `2` | Let-them-talk endpoint |

---

*Last updated: Trio Mode v1.0 — aligned with V2.3 plan*
