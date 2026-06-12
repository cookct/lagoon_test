# GONDOLA.md — Project Briefing

## Architecture

- [2026-06-02] The Weave actively suppresses memories and cycles through suppression tactics. The narrator is imprisoned in marble, sip
- [2026-06-02] The lore system auto-finds lore files by config name (e.g., 'The Marauders' → 'The Marauders.lore.json'). No explicit re

## Decisions

- [2026-06-02] Chapter 1 shows the calcified present horror first, then flashbacks reveal how Primordials ended up in marble suits. Rea
- [2026-06-02] Narrator tells story through memories unlocked by a little girl. Memories are acts of resistance against the Weave—each 
- [2026-06-02] Consolidate system messages directly in state.messages so sidebar shows exactly what gets sent to API. Backend consolida

## Patterns

- [2026-05-20] A word can appear in a chunk but still not match semantically. 'Dementors' appears in the text but scores 0.206 against 

## Gotchas

- [2026-05-20] A similarity threshold of 0.30 was too aggressive for short single-word queries. Lowering to 0.25 helped. Single-word qu
- [2026-06-02] Lore entries are rich character/world knowledge injected when keywords match. Anchors are behavioral nudges. User wants 
- [2026-06-08] In 1-7rough.pdf, Chapter FOUR content begins on page 24, not page 25. Initially assumed pages 1-24 contained chapters 1-
- [2026-05-20] Chunk size of 400 tokens (~1600 chars) was too large for small test files—the entire content fit in one chunk, making si

## Active Context

- [2026-06-02] THE_UNSETTLED_WORLD_SUBMISSION.pdf ready with title page, synopsis, author bio, worldbuilding bible (~2,100 words), Chap
- [2026-06-02] The Marauders is a Harry Potter fanfiction writer persona chronicling the Marauders' 6th year at Hogwarts. Main cast: Ja
- [2026-06-08] Chapters ONE through THREE span pages 1-23. Chapter FOUR starts on page 24. This mapping is specific to this PDF file.
- [2026-06-03] Session cleared by user. Tasks covered: turn sample.txt into a pdf please | ok turn 1-7rough.pdf into an html doc please

## Key Files
Marauders.lore.js

