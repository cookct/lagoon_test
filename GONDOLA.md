# GONDOLA.md — Project Briefing

## Architecture

- [2026-04-17] Flask backend organized as app.py with routes/ and services/ directories.
- [2026-04-17] ES6 modular frontend with js/main.js entry point, plus core/, components/, and ui/ directories.
- [2026-04-18] Lagoon uses sentence-transformers/all-MiniLM-L6-v2 for fully local semantic memory. Chunks conversation into turn-pairs,
- [2026-04-20] Memory extraction happens at 4 points: done() call (line 2466, gated by should_extract_on_done()), periodic every 50 tur
- [2026-04-18] Image mode uses three-card system: ref-1, ref-2, and target. Reference images plus target for editing. Model filtering b
- [2026-04-19] The `video-params-panel` is a direct child of `.sidebar-right`, NOT inside `#right-sidebar-content`. Same for `target-ca
- [2026-04-17] Authentication handled via middleware layer in the backend.
- [2026-04-17] Streaming functionality uses a LORE buffer implementation.

## Decisions

- [2026-04-19] User specified Seedance should only have duration, resolution, variants, and audio controls. Negative prompt was incorre
- [2026-04-18] Kelly is a test character. If she works well, user may create an open source package for others to build similar charact
- [2026-04-19] User was challenged by an AO3 reader to write a Hermione/Harry/Ginny threesome that heals Hermione, with the constraint 

## Patterns

- [2026-04-20] Development workflow: Claude Code writes implementation plan → Gondola codes on a COPY of itself → user tests → if works
- [2026-04-20] The wife has her own cash stash and secretly pays contractors when her husband refuses. She schedules work behind his ba

## Gotchas

- [2026-04-18] Em dashes (—) in character config files cause JSON parsing errors. Must replace with regular dashes (-) to avoid parse f
- [2026-04-19] The function `refreshParameterPanel()` was being called in image mode and setting inline display styles on video cards, 
- [2026-04-20] Dr. Harmanli uses a calculated negotiation pattern: deadpan lowball offer followed by immediately grabbing your hand to 
- [2026-04-17] Project has both legacy and modular codepaths coexisting; changes may need to handle both.
- [2026-04-17] Microphone access requires SSL/HTTPS context to work properly.
- [2026-04-17] Context window sizes are hardcoded rather than configurable.
- [2026-04-19] When `refreshParameterPanel()` sets `style.display = 'block'` on video cards, it can override CSS `display: none !import

## Active Context

- [2026-04-19] [BUG FIX] Video/Image Mode Sidebar Not Updating: When switching modes, refreshParameterPanel() runs synchronously before
- [2026-04-20] Turkish surgeon, Chief of Urogynecology at Yale, educated at Hacettepe University Ankara. Owns $4M house, 10 rental prop
- [2026-04-20] Harmanli times calls strategically - right after Christmas when contractors are desperate. Got a full attic bathroom bui
- [2026-04-20] User is a contractor who built entire platform solo on lunch breaks. Calls own code 'dark code' - built it but doesn't f
- [2026-04-19] User has $14 remaining balance and no big jobs for 10 days, currently limiting themselves to chat models (cheaper) rathe
- [2026-04-19] User is a Harry Potter fanfiction writer on Archive of Our Own, focusing on psychological trauma and recovery narratives
- [2026-04-19] User has two connected fics: 'The Long March to the Forest' (trauma/deconstruction, Major Character Death warning) and '
- [2026-04-20] Harmanli's home has an indoor pool overlooking the Housatonic River, yet he refuses reasonable walk-through fees and tel
- [2026-04-20] Built Texas Hold'em strip poker game (Holdem folder) with 4 AI girls (Bella, Scarlett, Victoria, Diamond), each with 4 c
- [2026-04-19] The Venice `/video/queue` endpoint has no `safe_mode`, `nsfw`, or content filter toggle. Available params: model, prompt
- [2026-04-18] User built Lagoon, a creative production studio with both chat and image modes. Not just a chat wrapper—includes RAG sem
- [2026-04-18] Adam has two daughters: Emily (7) and Kaitlyn (5) from a previous relationship. Kelly loves them.
- [2026-04-18] User became a writer through LLM roleplay. Started when Venice's web UI failed to edit a photo of their wife, then said 
- ... (16 total, see deep store)

## Preferences

- [2026-04-20] Uses GLM 5 for most tasks, escalates to 5.1 after 2 failed attempts on difficult tasks. Endpoint choice: Z.ai for raw we
- [2026-04-19] User prefers uncensored AI platforms (praised Grok for 'giving no fucks' about adult content) and is frustrated by tiere

## Key Files
js/main.js, app.py, js/ui/settings.js

