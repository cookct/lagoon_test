# GONDOLA.md — Project Briefing

## Architecture

- [2026-04-17] Flask backend organized as app.py with routes/ and services/ directories.
- [2026-04-17] ES6 modular frontend with js/main.js entry point, plus core/, components/, and ui/ directories.
- [2026-04-18] Lagoon uses sentence-transformers/all-MiniLM-L6-v2 for fully local semantic memory. Chunks conversation into turn-pairs,
- [2026-04-20] Memory extraction happens at 4 points: done() call (line 2466, gated by should_extract_on_done()), periodic every 50 tur
- [2026-04-30] Flask terminal logs full request payloads including venice_parameters: enable_web_search, enable_web_scraping, include_v
- [2026-05-01] Flask backend runs on port 5007 with modular routes directory. Frontend is vanilla JS with ES6 modules. No database requ
- [2026-05-06] Venice doesn't just use a static system prompt - it uses keyword-based RAG to dynamically inject supplemental nudges bas
- [2026-05-18] Lore injection is hardcoded at line 166 in routes/chat.py, injecting 'after last system message, before conversation'.
- [2026-06-22] The outline has four parts spanning ~220K words: Part One (Ch 1-20) covers Aen-Vhar's origin through the father's murder
- [2026-06-22] Eldest son of a First One mother and her Vhor'keth. Born with more old blood than anyone before—powerful enough to almos
- [2026-07-03] Models are configured with fields: id, name, provider, logo, and pricing object containing input/output/cacheRead rates 
- ... (27 total, see deep store)

## Decisions

- [2026-04-19] User specified Seedance should only have duration, resolution, variants, and audio controls. Negative prompt was incorre
- [2026-05-19] Estuary skin was replaced with Confluence as the default skin for this Kodi build.
- [2026-04-18] Kelly is a test character. If she works well, user may create an open source package for others to build similar charact
- [2026-04-19] User was challenged by an AO3 reader to write a Hermione/Harry/Ginny threesome that heals Hermione, with the constraint 
- [2026-05-01] Deliberate architectural choice to require no external database—all data stays local on the user's machine for privacy.
- [2026-05-19] When user switches context_mode from 'always' to 'rag', they must re-embed their context file. Embedding is also trigger
- [2026-06-22] User rejected 'the Binding itself' as antagonist. The Lock being one-directional (First Ones can't fight back due to lov
- [2026-06-22] Lore explicitly states Muggle-borns ARE descendants—the trait resurfaced in Hermione. Her blood is Aen-Vhar's blood. Hav
- [2026-06-23] Pim invented the liberation theory and waited 2000 years. Dramatic logic demands Pim go first, not be freed last 'by cho
- [2026-07-03] Use rAF-throttled updateStreamingDOM during active streaming, but call synchronous updateStreamingDOMImmediate for the f
- [2026-05-31] The correct approach for message correction: keep the bad message object in its original position, reset its content to 
- ... (12 total, see deep store)

## Patterns

- [2026-04-20] Development workflow: Claude Code writes implementation plan → Gondola codes on a COPY of itself → user tests → if works
- [2026-07-03] Use rAF-based throttling for streaming DOM updates so rapid SSE chunks coalesce into a single DOM update per animation f
- [2026-07-04] Use try-with-temperature-first approach: attempt API call with temperature: 0.3, catch 400 error mentioning 'temperature
- [2026-04-28] Writing style emphasizes physical sensation—heat through nightshirts, tingles, flinching, motor control loss. User provi
- [2026-04-30] GPT-OSS 120B models still have OpenAI training embedded despite 'open source' labeling - they struggle with policy bound
- [2026-05-06] Refusal recovery (Priority 100) catches phrases like 'I cannot', 'I'm unable', 'I apologize but' and injects override in
- [2026-05-08] MODEL_LOGOS in state.js stores SVG logo references. When adding a model with a new provider (e.g., nvidia), must add the
- [2026-05-26] Celebrity clients come via word-of-mouth referrals from mother-in-law who is a high-profile real estate agent
- [2026-07-03] When adding a model: (1) add entry to installed_models.json, (2) check if logo exists in MODEL_LOGOS - add if missing. M
- [2026-04-20] The wife has her own cash stash and secretly pays contractors when her husband refuses. She schedules work behind his ba
- [2026-04-30] Grok 4.20 Beta escalates content intensity aggressively without hesitation - each user comment triggers harder/more expl
- ... (15 total, see deep store)

## Gotchas

- [2026-07-04] Venice API returns 400 error 'temperature is deprecated for this model' when calling Opus 4.8 with temperature parameter
- [2026-04-18] Em dashes (—) in character config files cause JSON parsing errors. Must replace with regular dashes (-) to avoid parse f
- [2026-04-19] The function `refreshParameterPanel()` was being called in image mode and setting inline display styles on video cards, 
- [2026-04-20] Dr. Harmanli uses a calculated negotiation pattern: deadpan lowball offer followed by immediately grabbing your hand to 
- [2026-05-06] Venice's E2EE mode doesn't just expose parameters - it rejects them fully. You cannot pass include_venice_system_prompt 
- [2026-05-08] Setting overflow-y: auto shows scrollbar even on empty inputs. Fix: JS toggles overflow-y to hidden by default, only swi
- [2026-05-10] Hitting Byparr's /v1 endpoint for the first time triggers a ~5GB camoufox browser download from GitHub. This blocks all 
- [2026-05-19] During transaction buffering, search and read operations see the disk file content, not the staged/buffered changes. Edi
- ... (24 total, see deep store)

## Active Context

- [2026-06-23] Pim has been bowing to children, cleaning vomit at the Yule Ball, folding robes of boys who became Voldemort's followers
- [2026-07-03] Models from Venice endpoint use provider: 'venice' in config. Added models: xiaomi-mimo-v2-5, minimax-m3-preview, claude

## Preferences

- [2026-04-28] User explicitly requested single questions rather than multi-part queries during the creative interview process. Prefers
- [2026-04-20] Uses GLM 5 for most tasks, escalates to 5.1 after 2 failed attempts on difficult tasks. Endpoint choice: Z.ai for raw we
- [2026-04-19] User prefers uncensored AI platforms (praised Grok for 'giving no fucks' about adult content) and is frustrated by tiere
- [2026-05-26] Appreciates clients who treat him casually; stayed professional when tested with a celebrity 'feel test' about a Broadwa

## Key Files
installed_models.js, state.js, js/ui/settings.js, ChatManager.js, routes/chat.py, app.py, chats.py, scroll.js, js/components/ChatManager.js, chat.py, mobile.js, js/main.js

