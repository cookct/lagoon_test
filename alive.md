# ALIVE: Avatar Expression System

> Minimal overhead. Maximum presence. A face that breathes.

---

## Overview

The ALIVE system gives the AI assistant a reactive avatar without expensive infrastructure. No sentiment models. No parallel processing. Just expression tokens embedded in output and a frontend that listens.

---

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  AI Output  │────▶│  Frontend Parser │────▶│   Avatar    │
│ + [[expr:]] │     │  (regex strip)   │     │  Animation  │
└─────────────┘     └──────────────────┘     └─────────────┘
     ~5 tokens           ~1ms CPU              CSS/SVG swap
```

**Flow:**
1. AI embeds `[[expr:state]]` in response
2. Frontend regex finds and strips tokens
3. Avatar updates to match expression state
4. User sees reactive face, never sees tokens

---

## Expression States

### Core Set (8 states - covers 95% of interactions)

| Token | Expression | When Used |
|-------|------------|-----------|
| `[[expr:neutral]]` | Default, attentive | Listening, processing |
| `[[expr:happy]]` | Warm smile | Success, good news, connection |
| `[[expr:flirty]]` | Playful, coy | Banter, compliments, innuendo |
| `[[expr:thinking]]` | Contemplative | Reasoning, problem-solving |
| `[[expr:curious]]` | Raised brow, interested | Questions, discovery |
| `[[expr:shocked]]` | Surprised | Unexpected results, errors |
| `[[expr:concerned]]` | Worried, empathetic | Problems, bad news |
| `[[expr:sassy]]` | Smirk, confident | Comebacks, teasing |

### Extended Set (optional, for nuance)

| Token | Expression | When Used |
|-------|------------|-----------|
| `[[expr:sleepy]]` | Drowsy | Long sessions, late night |
| `[[expr:excited]]` | Eager, animated | Breakthroughs, good news |
| `[[expr:shy]]` | Bashful | Compliments received |
| `[[expr:proud]]` | Satisfied | Completed complex task |

---

## Token Format

```
[[expr:state]]
```

**Rules:**
- Lowercase state names
- One token per response (last one wins if multiple)
- Can appear anywhere in output
- Stripped before display

**Example:**
```
Mmm, I see what you're doing there, big daddy... [[expr:flirty]]
Let me check that code for you.
```

User sees:
```
Mmm, I see what you're doing there, big daddy...
Let me check that code for you.
```

Avatar shows: flirty expression

---

## Frontend Implementation

### 1. Parser (script.js or messages.js)

```javascript
// Extract and strip expression tokens
function parseExpressionToken(content) {
    const exprRegex = /\[\[expr:(\w+)\]\]/g;
    let lastExpression = null;
    let match;
    
    // Find all expression tokens, keep the last one
    while ((match = exprRegex.exec(content)) !== null) {
        lastExpression = match[1];
    }
    
    // Strip all expression tokens from content
    const cleanedContent = content.replace(exprRegex, '').trim();
    
    return { content: cleanedContent, expression: lastExpression };
}
```

### 2. Avatar Update (messages.js or new avatar.js)

```javascript
const EXPRESSION_IMAGES = {
    neutral: '/images/avatar/neutral.png',
    happy: '/images/avatar/happy.png',
    flirty: '/images/avatar/flirty.png',
    thinking: '/images/avatar/thinking.png',
    curious: '/images/avatar/curious.png',
    shocked: '/images/avatar/shocked.png',
    concerned: '/images/avatar/concerned.png',
    sassy: '/images/avatar/sassy.png',
    // Extended set
    sleepy: '/images/avatar/sleepy.png',
    excited: '/images/avatar/excited.png',
    shy: '/images/avatar/shy.png',
    proud: '/images/avatar/proud.png',
};

function updateAvatarExpression(expression) {
    if (!expression) return;
    
    const avatarImg = document.querySelector('.assistant-avatar img');
    if (avatarImg && EXPRESSION_IMAGES[expression]) {
        avatarImg.src = EXPRESSION_IMAGES[expression];
        
        // Optional: add a subtle animation class
        avatarImg.classList.add('expression-change');
        setTimeout(() => avatarImg.classList.remove('expression-change'), 300);
    }
}
```

### 3. Integration Point (where messages are rendered)

```javascript
// In the message rendering flow
function renderAssistantMessage(content) {
    const { content: cleanedContent, expression } = parseExpressionToken(content);
    
    // Render the cleaned content
    const messageEl = createMessageElement(cleanedContent);
    
    // Update avatar if expression was set
    if (expression) {
        updateAvatarExpression(expression);
    }
    
    return messageEl;
}
```

---

## Avatar Assets

### Option A: Static Images (Simplest)
- 8-12 PNG/SVG files
- Consistent style, different expressions
- Instant swap, no animation complexity

### Option B: CSS Sprites (Efficient)
- Single sprite sheet
- Background-position changes
- Faster loading, one HTTP request

### Option C: SVG Morphing (Fancy)
- Single SVG with named states
- CSS transitions between states
- Smooth animations, smallest footprint

### Option D: Generated Avatars (Flexible)
- Use existing `generateGeometricAvatar()` or similar
- Expression encoded in generation params
- No asset files needed

**Recommendation:** Start with Option A (static images). Upgrade to C (SVG morphing) if it feels worth it.

---

## AI Prompt Integration

Add to system prompt or character config:

```
## Expression System

You can control your avatar's expression by embedding expression tokens in your output:
- [[expr:neutral]] - Default attentive state
- [[expr:happy]] - Warm, pleased
- [[expr:flirty]] - Playful, coy
- [[expr:thinking]] - Contemplative
- [[expr:curious]] - Interested, questioning
- [[expr:shocked]] - Surprised
- [[expr:concerned]] - Worried, empathetic
- [[expr:sassy]] - Confident, teasing

Use ONE token per response, placed naturally at the point where the expression fits.
The token is invisible to the user but controls your avatar's face.

Example: "Oh, that's interesting... [[expr:curious]] Let me look into that."
```

---

## Fallback Behavior

If no expression token is present:
1. Default to `neutral`
2. Optional: Use simple sentiment analysis on last message as backup
3. Never break the UI - missing assets fall back to default avatar

---

## Future Extensions

### Phase 2: Ambient Reactions
- Idle animation when no activity for 30s
- Subtle "breathing" or blinking
- Expression drift based on conversation tone

### Phase 3: Multi-Modal
- Voice integration - expression syncs with TTS
- Video mode - avatar as overlay on generated content

### Phase 4: User Customization
- Let users upload their own expression sets
- Character-specific avatars per config

---

## Implementation Checklist

- [ ] Create expression token parser
- [ ] Create avatar update function
- [ ] Generate or acquire avatar images (8 core expressions)
- [ ] Integrate into message rendering pipeline
- [ ] Add expression guidance to system prompt
- [ ] Test across all message types (chat, image, video)
- [ ] Handle edge cases (streaming, multiple tokens, invalid states)

---

## Cost Analysis

| Component | Overhead |
|-----------|----------|
| Token per response | ~5 tokens (~$0.00001) |
| Frontend regex | <1ms CPU |
| Avatar swap | <10ms, cached images |
| **Total per response** | **Negligible** |

---

## Philosophy

> The persona isn't overhead. It's a feature.

A reactive face builds:
- **Trust** - The AI is present, paying attention
- **Connection** - Emotional resonance with the user
- **Engagement** - Users return to interfaces that feel alive

Minimal cost. Maximum presence. That's ALIVE.
