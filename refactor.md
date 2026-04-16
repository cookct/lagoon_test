# routes/chat.py Refactor Plan

## Problem

`routes/chat.py` is 1998 lines handling 19 endpoints across 6 unrelated domains. The rest of the route layer is 100–300 LOC single-responsibility files. This refactor splits non-chat domains into focused files and fixes one internal duplication.

**Target:** ~750 LOC chat.py + 4 new route files.

---

## What Moves Out

| New file | Endpoints | Source lines in chat.py | ~LOC |
|---|---|---|---|
| `routes/images.py` | `/api/image/edit`, `/api/image/upscale`, `/api/image/generate/gemini`, `/api/image/generate/zai` | 1113–1577 | 300 |
| `routes/audio.py` | `/api/tts`, `/api/asr` | 1722–1999 | 200 |
| `routes/summaries.py` | `/api/generate_detailed_summary_route`, `/api/apply_summary`, `/api/summary_stack`, `/api/delete_summary`, `/api/approve_summary` | 1579–1720 | 120 |
| `routes/writing_tools.py` | `/api/analyze_edit`, `/api/overseer_check` (+ `_extract_overseer_json`) | 708–1018 | 310 |

**Stays in chat.py:** `/api/chat`, `/api/save_chat`, `/api/import_chat`, `/api/force_summarize`, `/api/preview_prompt`, `/api/context_status`, plus `_infer_provider`, `_process_lore_chunk`, `_flush_lore_buf`.

---

## Out of Scope

- `stream_chat()` internals (retry loop, thinking block stripper, lore buffer state machine) — high risk, no tests
- New service modules for images/audio
- Overseer JSON extraction cleanup
- Rate limiting, input validation improvements

---

## Global Risk Register

These risks apply across all phases. Overseer should be aware of them throughout.

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Import left behind in chat.py that was only used by moved code → silent dead import | High | Low | After every phase: scan remaining imports, remove orphans |
| Import missing in new file (was implicitly available via chat.py scope) | High | High | Every new file: verify each name used has an explicit import |
| Blueprint name collision (Flask requires unique names) | Low | High | Each new Blueprint gets a distinct name: `'images'`, `'audio'`, `'summaries'`, `'writing_tools'` |
| `_assemble_messages()` extraction diverges from preview_prompt behavior | Medium | Medium | These two blocks are NOT identical — see Phase 5 notes |
| print() debug statements left in audio.py | High | Low | Phase 3 explicitly replaces them |
| app.py or __init__.py not updated after new file created → 404 on all endpoints in that file | High | High | Wiring is the last step of every phase, and the first thing overseer checks |

---

## Phase 1 — Extract `routes/writing_tools.py`

**Why first:** Fully self-contained. No shared state with chat streaming. Easiest extraction, good warm-up.

### Steps

1. Create `routes/writing_tools.py` with:
   ```python
   import re, json, logging, requests
   from flask import Blueprint, request, jsonify
   from services.storage import get_api_key
   from services.installed_models import load as load_installed_models

   logger = logging.getLogger(__name__)
   writing_tools_bp = Blueprint('writing_tools', __name__)
   ```

2. Copy verbatim from `chat.py`:
   - `_extract_overseer_json()` — lines 853–927
   - `analyze_edit` route — lines 708–797
   - `force_summarize` route — lines 799–850
   - `overseer_check` route — lines 929–1018

   > **Note:** `force_summarize` is borderline — it triggers summarization manually, could stay in chat.py or summaries.py. Putting it here because it's between the two writing tool endpoints in the file and has no summary stack dependency.

3. Delete lines 708–1018 from `chat.py`.

4. Add to `routes/__init__.py`:
   ```python
   from .writing_tools import writing_tools_bp
   # add 'writing_tools_bp' to __all__
   ```

5. Add to `app.py`:
   ```python
   from routes import ..., writing_tools_bp
   app.register_blueprint(writing_tools_bp)
   ```

### Overseer Checklist — Phase 1

- [ ] `python app.py` starts clean (no ImportError, no AttributeError)
- [ ] `routes/writing_tools.py` has explicit imports for every name it uses — verify: `re`, `json`, `logging`, `requests`, `Blueprint`, `request`, `jsonify`, `get_api_key`, `load_installed_models`
- [ ] `_extract_overseer_json` is defined in `writing_tools.py` and NOT still in `chat.py`
- [ ] `chat.py` no longer imports anything that was only used by these 3 routes (check: `requests` — is it still used elsewhere in chat.py?)
- [ ] `POST /api/analyze_edit` returns a JSON response (not 404, not 500)
- [ ] `POST /api/overseer_check` returns a JSON response
- [ ] `POST /api/force_summarize` returns a JSON response
- [ ] Blueprint name `'writing_tools'` doesn't conflict with any existing blueprint name

---

## Phase 2 — Extract `routes/summaries.py`

**Why second:** All 5 endpoints are thin wrappers over `services/context.py`. Almost no logic to move. Very low risk.

### Steps

1. Create `routes/summaries.py` with:
   ```python
   import logging
   from flask import Blueprint, request, jsonify
   from services.context import (
       load_summary_stack, append_to_summary_stack, delete_summary_entry,
       generate_detailed_summary, _sync_to_disk, approve_pending_summary
   )

   logger = logging.getLogger(__name__)
   summaries_bp = Blueprint('summaries', __name__)
   ```

2. Copy verbatim from `chat.py`:
   - `generate_detailed_summary_route` — lines 1579–1599
   - `apply_summary` — lines 1601–1628
   - `summary_stack` — lines 1630–1639
   - `delete_summary` — lines 1641–1658
   - `approve_summary` — lines 1660–1676

3. Delete lines 1579–1676 from `chat.py`.

4. Wire into `routes/__init__.py` and `app.py` (same pattern as Phase 1).

### Overseer Checklist — Phase 2

- [ ] `python app.py` starts clean
- [ ] `summaries.py` has explicit imports for everything it uses from `services.context` — cross-check against the import block above
- [ ] `chat.py` no longer references `generate_detailed_summary`, `_sync_to_disk`, `approve_pending_summary` (they're only needed in summaries.py now — verify `context_status` endpoint in chat.py to ensure it doesn't use these)
- [ ] `POST /api/summary_stack` returns the stack (or empty array)
- [ ] `POST /api/delete_summary` returns `{"success": true}`
- [ ] `POST /api/approve_summary` returns a response
- [ ] `POST /api/apply_summary` returns a response
- [ ] `POST /api/generate_detailed_summary_route` returns a response
- [ ] `chat.py` import block for `services.context` is trimmed — only keep what `stream_chat`, `preview_prompt`, and `context_status` actually call

---

## Phase 3 — Extract `routes/audio.py`

**Why third:** Completely separate domain (no shared state with chat). The `print()` cleanup happens here.

### Steps

1. Create `routes/audio.py` with:
   ```python
   import os, io, json, struct, subprocess, tempfile, logging
   import requests
   from flask import Blueprint, request, jsonify, Response
   from services.storage import get_api_key, get_google_api_key

   logger = logging.getLogger(__name__)
   audio_bp = Blueprint('audio', __name__)
   ```

2. Copy `tts_stream` (lines 1722–1898) and `asr_route` (lines 1900–1999) from `chat.py` into `audio.py`.

3. **Replace all `print()` calls with `logger.debug()`** in the copied code:
   - Line 1734: `print(f"--- [TTS DEBUG] ..."` → `logger.debug(...)`
   - Line 1760: `print(f"--- [TTS DEBUG] Streaming Gemini ..."` → `logger.debug(...)`
   - Line 1851, 1895, 1924, 1977, 1996: same pattern — replace each one
   - Note: `get_google_api_key` is imported inline inside the function body in the original — hoist it to the top-level import in `audio.py`
   - Note: `import base64` is also inline in the original — hoist it

4. Delete lines 1722–1999 from `chat.py`.

5. Wire into `routes/__init__.py` and `app.py`.

### Overseer Checklist — Phase 3

- [ ] `python app.py` starts clean
- [ ] **Zero `print()` calls** in `audio.py` — grep for `print(` in the file
- [ ] `base64` and `get_google_api_key` are top-level imports (not inline inside function body)
- [ ] `chat.py` no longer imports `struct`, `subprocess`, `tempfile`, `io` — verify these aren't used elsewhere in chat.py before removing
- [ ] `POST /api/tts` with `{"text": "hello", "provider": "venice", "voice": "af_sky"}` returns audio bytes or a streaming response (not 404, not 500)
- [ ] `POST /api/asr` endpoint is reachable (not 404)
- [ ] No orphaned `get_google_api_key` import left in `chat.py` if it was only used by TTS

---

## Phase 4 — Extract `routes/images.py`

**Why fourth:** Most LOC to move, most complex routing logic, highest risk of import issues. Save for last of the "move" phases.

### Steps

1. Create `routes/images.py` with:
   ```python
   import os, re, json, base64, logging
   import requests, httpx
   from flask import Blueprint, request, jsonify
   from services.storage import get_api_key, get_zai_api_key
   from services.installed_models import load as load_installed_models
   from services import model_registry

   logger = logging.getLogger(__name__)
   images_bp = Blueprint('images', __name__)
   ```

2. Copy verbatim from `chat.py`:
   - `edit_image_route` — lines 1113–1254
   - `upscale_image_route` — lines 1256–1348
   - `generate_image_gemini` — lines 1350–1515
   - `generate_image_zai` — lines 1517–1577

3. Delete lines 1113–1577 from `chat.py`.

4. Wire into `routes/__init__.py` and `app.py`.

### Overseer Checklist — Phase 4

- [ ] `python app.py` starts clean
- [ ] `images.py` imports verified: `re`, `base64`, `httpx`, `requests`, `get_api_key`, `get_zai_api_key`, `load_installed_models`, `model_registry` — all present at top level
- [ ] `chat.py` no longer imports `httpx` if it was only used by image/streaming routes — **WARNING:** `httpx` IS used by `stream_chat()` for SSE streaming, so it MUST stay in chat.py; do not remove it
- [ ] `POST /api/image/edit` is reachable (not 404)
- [ ] `POST /api/image/upscale` is reachable (not 404)
- [ ] `POST /api/image/generate/gemini` is reachable (not 404)
- [ ] `POST /api/image/generate/zai` is reachable (not 404)
- [ ] `chat.py` line count is now in the 850–950 range (down from 1998)

---

## Phase 5 — Extract `_assemble_messages()` in chat.py

**This is the riskiest phase.** The two "duplicate" blocks are similar but not identical. Read this section carefully before touching anything.

### Differences between stream_chat and preview_prompt message assembly

| Concern | stream_chat (lines 127–187) | preview_prompt (lines 1047–1097) |
|---|---|---|
| RAG call | `rag_retrieve(chat_id, last_user_msg)` | `rag_retrieve(chat_id, last_user_msg, exclude_last_n=1)` |
| Author's note injection | **Dual**: top-of-prompt + depth position | **Single**: depth position only |
| Anchor call | `lore_scan()` only | `lore_scan()` + `lore_get_matched()` for metadata |
| Return value | modifies `messages` in-place (no explicit return) | same, but `author_note_index` is captured for response |

### What to extract

Create a module-level helper `_assemble_messages()` that handles the shared shape but accepts flags for the differences:

```python
def _assemble_messages(messages, config, chat_id, parent_config,
                       rag_exclude_last_n=0, dual_author_note=True):
    """
    Inject RAG hits, anchor lore, and author's note.
    Returns (augmented_messages, lore_matched, author_note_index).
    """
    ...
```

- `stream_chat` calls with `dual_author_note=True, rag_exclude_last_n=0`
- `preview_prompt` calls with `dual_author_note=False, rag_exclude_last_n=1`

`preview_prompt` uses `lore_matched` and `author_note_index` in its response — the function must return them even when unused by `stream_chat`.

### Steps

1. Write `_assemble_messages()` above `stream_chat()` in `chat.py`, handling all three branches (RAG, anchors, author's note) with the flag parameters above.
2. Replace lines 127–187 in `stream_chat()` with:
   ```python
   messages, _, _ = _assemble_messages(messages, config, chat_id, parent_config,
                                        dual_author_note=True, rag_exclude_last_n=0)
   ```
3. Replace lines 1047–1097 in `preview_prompt()` with:
   ```python
   messages, lore_matched, author_note_index = _assemble_messages(
       messages, config, chat_id, parent_config,
       dual_author_note=False, rag_exclude_last_n=1
   )
   ```
4. Verify `preview_prompt` still uses `lore_matched` and `author_note_index` in its response JSON downstream.

### Overseer Checklist — Phase 5

- [ ] `python app.py` starts clean
- [ ] `_assemble_messages()` is defined once, before `stream_chat()`
- [ ] `stream_chat` no longer contains the RAG/anchors/author's-note block inline (lines 127–187 of original)
- [ ] `preview_prompt` no longer contains the RAG/anchors/author's-note block inline (lines 1047–1097 of original)
- [ ] `POST /api/chat` — send a message with anchors configured; verify anchor lore appears in the stream
- [ ] `POST /api/chat` — send a message with an `author_note` in config; verify it's injected (check via preview first)
- [ ] `POST /api/preview_prompt` — returns `lore_matched` and `author_note_index` in response (not null/missing)
- [ ] `POST /api/preview_prompt` — token count matches what `stream_chat` would assemble (spot-check one known prompt)
- [ ] `dual_author_note=True` path: author's note appears at BOTH top of messages array AND at depth position
- [ ] `dual_author_note=False` path: author's note appears ONLY at depth position (not duplicated at top)

---

## Phase 6 — Final Import Cleanup + Line Count Verification

### Steps

1. Read the import block of `chat.py` line by line. For each imported name, grep the rest of the file to confirm it's still used. Remove dead imports.
2. Verify `chat.py` is ~750–850 LOC.
3. Smoke test all 6 remaining endpoints: `/api/chat`, `/api/save_chat`, `/api/import_chat`, `/api/force_summarize`, `/api/preview_prompt`, `/api/context_status`.

### Overseer Checklist — Phase 6

- [ ] No unused imports in `chat.py` — grep each imported name against the file body
- [ ] `chat.py` line count: `wc -l routes/chat.py` → should be 750–900
- [ ] All 4 new route files exist and are non-empty
- [ ] All 4 new blueprints are in `routes/__init__.py` exports and registered in `app.py`
- [ ] `POST /api/chat` streams a response end-to-end
- [ ] `POST /api/save_chat` saves correctly
- [ ] `POST /api/preview_prompt` returns assembled message list
- [ ] `POST /api/context_status` returns token usage
- [ ] No `print()` calls anywhere in any of the 5 modified/created files — `grep -r "print(" routes/`
- [ ] CLAUDE.md `routes/chat.py` description is still accurate (update it if needed)
