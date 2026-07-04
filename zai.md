# Z.AI Header Hamburger → Options Modal — Plan of Attack

## Architecture Overview

- **`js/core/InstalledModels.js`** → `populateSelect()` builds the native `<select>` with `<optgroup>` sections per provider. z.ai models are grouped under `label="z.ai"`.
- **`js/core/UIManager.js`** → `createCustomDropdown()` converts the native select into a custom div-based dropdown. Each optgroup becomes a `.custom-dropdown-header` div (styled in `css/base.css` line 151, currently `pointer-events: none`).
- **`routes/chat.py`** lines 318–322 → the only z.ai-specific payload handling: clamps temperature, optionally sends `thinking: {"type": "disabled"}`.
- **Config flow** → checkboxes like `disable_thinking` / `strip_thinking` (index.html lines 732–733) are gathered into the config object sent to `/api/chat`.

---

## Phase 1: Make the z.ai dropdown header clickable + add hamburger button

**File: `js/core/UIManager.js`** (two places: `createCustomDropdown` ~line 117 and `updateCustomDropdown` ~line 275)

In both `populateOptions` functions, when creating the `.custom-dropdown-header` for an optgroup, detect if the label is `z.ai`. If so:
- Remove `pointer-events: none` for that header (override via inline style or a new class).
- Append a small hamburger button (`≡`) floated to the right inside the header.
- Wire the hamburger's click handler to open the new z.ai options modal (Phase 3).

This keeps the header text non-interactive (clicking the label area does nothing, as now) while the hamburger is the only clickable element — so users don't accidentally trigger it when scrolling past the section.

**File: `css/base.css`** (~line 151, `.custom-dropdown-header`)

Add a variant class `.custom-dropdown-header.has-action` that sets `pointer-events: auto` and uses `display: flex; justify-content: space-between; align-items: center;` so the hamburger sits at the right edge. Add styling for `.zai-header-btn` (small, subtle, inherits ANSI cyan color, hover highlight).

---

## Phase 2: New z.ai options modal (HTML + CSS)

**File: `index.html`**

Add a new modal block (sibling to the existing dual-model modal, near line 1150). Structure:

```html
<div id="zai-options-modal" class="modal hidden">
  <div class="modal-overlay"></div>
  <div class="modal-content">
    <div class="modal-header">
      <h2>Z.AI Model Options</h2>
      <button id="zai-options-close-btn">×</button>
    </div>
    <div class="modal-body">
      <!-- Reasoning Effort (GLM-5.2+ only) -->
      <label>Reasoning Effort
        <select id="zai-reasoning-effort">
          <option value="max">Max (deep, default)</option>
          <option value="xhigh">X-High</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="minimal">Minimal</option>
          <option value="none">None (skip thinking)</option>
        </select>
      </label>
      <p class="hint">Only affects GLM-5.2+. Lower = faster, higher = deeper reasoning.</p>

      <!-- Thinking toggle -->
      <label><input type="checkbox" id="zai-enable-thinking" checked> Enable Chain-of-Thought</label>
      <p class="hint">GLM-4.5+ only. Disable for faster, simpler responses.</p>

      <!-- Do Sample -->
      <label><input type="checkbox" id="zai-do-sample" checked> Sampling (do_sample)</label>
      <p class="hint">Uncheck for deterministic/greedy output (factual, reproducible).</p>

      <!-- Max Tokens -->
      <label>Max Tokens
        <input type="number" id="zai-max-tokens" min="1024" max="131072" step="1024" value="65536">
      </label>
      <p class="hint">z.ai default is 65536. Max 131072 for GLM-5.2/5.1/4.7/4.6.</p>

      <!-- Temperature / Top_P mutual-exclusion note -->
      <label><input type="checkbox" id="zai-use-top-p"> Use top_p instead of temperature</label>
      <p class="hint">z.ai recommends using one or the other, not both.</p>
    </div>
    <div class="modal-actions">
      <button id="zai-options-cancel-btn" class="secondary-btn">Cancel</button>
      <button id="zai-options-save-btn" class="primary-btn">Save</button>
    </div>
  </div>
</div>
```

**File: `css/base.css`** (or `css/sidebar.css`)

Add modal styling consistent with the existing dual-model modal (reuse `.modal`, `.modal-overlay`, `.modal-content`, `.modal-header`, `.modal-body`, `.modal-actions` classes already in the codebase). Add `.hint` styling (small, dim text).

---

## Phase 3: New `ZaiOptionsManager` JS module

**File: `js/components/ZaiOptionsManager.js`** (new file)

A small singleton module (mirroring the pattern of `DualModelManager.js`):

```js
export const zaiOptionsManager = {
  init() { ... },           // bind events, load saved config
  openModal() { ... },      // show modal, populate fields from localStorage
  closeModal() { ... },      // hide modal
  saveConfig() { ... },     // persist to localStorage key 'zai_options'
  getConfig() { ... },      // return the saved options object (used by chat send)
};
```

- **Persistence**: `localStorage` key `zai_options` storing `{ reasoning_effort, enable_thinking, do_sample, max_tokens, use_top_p }`.
- **`openModal()`**: reads from localStorage, populates the modal fields.
- **`saveConfig()`**: reads modal fields, writes to localStorage, closes modal.
- **`getConfig()`**: returns the parsed config (with sensible defaults: `reasoning_effort: 'max'`, `enable_thinking: true`, `do_sample: true`, `max_tokens: 65536`, `use_top_p: false`). This is what the chat-send code will call.
- **Event wiring**: close button, cancel button, save button, backdrop click, Escape key (same pattern as the dual-model modal fix).
- **Init call**: imported and `init()`'d from `js/main.js` at startup.

---

## Phase 4: Wire the hamburger to open the modal

**File: `js/core/UIManager.js`**

In the header-creation code (Phase 1), the hamburger's click handler does a dynamic import and calls `zaiOptionsManager.openModal()`:

```js
hamburger.addEventListener('click', async (e) => {
  e.stopPropagation();
  const { zaiOptionsManager } = await import('../components/ZaiOptionsManager.js');
  zaiOptionsManager.openModal();
});
```

This lazy-loads the module only when the user actually clicks the hamburger.

---

## Phase 5: Inject z.ai options into the chat config + backend payload

**File: `js/components/ChatManager.js`** (or wherever the config object is assembled before `/api/chat`)

When the selected model's provider is `zai`, merge `zaiOptionsManager.getConfig()` into the outgoing config object. Specifically add:
- `zai_reasoning_effort` (string)
- `zai_enable_thinking` (bool)
- `zai_do_sample` (bool)
- `zai_max_tokens` (int)
- `zai_use_top_p` (bool)

These are namespaced with a `zai_` prefix so they don't collide with existing fields and are clearly z.ai-specific.

**File: `routes/chat.py`** (lines 318–322, the `if is_zai:` block)

Replace the current 3-line block with a comprehensive handler that applies all the fixes from the compliance analysis:

```python
if is_zai:
    # 1. Temperature / top_p mutual exclusion (z.ai best practice)
    if config.get('zai_use_top_p', False):
        payload.pop('temperature', None)  # use top_p only
    else:
        payload.pop('top_p', None)  # use temperature only
    # Clamp temperature with a warning log instead of silent clamp
    temp = float(config.get('temperature', 0.7))
    if temp > 1.0:
        logger.warning(f"[ZAI] temperature {temp} > 1.0, clamping to 1.0")
    payload["temperature"] = min(temp, 1.0)

    # 2. Higher max_tokens default (z.ai default is 65536, not 2048)
    zai_max = config.get('zai_max_tokens')
    if zai_max:
        payload["max_tokens"] = int(zai_max)
    elif payload.get("max_tokens", 2048) <= 2048:
        # No explicit override and user left the low default — raise to z.ai's intended default
        payload["max_tokens"] = 65536

    # 3. do_sample (default true; send false for deterministic mode)
    payload["do_sample"] = bool(config.get('zai_do_sample', True))

    # 4. Explicit thinking control (GLM-4.5+ only — gate by model)
    #    reasoning_effort only on GLM-5.2+
    supports_thinking = (
        model_name.startswith('glm-4.5') or
        model_name.startswith('glm-4.6') or
        model_name.startswith('glm-4.7') or
        model_name.startswith('glm-5')
    )
    supports_reasoning_effort = model_name.startswith('glm-5.2')

    if supports_thinking:
        enable_thinking = config.get('zai_enable_thinking', True)
        # Also respect the legacy disable_thinking checkbox
        if config.get('disable_thinking', False):
            enable_thinking = False
        payload["thinking"] = {"type": "enabled" if enable_thinking else "disabled"}

        if supports_reasoning_effort and enable_thinking:
            effort = config.get('zai_reasoning_effort', 'max')
            if effort in ('max', 'xhigh', 'high', 'medium', 'low', 'minimal', 'none'):
                payload["reasoning_effort"] = effort
```

This addresses all 9 compliance problems:
1. ✅ `reasoning_effort` now sent (gated to GLM-5.2+)
2. ✅ `thinking` explicitly set to `enabled` or `disabled` (not just disabled)
3. ✅ `do_sample` now sent
4. ✅ `max_tokens` raised to 65536 default
5. ✅ Temperature clamp now logged with a warning
6. ✅ `top_p` / `temperature` mutual exclusion via `zai_use_top_p`
7. ✅ `strip_thinking` on z.ai now maps to `thinking: {"type": "disabled"}` (via the `disable_thinking` respect path)
8. ✅ Model-gating for `thinking` (GLM-4.5+) and `reasoning_effort` (GLM-5.2+)
9. ✅ Vision models (`glm-4.6v-*`) handled by Phase 6 gating refinement

---

## Phase 6: Model-gating refinement for vision models

In the `supports_thinking` check, handle the `glm-4.6v-flash` / `glm-4.6v-flashx` vision models. Per z.ai docs, GLM-4.5V "will force thinking" — so sending `thinking: {"type": "disabled"}` may be ignored or error. Refine the gate:

```python
is_vision = 'v' in model_name.split('-')[1] if '-' in model_name else False  # glm-4.6v-*
supports_thinking = (not is_vision) and (
    model_name.startswith('glm-4.5') or
    model_name.startswith('glm-4.6') or
    model_name.startswith('glm-4.7') or
    model_name.startswith('glm-5')
)
```

For vision models, omit the `thinking` object entirely and let z.ai apply its own default (forced thinking for 4.5V-class).

---

## Phase 7: Init + integration

**File: `js/main.js`**

Import and init the new module at startup:

```js
import { zaiOptionsManager } from './components/ZaiOptionsManager.js';
// ... in the init sequence:
zaiOptionsManager.init();
```

---

## Summary of files to create/modify

| File | Action |
|---|---|
| `js/components/ZaiOptionsManager.js` | **New** — modal controller + localStorage persistence |
| `index.html` | **Edit** — add z.ai options modal HTML |
| `css/base.css` | **Edit** — header-has-action styling, hamburger button, modal hint styling |
| `js/core/UIManager.js` | **Edit** — add hamburger to z.ai header in both `populateOptions` functions, wire to modal |
| `js/components/ChatManager.js` | **Edit** — merge z.ai options into outgoing config when provider is zai |
| `routes/chat.py` | **Edit** — rewrite the `if is_zai:` block with all 9 fixes |
| `js/main.js` | **Edit** — import + init `ZaiOptionsManager` |

---

## What the user sees

1. Opens the model dropdown → sees the "z.ai" section header with a small `≡` button on the right.
2. Clicks `≡` → a modal opens with reasoning effort, thinking toggle, do_sample, max_tokens, and top_p/temperature mutual-exclusion options.
3. Saves → preferences persist in localStorage and are injected into every z.ai chat request.
4. The backend now sends `reasoning_effort`, `do_sample`, explicit `thinking`, and a proper `max_tokens` — fully compliant with z.ai's parameter spec.

---

## Compliance problems addressed (from earlier analysis)

1. `reasoning_effort` never sent despite GLM-5.2 being installed → **Fixed (Phase 5)**
2. `thinking` only sent when disabling, never explicitly enabled → **Fixed (Phase 5)**
3. `do_sample` never sent → **Fixed (Phase 5)**
4. `max_tokens` defaults to 2048 vs z.ai's 65536 → **Fixed (Phase 5)**
5. Temperature silently clamped to 1.0 → **Fixed (Phase 5, now logged)**
6. `top_p` and `temperature` sent together against z.ai recommendation → **Fixed (Phase 5, mutual exclusion)**
7. `strip_thinking` config field has no effect on z.ai → **Fixed (Phase 5, respects disable_thinking)**
8. No model-gating for `thinking` / `reasoning_effort` → **Fixed (Phase 5 + 6)**
9. Vision models may conflict with thinking disabled → **Fixed (Phase 6)**