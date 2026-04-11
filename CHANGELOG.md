# Changelog

All notable changes to Lagoon will be documented in this file.

## [2026-04-09] - Session Improvements

### Bug Fixes
- **Fixed regenerate response button not working** - The `applyCharacterConfig` method was rebuilding system messages at the start of `regenerateFromIndex`, which shifted message indices and caused `assistantIndex` to point to the wrong message. Fixed by moving the config overlay to after message slicing/extraction.
  - Files: `js/components/ChatManager.js`

- **Fixed stale character config on regenerate** - Character edits made mid-chat weren't being applied to regenerations. The `regenerateFromIndex` method now fetches and overlays the live character config before generating, ensuring edits take effect immediately without reloading the chat.
  - Files: `js/components/ChatManager.js`

### UI Improvements
- **Added pricing display to Manage Models modal** - All three tabs (Venice, Together.ai, Installed) now show model pricing as `$X.XX / $Y.YY per 1M tokens` (input/output). Venice/Together tabs use API-returned pricing with fallback to the static VENICE_PRICING object.
  - Files: `js/ui/settings.js`

### Features
- **Added `applyCharacterConfig` method** - New method in ChatManager that overlays live character config fields onto `state.currentConfig` and rebuilds system messages in `state.messages`. This ensures character edits propagate to the current chat session without requiring a page reload.
  - Files: `js/components/ChatManager.js`

### Config Changes
- **Revised Fiction Writer character banned word list** - Removed overkill bans that were breaking natural dialogue and narration:
  - Removed bans on basic dialogue verbs (says, asks, tells, smiles, nods) - now require past tense forms instead
  - Removed bans on physical nouns (weight, tension, energy, adrenaline, hit, landed, wreckage, skirt, whimper)
  - Added explicit "Dialogue is exempt" clause to all three mandates
  - Added ALLOW lists for physical nouns, verbs, and garment names
  - Reorganized system_context into structured rules instead of flat banned list
  - Files: `configs/Fiction Writer.json`

- **Added inner monologue formatting rule** - Inner monologue is now italicized, second person (you/your), present tense, and exempt from the past-tense rule. Example: `*You should know better.*`
  - Files: `configs/Fiction Writer.json`

### Chat Management
- **Created new chat with Fiction Writer character** - Created chat `8083deeb-065e-419e-9e80-aa9b114ac363.json` with Kelly's Story as the first assistant message.
  - Files: `chats/8083deeb-065e-419e-9e80-aa9b114ac363.json`