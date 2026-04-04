# Lagoon Design Mode — User Guide

Design Mode is a visual CSS editor built into Lagoon's `design_mode` branch. It lets you click any element, tweak its appearance with sliders and colour pickers, and save the result directly to `css/user-overrides.css` — without touching any core CSS files.

> **Branch note:** Design Mode code lives on `design_mode` only. When you're happy with your changes, only `css/user-overrides.css` gets merged to `main`.

---

## Enabling Design Mode

1. Click the **⚙ Settings** button (top-right of the UI)
2. Toggle **Design Mode** on

The settings menu closes automatically and a blue pill badge appears at the bottom of the screen:

```
Design Mode  [Esc to close panel / exit]
```

To turn it off: toggle it off in Settings, or press **Esc** twice (once to close the editor panel, once to exit Design Mode).

---

## Selecting an Element

While Design Mode is active:

- **Hover** any element → it gets a blue outline and a crosshair cursor
- **Click** it → the Design Editor panel opens (top-right, draggable)

The panel can be repositioned by dragging its header. Clicking a different element while the panel is open will close the current panel and open a new one for the new element.

---

## The Design Editor Panel

### Selector

The generated CSS selector is shown at the top in an editable field.

```
.message.user
```

The selector is built automatically using the most stable path available: **ID → data attribute → class → tag name**. Dynamic selectors like `nth-child` are avoided.

You can edit it manually — any change to the field immediately updates which elements the live preview applies to.

### Scope

Two radio options:

| Option | What it does |
|--------|-------------|
| **Theme** | Prepends the active theme class (e.g. `.theme-hacker .message.user`) — changes only apply within the current theme |
| **Global** | No prefix — applies everywhere regardless of theme |

### Spacing

Sliders for individual CSS properties:

| Property | Range |
|----------|-------|
| Font Size | 0 – 72 px |
| Border Radius | 0 – 50 px |
| Border Width | 0 – 20 px |
| Opacity | 0 – 1 |

**Margin** and **Padding** each have four per-side sliders (T / R / B / L) in a compact grid. Margin accepts negative values (−100 to 100 px).

All sliders are pre-populated from the element's current computed style when the panel opens.

### Colors

Three colour pickers:

| Picker | Property |
|--------|----------|
| Text | `color` |
| Background | `background-color` |
| Border | `border-color` |

If a colour is currently transparent, the picker starts at `#000000` and shows `transparent`. It only activates once you pick a colour.

#### WCAG Contrast Badge

When you change **Text** or **Background** colour, a live contrast badge appears in the Colors section header:

| Badge | Contrast ratio | Meaning |
|-------|---------------|---------|
| `AAA ✓` | ≥ 7:1 | Enhanced — best |
| `AA ✓` | ≥ 4.5:1 | Normal text — passes |
| `AA Lg` | ≥ 3:1 | Large text only |
| `Fail` | < 3:1 | Does not pass |

---

## Live Preview

Every slider movement and colour pick updates the page **immediately** — no save required. The preview is injected via a `<style>` tag and only applies to your browser session.

The preview targets the selector shown in the Selector field, scoped by your Scope choice. Changing the selector or toggling scope updates the preview target live.

---

## Undo / Redo

While the editor panel is open:

| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` / `Cmd+Z` | Undo last change |
| `Ctrl+Y` / `Cmd+Y` | Redo |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` | Redo |

The undo stack records each **committed** change (when you release a slider or confirm a colour), not every tick of movement — so undo jumps in meaningful steps.

The stack is cleared when you Save or Cancel.

---

## Saving Changes

Click **Save** to write the current rule to `css/user-overrides.css`.

- The button shows `Saving…` then `Saved ✓`
- The preview style is cleared (the saved rule in `user-overrides.css` takes over)
- A timestamped backup is written to `backups/css/` (last 20 kept)

**Nothing changed?** The Save button will say `Nothing changed` if no sliders or pickers have been touched since the panel opened.

### What gets written

The rule is written as a single block in `user-overrides.css`:

```css
.theme-hacker .message.user {
  background-color: #2b3136;
  border-radius: 12px;
  padding-top: 8px;
}
```

Only properties you actually adjusted are included — untouched sliders are not written.

---

## Resetting a Rule

Click **Reset** to remove a previously saved rule for the current selector from `user-overrides.css`. The element reverts to its default styling. A backup is still created before the removal.

---

## Auto-Save (Survives Refresh)

As you adjust controls, your unsaved changes are automatically saved to `localStorage` (300ms debounce). If you refresh the page before hitting Save, your preview changes are restored and visible — even if Design Mode is off.

The auto-saved preview is cleared when you:
- Click **Save** (now persisted to CSS)
- Click **Cancel** (discarded)

---

## Cancel

Click **Cancel** or press **Esc** to close the editor panel. This:
- Clears the live preview for the current element
- Clears the localStorage auto-save for this selector
- Resets the undo stack

No changes are written to any file.

---

## Getting Changes to Main

`user-overrides.css` is the only output file. When you're done designing:

1. Review `css/user-overrides.css` — it contains only the rules you saved
2. Cherry-pick or merge that file to `main`
3. No Design Mode code (JS, Python routes, modal CSS) goes to `main`

---

## Properties Available

Design Mode only exposes a safe subset of CSS properties:

`color` · `background-color` · `border-color` · `border-width` · `border-radius` · `margin` (per-side) · `padding` (per-side) · `font-size` · `opacity` · `gap` · `box-shadow`

Custom values and properties not in this list are rejected by the backend. Values containing `url()`, `expression()`, or injection characters are also blocked.

---

## Tips

- **Selector too broad?** Edit it in the Selector field to target a more specific element. The preview updates immediately.
- **Changing all messages, not just one?** Use a class selector like `.message.user` rather than an ID — the rule will apply to all matching elements.
- **Theme vs Global?** Use Theme scope when you want the change to stay within the current theme. Use Global when you want it to apply to all themes (useful for layout/spacing changes).
- **Checking contrast?** Pick your text and background colours first — the AA/AAA badge updates live so you can tune until it passes before saving.
- **Made a mess?** Hit `Ctrl+Z` several times to walk back, or click Reset to remove the saved rule entirely.
