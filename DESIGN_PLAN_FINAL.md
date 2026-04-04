# Design Mode — Final Implementation Plan

## Core Objective
Enable a visual "Design Mode" where users can click any element, manipulate its CSS via a modal UI, and persist changes to a dedicated override file — without touching core CSS files.

---

## Architectural Decisions (Non-Negotiable)

1. **`css/user-overrides.css` is the only file the backend writes to.** Core files (`base.css`, `themes.css`, `variables.css`, etc.) are strictly read-only. The overrides file is loaded last in `index.html` so it always wins.
2. **Live preview uses a `<style id="design-mode-preview">` tag** injected into `<head>`, not inline styles. This reflects how the change actually affects all matching elements, not just the one clicked.
3. **Selector priority**: ID → data-attribute → unique class → tag name. `nth-child` is avoided; if unavoidable, user is warned and can edit the selector.
4. **localStorage auto-save** persists the preview state across refreshes (debounced at 300ms) until the user explicitly saves or cancels.
5. **Backend never touches theme scope directly.** The `theme_class` input is used to construct a scoped selector (e.g., `.theme-abyss .message.user`) written to `user-overrides.css`, not `themes.css`.

---

## P0 — MVP (Ship Together)

### 1. UI Toggle
**File:** `js/ui/settings.js`

- Add a "Design Tools" section to the settings context menu.
- Toggle checkbox that calls `designMode.enable()` / `designMode.disable()`.

---

### 2. Design Mode Controller
**File:** `js/design_mode.js` (NEW)

**Hover & Click:**
- On enable: attach global `mouseover` listener (highlight hovered element with `2px solid var(--accent)` outline).
- On click: `event.preventDefault()` + `event.stopPropagation()`, capture target, open modal.
- On disable: remove all listeners, remove highlight, close modal if open.

**Selector Generation:**
- Walk the DOM tree upward: prefer ID → data-attribute → unique class combination → tag name.
- Avoid `nth-child`; if no unique path is found, use the closest unique ancestor and log a warning.
- Result displayed in an editable input in the modal.

**Live Preview:**
- Inject `<style id="design-mode-preview">` into `<head>` on enable, remove on disable.
- On every slider/picker change: update `#design-mode-preview` textContent with the constructed CSS rule. No inline styles.

**LocalStorage Auto-Save (Debounced):**
```javascript
const debouncedSave = debounce((previewState) => {
  localStorage.setItem('lagoon_design_preview', JSON.stringify(previewState));
}, 300);

// On page load: if lagoon_design_preview exists, re-inject into #design-mode-preview.
```

**Style Extraction:**
- Use `window.getComputedStyle(target)` for initial slider values.
- Also scan `document.styleSheets` to detect if a property comes from a CSS variable (see P1 — CSS Variable Integration).

---

### 3. Design Editor Modal
**File:** `css/modals.css` (styles) + `js/design_mode.js` (logic)

**UI Components:**
- **Selector Input:** Editable text field showing the generated selector. User changes update the live preview target.
- **Scope Toggle:** Radio buttons — "Theme Scoped (e.g., `.theme-abyss`)" vs. "Global". Theme scope prepends the active theme class to the selector.
- **Property Sliders & Pickers** (see `ALLOWED_PROPERTIES` below):
  - Spacing: `margin`, `padding` (with per-side toggles), `border-radius`
  - Typography: `font-size` (px/em/rem switcher)
  - Color: `color`, `background-color`, `border-color` (HEX/RGBA picker)
- **Actions:**
  - **Save:** POST to `/api/design/save`. On success, clear this selector's localStorage entry.
  - **Cancel:** Clear `#design-mode-preview` for this selector, restore nothing (inline styles never used), clear localStorage entry. Close modal.
  - **Reset:** POST to `/api/design/reset`. Removes the rule from `user-overrides.css`, clears localStorage entry.

**Security — `ALLOWED_PROPERTIES` whitelist (frontend + backend must both enforce):**
```javascript
const ALLOWED_PROPERTIES = [
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-radius', 'font-size', 'color', 'background-color',
  'border-color', 'border-width', 'box-shadow', 'opacity', 'gap'
];
```
- Reject any value containing `url(`, `expression(`, `;`, `}`.
- Reject selectors containing `{`, `}`, `/*`, `*/`, `url(`.

---

### 4. Backend: Save API
**File:** `routes/design.py` (NEW) — register blueprint in `app.py`

**Endpoints:**
- `POST /api/design/save`
- `POST /api/design/reset`

**Input (save):**
```json
{
  "selector": ".message.user",
  "theme_class": ".theme-abyss",
  "scope": "theme",
  "styles": { "background-color": "#3a3a3a", "border-radius": "12px" }
}
```

**Validation:**
- Selector: regex allowlist `^[a-zA-Z0-9_\-\.\:\[\]#\s>~+*=^$|"'()]+$`, max 256 chars.
- Property names: must be in `ALLOWED_PROPERTIES` (Python set).
- Values: reject patterns `url\(`, `expression\(`, `;`, `\}`.

**Behavior:**
- `scope="theme"`: full selector = `{theme_class} {selector}`.
- `scope="global"`: full selector = `{selector}`.
- Delegates to `CSSManager`.

---

### 5. Backend: CSS Manager
**File:** `services/css_manager.py` (NEW)

- **Parser:** `tinycss2` for AST-based CSS manipulation (not regex).
- **Target:** Always `css/user-overrides.css`. Never `themes.css`, `base.css`, `variables.css`.
- **Logic:**
  - Parse file into AST.
  - Find existing rule for the exact constructed selector.
  - Update matching declarations, or append a new rule block.
  - Serialize AST back to string.
- **Atomic Write:**
  ```python
  import tempfile, os
  # Write to temp file, then os.replace() — prevents corruption on crash
  with tempfile.NamedTemporaryFile('w', dir=css_dir, delete=False, suffix='.tmp') as f:
      f.write(new_css)
      tmp_path = f.name
  os.replace(tmp_path, target_path)
  ```
- **Backup:** Before each write, copy current file to `backups/css/user-overrides_{timestamp}.css.bak`. Prune to last 20 backups.

---

### 6. New Files Summary (MVP)
| File | Purpose |
|------|---------|
| `js/design_mode.js` | Design Mode controller |
| `routes/design.py` | Save/reset API endpoints |
| `services/css_manager.py` | AST CSS manipulation |
| `css/user-overrides.css` | User-generated overrides (empty, loaded last) |

**`index.html` change:** Add `<link rel="stylesheet" href="css/user-overrides.css">` as the final stylesheet link.

---

## P1 — Ship Shortly After MVP

### Selector Breadcrumb UI
Show the full DOM path as clickable breadcrumbs (e.g., `div#chat-container > div.message-list > div.message.user`). Clicking any ancestor lets the user target a broader scope. Prevents broken selectors when the UI is dynamic (e.g., new messages added).

### CSS Variable Integration
- When scanning `document.styleSheets` for a property, detect if its value is `var(--something)`.
- If detected, show two mode buttons in the color picker:
  - **Edit Variable** — changes the variable definition (e.g., `--accent: #newcolor`) at the theme or root level.
  - **Override Here** — creates a new selector-specific rule with the literal value.
- Merge with GLM's cascade breadcrumb: show where the variable is currently defined (`:root`, `.theme-abyss`, or `user-overrides.css`) before letting user decide which level to edit.

### Accessibility: Real-Time Contrast Checker
- On text/background color change, calculate WCAG contrast ratio (relative luminance).
- Display badge next to color input: `AA ✓` (≥4.5:1, green), `AA Large ✓` (≥3:1, yellow), `Fail ✗` (<3:1, red).
- Warn but don't block save — include override checkbox ("Save anyway").

### Undo/Redo Buffer
- In-memory stack in `designMode.history[]`.
- Each slider/picker change pushes `{selector, property, oldValue, newValue}`.
- Keyboard: `Ctrl+Z` / `Ctrl+Shift+Z` within the modal. Also expose as buttons.
- Stack is cleared on explicit Save or Cancel.

---

## P2 — Near-Term Enhancements

### Box Model Inspector Overlay
When an element is selected, render a floating overlay with DevTools-style colored regions: margin (orange), border (yellow), padding (green), content (blue). Updates in real-time as sliders move. Implemented as an absolutely-positioned div matching the target element's bounding rect.

### Style Copy/Paste
- "Copy Styles" button: stores current `{property: value}` map in `designMode.clipboard`.
- "Paste Styles" button: applies clipboard to next selected element.
- Keyboard: `Ctrl+Shift+C` / `Ctrl+Shift+V` in Design Mode.
- "Apply to All Similar": if the selector targets a class, save the rule against the class directly (already how it works — this is just a UI affordance to make it clear).

### Session History Panel
- `designMode.sessionHistory[]` tracks every change: `{timestamp, selector, property, oldValue, newValue, status}`.
- Status: `pending` (unsaved), `saved`.
- Collapsible "Recent Changes" panel in the modal:
  - Green dot = pending, checkmark = saved.
  - "Revert" button per entry.
  - "Revert All" clears the entire session.

### Responsive Preview Toolbar
- Viewport preset buttons in Design Mode toolbar: Mobile (375px), Tablet (768px), Desktop (full).
- Implementation: apply a `max-width` + `margin: auto` CSS transform to `#app` or equivalent wrapper. Do NOT use iframe.
- A "Breakpoint Indicator" badge shows the currently-active media query as width changes.

### Rollback UI
- "Design History" option in settings (separate from Design Mode itself).
- Lists last 20 backups from `backups/css/` with timestamp and rule count.
- "Restore" triggers `POST /api/design/restore` with the backup filename.
- Backend validates the path stays within `backups/css/` (no path traversal).

### Specificity Conflict Visualizer (P2/P3 boundary)
- After generating the selector, scan `document.styleSheets` for rules with the same property.
- Calculate specificity using (ID, class/attr, element) notation.
- If a higher-specificity rule is found: show inline warning in modal — "Conflicts with: `#chat-wrapper .message` (0,1,2) — your rule (0,0,2) will be overridden."
- Offer "Boost Specificity" that adds a parent selector or wrapper.

---

## P3 — Future Features

### Animation & Transition Support
- New "Animations" tab in the Design Editor modal.
- Editable properties: `transition`, `animation-duration`, `animation-timing-function`, `animation-delay`.
- Easing preset dropdown + duration slider (0–2000ms).
- "Preview" button that adds a trigger class temporarily.
- Validate animation names: `^[a-zA-Z0-9_-]+$` only.

### Design Tokens
- `config/design-tokens.json`: spacing scale, color palette, border-radius presets, typography scale.
- Replace free sliders with segmented controls matching the token scale (still allow "Custom" fallback).
- Backend validates values against token constraints if tokens file is present.

### Theme Export/Import
- "Export Theme" downloads a `.lagoon-theme.json` file serialized from `user-overrides.css` AST:
  ```json
  { "theme_name": "...", "version": "1.0", "rules": [...] }
  ```
- "Import Theme" validates JSON schema before applying (never auto-apply without user confirmation).
- Auto-backup `user-overrides.css` to `backups/themes/` on every explicit save.

---

## Dropped / Deferred

| Feature | Decision |
|---------|---------|
| Shadow DOM Support | Not applicable — app is vanilla JS, no web components |
| Dry Run / Diff Preview Mode | Redundant with Cancel flow and session history; deferred indefinitely |
| Community Theme Gallery | Out of scope for v1 |

---

---

## Build Log

### Phase 1 — COMPLETE
**Files created/modified:**
- `css/user-overrides.css` — created (empty, loaded last in index.html)
- `index.html` — added `user-overrides.css` link after mobile CSS
- `js/design_mode.js` — created: `enable()`, `disable()`, hover highlight, click interception, selector generation, `<style id="design-mode-preview">` injection, `[Esc]` to exit, `initDesignMode()` for page-load restore
- `js/ui/settings.js` — added "Design Mode" toggle (with separator) after Agent Chat button; uses dynamic `import('../design_mode.js')` on change
- `js/main.js` — imports and calls `initDesignMode()` on DOMContentLoaded

**Behaviour delivered:**
- Toggle in Settings menu turns Design Mode on/off, persisted to localStorage
- Hovered elements get a `var(--accent)` outline + crosshair cursor
- Clicking any element intercepts the event, generates a CSS selector (ID → data-attr → class → tag, uniqueness-checked), logs it — no modal yet
- Fixed "Design Mode [Esc to exit]" badge at bottom of screen while active
- Page reload with design mode active re-enables automatically

**Next:** ~~Phase 2~~ — complete, see below

### Phase 2 — COMPLETE
**Files modified:**
- `js/design_mode.js` — full rewrite: `openModal()`, `_buildPanel()`, `_makeSliderRow()`, `_makeSideSliders()`, `_makeColorRow()`, `_updatePreview()`, `_buildRule()`, `_fullSelector()`, `_closePanel()`
- `css/modals.css` — added ~200 lines of `#design-editor-modal` + `.dm-*` styles at top

**Behaviour delivered:**
- Click any element → floating panel opens top-right, draggable by header
- Shows generated CSS selector (editable — changing it updates live preview target)
- Scope: "Theme (.theme-xxx)" vs "Global" radio buttons
- Sliders: Font Size, Border Radius, Border Width, Opacity — pre-populated from `getComputedStyle`
- Per-side sliders (2×2 grid): Margin T/R/B/L, Padding T/R/B/L
- Color pickers: Text, Background, Border — hex display / "transparent" for rgba(0,0,0,0)
- Live preview via `#design-mode-preview` style tag updates on every input event
- Esc closes panel first; second Esc exits design mode
- Save/Reset stub to console — Phase 3 wires the backend

**Next:** ~~Phase 3~~ — complete, see below

### Phase 3 — COMPLETE
**Files created/modified:**
- `services/css_manager.py` — `validate_selector()`, `validate_styles()`, `_load_rules()` (tinycss2 AST parse), `_serialise()`, `save_rule()`, `reset_rule()`, atomic write + backup (last 20 kept)
- `routes/design.py` — `design_bp`: `POST /api/design/save`, `POST /api/design/reset`; validates selector (regex allowlist, 256 char max), validates property names against ALLOWED_PROPERTIES, validates values (rejects url(, expression(, ; })
- `routes/__init__.py` — exports `design_bp`
- `app.py` — registers `design_bp`
- `requirements.txt` — adds `tinycss2>=1.2.0`
- `js/design_mode.js` — Save/Reset buttons now POST to API; `_saveRule()`, `_resetRule()`, `_apiPayload()`

**Behaviour delivered:**
- Save POSTs `{selector, scope, theme_class, styles}` → backend constructs full selector → upserts rule in `user-overrides.css` → atomic write → backup
- Reset POSTs same → removes rule from `user-overrides.css`
- Validation on both frontend (ALLOWED_PROPERTIES constant) and backend (Python set + regex)
- Backups written to `backups/css/user-overrides_YYYYMMDD_HHMMSS.css.bak`, pruned to 20

**Remaining:** ~~Phase 4~~ ~~Phase 5~~ — both complete, see below

### Phase 4 + 5 — COMPLETE
**File modified:** `js/design_mode.js` only

**Phase 4 — localStorage auto-save:**
- `_loadPreviewStorage` / `_savePreviewStorage` / `_clearPreviewStorage` / `_injectPersistedPreviews` — module-level helpers
- `_debouncedPersist` — 300ms debounced write to `lagoon_design_preview` key on every preview update
- `_updatePreview()` — now also calls `_debouncedPersist`
- `_closePanel()` (Cancel) — calls `_clearPreviewStorage` for the current selector
- `_saveRule()` success — calls `_clearPreviewStorage` + resets history stacks
- `initDesignMode()` — calls `_injectPersistedPreviews()` first, so unsaved previews survive page reload (even when design mode is off)
- Persisted previews live in `#lagoon-design-persist` style tag (separate from the live-edit `#design-mode-preview` tag)

**Phase 5 — Polish:**
- **Undo/Redo**: `_history[]` / `_redoStack[]` stacks; `_pushHistory()` called on slider `change` and color picker `change` events (not on every `input` — avoids stack spam); `_undo()` / `_redo()` revert `_currentStyles` and sync controls via `_updateControlForProp()`; `Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z` handled in `_onKeydown`
- **WCAG Contrast badge**: Appears in the Colors section header; updates live as Text or Background color changes; shows ratio + badge level (AAA/AA/AA Large/Fail) with colour-coded background; uses `contrastRatio()` / `relativeLuminance()` helpers
- **CSS Variable detection**: Deferred — complex, lower impact than the above

**Design Mode is feature-complete for initial release.**

---

## Priority Matrix

| Feature | Complexity | Impact | Phase |
|---------|------------|--------|-------|
| UI Toggle + Hover Highlight | Low | High | P0 |
| Design Editor Modal (basic) | Medium | High | P0 |
| CSS Manager (AST, user-overrides) | High | Critical | P0 |
| Live Preview via style tag | Low | High | P0 |
| localStorage Auto-Save (debounced) | Low | High | P0 |
| Security: validation + whitelisting | Low | Critical | P0 |
| Atomic File Writes + Backup | Low | Critical | P0 |
| Selector Breadcrumb UI | Medium | High | P1 |
| CSS Variable Integration | Medium | High | P1 |
| Accessibility Contrast Checker | Low | High | P1 |
| Undo/Redo Buffer | Low | Medium | P1 |
| Box Model Inspector Overlay | Medium | Medium | P2 |
| Style Copy/Paste | Low | Medium | P2 |
| Session History Panel | Medium | Medium | P2 |
| Responsive Preview Toolbar | Medium | Medium | P2 |
| Rollback UI | Medium | High | P2 |
| Specificity Conflict Visualizer | Medium | Medium | P2/P3 |
| Animation/Transition Support | High | Medium | P3 |
| Design Tokens | High | Medium | P3 |
| Theme Export/Import | Medium | Medium | P3 |

---

## Dependencies

### Python (add to `requirements.txt`)
- `tinycss2` — AST-based CSS parsing and serialization

### Frontend
- No new libraries. Debounce utility can be implemented inline (10 lines).
- WCAG contrast formula: pure math, no library needed.

### Backend
- New Flask blueprint: `routes/design.py`
- New service: `services/css_manager.py`
- New directory: `backups/css/` (create on first save if absent)
