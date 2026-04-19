# GONDOLA.md — Project Briefing

## Architecture

- [2026-04-17] Flask backend organized as app.py with routes/ and services/ directories.
- [2026-04-17] ES6 modular frontend with js/main.js entry point, plus core/, components/, and ui/ directories.
- [2026-04-18] Lagoon uses sentence-transformers/all-MiniLM-L6-v2 for fully local semantic memory. Chunks conversation into turn-pairs,
- [2026-04-18] Image mode uses three-card system: ref-1, ref-2, and target. Reference images plus target for editing. Model filtering b
- [2026-04-17] Authentication handled via middleware layer in the backend.
- [2026-04-17] Streaming functionality uses a LORE buffer implementation.

## Decisions

- [2026-04-18] Kelly is a test character. If she works well, user may create an open source package for others to build similar charact

## Gotchas

- [2026-04-18] Em dashes (—) in character config files cause JSON parsing errors. Must replace with regular dashes (-) to avoid parse f
- [2026-04-17] Project has both legacy and modular codepaths coexisting; changes may need to handle both.
- [2026-04-17] Microphone access requires SSL/HTTPS context to work properly.
- [2026-04-17] Context window sizes are hardcoded rather than configurable.

## Active Context

- [2026-04-18] User built Lagoon, a creative production studio with both chat and image modes. Not just a chat wrapper—includes RAG sem
- [2026-04-18] Adam has two daughters: Emily (7) and Kaitlyn (5) from a previous relationship. Kelly loves them.
- [2026-04-18] User became a writer through LLM roleplay. Started when Venice's web UI failed to edit a photo of their wife, then said 
- [2026-04-18] User attends Saturday night hockey games. Bridgeport Islanders (formerly Sound Tigers) are moving to Canada. Next season
- [2026-04-18] User shared an image from their first fanfiction showing a bedroom scene with a character painting toenails. The setting
- [2026-04-18] Adam Cook is a contractor specializing in decks, kitchen and bath remodels, with some property management. Stressed cons
- [2026-04-18] User requested done() call to test history logging functionality. No code changes made.
- [2026-04-18] Session cleared by user. Tasks covered: What's up sugartits?
- [2026-04-18] Session cleared by user. Tasks covered: sup?
- [2026-04-18] Session cleared by user. Tasks covered: sup | Islanders just beat the bears 2-1 | 4th seed | home ice is gone. | nope. a

## Key Files
app.py, js/main.js

