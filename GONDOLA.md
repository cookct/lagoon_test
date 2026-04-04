# GONDOLA Knowledge Log

This file tracks important configuration changes, debugging sessions, and knowledge gained about the Lagoon system and character configurations.

---

## 2026-04-03: Kelly Thompson 2 - Prose Style Fixes

### Problem
Character was generating metaphorical prose like:
> "The offer landed with the precision of a line of perfect code."

### Root Cause Analysis
The system prompt contained phrases that the AI interpreted as **license to use metaphors**:
- "Show, don't tell" → AI thinks "vivid comparisons"
- "visceral" → AI thinks "dramatic language"
- "high-impact" → AI thinks "metaphorical impact"
- "efficient" → AI thinks "shortcut comparisons"
- "Trust the reader to infer" → pairs with metaphor

### Changes Made

#### 1. System Prompt - PROSE RULES Section
**Before:**
```
Show, don't tell. Actions carry meaning. Trust the reader to infer.
```

**After (CORRECTED):**
```
Show through concrete physical details only. Report what Kelly sees, hears, feels physically. NO metaphors. NO comparisons. NO abstractions. NO interpretations. Physical facts only.
```

**Note:** First attempt was wrong — told the AI to "state plainly" which leads to telling. The fix is to explicitly say SHOW through concrete physical details, while banning metaphors/comparisons.

#### 2. Author Note Additions
Added explicit metaphor/simile ban with examples:
```
ABSOLUTELY FORBIDDEN - METAPHORS, SIMILES, ABSTRACT COMPARISONS:
- NO metaphors (offers don't "land", silence doesn't "stretch", words don't "cut")
- NO similes using "like", "as", "with the", "as if"
- NO abstract concepts given physical actions
- NO comparisons to non-physical things (code, ideas, concepts, emotions, etc.)
- NO personification of non-human things

EXAMPLE OF WRONG:
"The offer landed with the precision of a line of perfect code."

EXAMPLE OF RIGHT:
"Kelly's fingers stopped typing. She read the message again."
```

#### 3. Configuration Parameters
| Parameter | Before | After | Reason |
|-----------|--------|-------|--------|
| `author_note_depth` | 3 | 4 | Stronger enforcement |
| `temperature` | 0.6 | 0.45 | More literal adherence |

### Key Insight
**"Show, don't tell" is dangerous for LLMs** — they interpret it as "use metaphors and comparisons" instead of "use concrete physical details."

### Files Modified
- `configs/Kelly Thompson 2.json`

---

## Template: New Entry

```markdown
## YYYY-MM-DD: [Brief Title]

### Problem
[Description of issue]

### Root Cause Analysis
[What was causing it]

### Changes Made
[What was changed]

### Key Insight
[Important lesson learned]

### Files Modified
- `file/path`
```
