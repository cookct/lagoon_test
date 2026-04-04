# Design Mode Implementation Plan (Revised)

This document outlines the high-resolution implementation plan for the "Design Mode" feature in the `lagoon_test` project, updated with critical architectural improvements and local preview auto-saving.

## Core Objective
Enable a visual "Design Mode" where users can click any element in the UI, manipulate its CSS properties via sliders and color pickers in a modal, auto-save previews locally, and persist those changes directly to the project's CSS files upon explicit save.

---

## 1. Frontend: The UI Toggle
**File:** `js/ui/settings.js`
**Changes:**
- Add a new "Design Tools" section to the settings context menu.
- Add a toggle switch (checkbox) for "Design Mode".
- When toggled **ON**: Call `designMode.enable()`.
- When toggled **OFF**: Call `designMode.disable()`.

---

## 2. Frontend: Design Mode Controller
**File:** `js/design_mode.js` (NEW)
**Responsibilities:**
- **State Management:** Track if Design Mode is active.
- **Hover Highlighting:**
    - Add a global `mouseover` listener.
    - Highlight the element under the cursor with a specific outline (e.g., `2px solid var(--accent)`).
- **Click Interception:**
    - Global `click` listener with `event.preventDefault()` and `event.stopPropagation()`.
- **Robust Selector Generation:**
    - Generate a highly specific CSS selector (using an algorithm that walks up the DOM tree, utilizing IDs, classes, and `nth-child` if necessary) to uniquely identify the element. The user can review/edit this selector.
- **Style Extraction & State:**
    - Store the element's original `style` attribute before applying any live preview changes.
    - Read `window.getComputedStyle(target)` to pre-populate sliders.
- **Preview Auto-Saving (localStorage):**
    - As the user adjusts sliders, auto-save the CSS changes to `localStorage` (e.g., `lagoon_design_preview`).
    - Apply these preview styles dynamically on page load if they exist in `localStorage`, ensuring changes aren't lost if the user refreshes before hitting "Save".
- **Modal Logic:** Show the "Design Editor" modal and handle live preview via inline styles.

---

## 3. Frontend: Design Editor Modal
**File:** `css/modals.css` & `js/design_mode.js`
**UI Components:**
- **Target Indicator:** Displays the generated CSS selector (e.g., `#chat-wrapper .message.user`). Editable by the user.
- **Scope Toggle:** Radio buttons for "Current Theme (e.g., `.theme-abyss`)" vs "Global".
- **Visual Sliders & Pickers:**
    - `Margin`, `Padding`, `Border Radius`, `Font Size` (px/em/rem).
    - `Text Color`, `Background Color`, `Border Color` (HEX/RGBA).
- **Actions:**
    - **Save (Explicit):** Sends the changes to the Flask backend to persist to CSS files. On success, removes the applied changes from `localStorage` preview state.
    - **Cancel:** Restores the original `style` attribute, clears the specific changes from `localStorage`, and closes the modal.
    - **Reset to Default:** Removes the custom rule from the CSS file via the backend AND clears any local preview state, reverting the element to its original styling.

---

## 4. Backend: Save API
**File:** `app.py` or a new `routes/design.py`
**Endpoint:** `POST /api/design/save` (and `POST /api/design/reset`)
**Input (JSON):**
```json
{
  "selector": "#chat-wrapper .message",
  "theme_class": ".theme-abyss",
  "scope": "theme",
  "styles": {
    "margin-top": "10px",
    "background-color": "#ff0000"
  }
}
```
**Responsibilities:**
- **Validation & Sanitization:** Strictly validate the `selector` to prevent CSS injection (e.g., reject selectors containing `{`, `}`, or `/*`). Validate CSS property names and values.
- Call the `CSSManager` utility.
- Return success/fail response.

---

## 5. Backend: CSS Manager Utility
**File:** `services/css_manager.py` (NEW)
**Responsibilities:**
- **AST CSS Parsing:** Use a robust CSS parsing library like `tinycss2` or `cssutils` (Python) instead of regex. This safely handles nested blocks, media queries, and comments.
- **Target Resolution:**
    - `scope="theme"` -> Modify `css/themes.css`. Construct the full selector (e.g., `.theme-abyss #chat-wrapper .message`).
    - `scope="global"` -> Modify `css/custom-design.css` (recommended to create a new file for user-generated global overrides, imported at the end of `index.html`) or `css/base.css`.
- **CSS Block Manipulation:**
    - Parse the CSS file into an AST.
    - Find the rule matching the exact constructed selector.
    - Update properties within that rule, or append a new rule if it doesn't exist.
    - Serialize the AST back to a CSS string.
- **Atomic File Writes:** 
    - Write the updated CSS to a temporary file first.
    - Perform an atomic rename (e.g., `os.replace`) to overwrite the original file, preventing corruption from concurrent edits or crashes during the write process. Create a `.bak` file as an extra precaution.

---

## 6. Integration & Verification
- **Test:** Verify AST parser correctly updates existing rules without mangling formatting or nearby media queries.
- **Test:** Ensure canceling the modal completely reverts the live-preview inline styles and clears the `localStorage` draft.
- **Test:** Verify auto-saving allows a user to tweak a style, refresh the page, and still see the tweaked preview before explicitly saving.
- **Test:** Verify that "Reset to Default" successfully removes the rule from the AST and updates the file.
- **Security:** Attempt CSS injection via the selector input to ensure validation blocks it.
---

## GEMINI SUGGESTIONS

### 1. Enhanced Selector Strategy (Stability over Specificity)
*   **Problem**: `nth-child` selectors break when the UI is dynamic (e.g., new messages added).
*   **Solution**: Implement a "Selector Breadcrumb" in the UI. When an element is clicked, show its path (e.g., `div#chat-container > div.message-list > div.message.user`). Allow the user to click any part of that path to target the broader class instead of just the specific element.
*   **Priority**: ID > Data Attribute > Unique Class > Tag Name. Avoid `nth-child` unless explicitly requested by the user.

### 2. CSS Variable Integration
*   **Problem**: `getComputedStyle` returns resolved values (e.g., `rgb(255, 0, 0)`), losing the connection to CSS variables like `var(--accent)`.
*   **Solution**: The `DesignMode` controller should scan the element's matched CSS rules (using `document.styleSheets`) to see if a property is currently defined via a variable.
*   **UI**: If a variable is detected, the color picker should offer two modes:
    *   **Edit Variable**: Updates the variable definition (e.g., `--accent: #newcolor`), affecting the whole theme.
    *   **Override**: Creates a new rule for the specific selector (e.g., `.my-element { color: #newcolor }`).

### 3. Layered CSS Architecture (Clean Updates)
*   **Problem**: Modifying `themes.css` or `base.css` directly makes project updates difficult and risks merge conflicts.
*   **Solution**:
    *   **Core Files**: Treat `css/base.css` and `css/themes.css` as read-only.
    *   **Override File**: Create `css/user-overrides.css`. This is the **only** file the `CSSManager` writes to.
    *   **Loading Order**: Ensure `user-overrides.css` is loaded last in `index.html`. This ensures user changes always take precedence without touching core logic.

### 4. "Live Preview" via Scoped Style Tag
*   **Problem**: Applying inline styles to a single element doesn't show how the change affects other similar elements (e.g., changing one message's padding should show for all messages).
*   **Implementation**: Instead of `element.style.padding = ...`, create a `<style id="design-mode-preview">` tag in the `<head>`.
*   **Logic**: As the user moves sliders, update the text content of this tag with the generated CSS rule (e.g., `#design-mode-preview { content: ".message { padding: 20px; }" }`). This provides a true "theme-wide" preview.

### 5. Security: Property Whitelisting
*   **Constraint**: Maintain a `const ALLOWED_PROPERTIES` list (e.g., `margin`, `padding`, `color`, `background-color`, `font-size`, `border-radius`, `box-shadow`).
*   **Validation**:
    *   Reject any value containing `url(`, `expression(`, or `;`.
    *   Strictly validate the `selector` input to prevent escaping the CSS block (e.g., no `}` characters allowed).

### 6. Undo/Redo Buffer
*   **Feature**: Keep a simple in-memory stack of changes in `js/design_mode.js`. This allows the user to "Undo" a slider move or color change before committing to the final "Save".

---

## KIMI K2.5 SUGGESTIONS

### 1. Visual Box Model Inspector Overlay
*   **Problem**: Sliders alone don't give users an intuitive understanding of margin vs padding vs border.
*   **Solution**: When Design Mode is active and an element is hovered/selected, render a floating "Box Model" visualization overlay directly on the element (similar to browser DevTools).
*   **Implementation**: Create a semi-transparent overlay div positioned absolutely over the target element, showing colored regions for margin (orange), border (yellow), padding (green), and content (blue). Update in real-time as sliders move.
*   **Benefit**: Makes the abstract CSS box model tangible for non-technical users.

### 2. Style Copy/Paste & Multi-Select
*   **Problem**: Users may want to apply the same styling to multiple similar elements (e.g., all message bubbles).
*   **Solution**: Add "Copy Styles" and "Paste Styles" buttons to the Design Editor modal.
*   **Implementation**: Store the current style object in a `designMode.clipboard` variable. When pasting, apply those styles to the new target. Also support "Apply to All Similar Elements" which finds elements with the same base class and applies the rule to the class selector instead of the specific instance.
*   **Keyboard Shortcuts**: `Ctrl/Cmd+Shift+C` to copy, `Ctrl/Cmd+Shift+V` to paste while in Design Mode.

### 3. Change Diff & Session History
*   **Problem**: Users lose track of what they've modified during a design session, especially with localStorage auto-save.
*   **Solution**: Maintain a "Session Changes" sidebar or panel that lists all modified elements in the current session.
*   **Implementation**: Each time a property is changed, add an entry to `designMode.sessionHistory` array with: `{timestamp, selector, property, oldValue, newValue, status: 'pending'}`.
*   **UI**: Show a collapsible "Recent Changes" panel in the modal with:
    *   Green dot for pending (unsaved) changes
    *   Checkmark for saved changes
    *   Ability to revert individual properties
    *   "Revert All" to clear the entire session

### 4. Responsive Preview Toggle
*   **Problem**: Users design on desktop but the app is used on mobile. Changes may break at different breakpoints.
*   **Solution**: Add viewport size presets to the Design Mode toolbar (Mobile: 375px, Tablet: 768px, Desktop: 100%).
*   **Implementation**: When a preset is clicked, wrap the entire app container in a resizable iframe or apply a CSS transform scale to simulate the viewport. Alternatively, apply a class that constrains the main wrapper width.
*   **Bonus**: Show a "Breakpoint Indicator" that displays the current CSS media query being applied as the user resizes.

### 5. Smart Property Presets & Design Tokens
*   **Problem**: Users can enter invalid values or create inconsistent designs (e.g., 17px margins when the design system uses 8px increments).
*   **Solution**: Implement "Design Tokens" - a JSON configuration file (`config/design-tokens.json`) that defines:
    *   Spacing scale: [4, 8, 16, 24, 32, 48, 64]
    *   Color palette: Primary, Secondary, Accent, Semantic colors
    *   Typography scale: Headings, Body, Caption sizes
    *   Border radius presets: None, Small, Medium, Large, Full
*   **UI**: Replace free-text inputs with:
    *   Segmented controls for spacing (showing 4px, 8px, 16px...)
    *   Color swatches from the design system palette
    *   "Custom" option that falls back to the color picker/text input for power users
*   **Benefit**: Ensures design consistency while still allowing full customization.

### 6. Theme Export/Import (JSON Format)
*   **Problem**: Users can't backup, share, or version control their design changes.
*   **Solution**: Add "Export Theme" and "Import Theme" buttons to the settings.
*   **Implementation**: Serialize all rules from `css/user-overrides.css` (or the AST) into a structured JSON format:
```json
{
  "theme_name": "My Dark Theme",
  "version": "1.0",
  "created_at": "2025-04-04",
  "rules": [
    {"selector": ".message.user", "properties": {"background-color": "#3a3a3a", "border-radius": "12px"}},
    {"selector": ".chat-header", "properties": {"border-bottom": "1px solid var(--accent)"}}
  ]
}
```
*   **Features**:
    *   Export downloads a `.lagoon-theme.json` file
    *   Import validates the JSON schema before applying
    *   Community theme gallery potential (load themes from URL)
    *   Auto-backup: Export theme to `backups/themes/` on every explicit save with timestamp

---

## GLM 5 SUGGESTIONS

### 1. Accessibility Validation & Contrast Checker
*   **Problem**: Users can easily create inaccessible designs by choosing low-contrast colors or removing focus indicators.
*   **Solution**: Integrate real-time WCAG contrast checking directly into the color picker UI.
*   **Implementation**:
    *   When a text/background color is changed, calculate the contrast ratio using the relative luminance formula.
    *   Display a badge next to the color input: "AA ✓" (green) for ≥4.5:1, "AA Large ✓" for ≥3:1, or "Fail ✗" (red) for below thresholds.
    *   Add a "Focus State" tab in the modal to ensure `:focus-visible` styles are defined for interactive elements.
    *   Optionally block saving if critical accessibility thresholds fail, with an override option for advanced users.
*   **Benefit**: Prevents accessibility regressions before they reach production.

### 2. Performance: Debounced Updates & Virtual Sliders
*   **Problem**: Continuous slider movement triggers expensive DOM updates and localStorage writes on every `input` event.
*   **Solution**: Implement a two-tier update strategy:
    *   **Visual Preview (immediate)**: Use `requestAnimationFrame` to update only the live `<style>` tag content, bypassing React/virtual DOM reconciliation.
    *   **Persistence (debounced)**: Write to `localStorage` only after 300ms of inactivity using a debounced function.
*   **Implementation**:
    ```javascript
    const debouncedSave = debounce((selector, styles) => {
      localStorage.setItem('lagoon_design_preview', JSON.stringify({selector, styles}));
    }, 300);
    
    slider.oninput = () => {
      updatePreviewStyle(selector, property, value); // Immediate visual
      debouncedSave(selector, styles); // Delayed persistence
    };
    ```
*   **Bonus**: Add a "Performance Mode" toggle that disables hover highlighting on large DOM trees (e.g., chat message lists with 100+ items).

### 3. Specificity Conflict Visualizer
*   **Problem**: Users don't understand why their CSS rule isn't applying (specificity wars, `!important` overrides).
*   **Solution**: When a rule is saved, show a "Specificity Score" and warn if another rule has higher specificity.
*   **Implementation**:
    *   Calculate specificity using the standard (0,0,0) notation (inline, ID, class/attribute, element).
    *   Query `document.styleSheets` to find conflicting rules for the same selector.
    *   Display a "Conflicts" panel showing: "Your rule: (0,1,2) | Existing rule: (0,1,3) - will be overridden!"
    *   Offer a "Boost Specificity" button that adds `:where()` wrapper or parent selector to increase specificity without `!important`.
*   **UI**: Color-code the specificity score (green = will apply, yellow = might conflict, red = will be overridden).

### 4. Atomic Backup System with Rollback UI
*   **Problem**: If a CSS write corrupts the file or the user makes a mistake, there's no easy recovery.
*   **Solution**: Before any write to `user-overrides.css`, create a timestamped backup.
*   **Implementation**:
    *   Backend creates `backups/css/user-overrides_YYYYMMDD_HHMMSS.css.bak` before each save.
    *   Store a manifest JSON (`backups/css/manifest.json`) with: `{timestamp, selector_count, file_hash}`.
    *   Add a "Design History" modal accessible from settings showing all backups with:
        *   Timestamp
        *   Number of rules changed
        *   "Restore" button for each backup
    *   Limit to last 20 backups, auto-delete older ones.
*   **Benefit**: Users can experiment fearlessly, knowing they can always revert.

### 5. Animation & Transition Property Support
*   **Problem**: Modern UIs rely heavily on animations; the current plan only covers static properties.
*   **Solution**: Add an "Animations" tab to the Design Editor modal.
*   **Implementation**:
    *   **Properties**: `transition`, `animation`, `animation-duration`, `animation-timing-function`, `animation-delay`.
    *   **UI**: Provide a timeline-style editor:
        *   Dropdown for easing presets (ease, ease-in-out, cubic-bezier...)
        *   Slider for duration (0ms - 2000ms)
        *   "Preview Animation" button that temporarily adds a class to trigger the animation.
    *   **Keyframe Editor (Advanced)**: Allow editing `@keyframes` rules via a simplified UI (start state, end state, intermediate stops).
*   **Security Note**: Validate animation names to prevent injection (only alphanumeric + dash).

### 6. CSS Variable Cascade Editor
*   **Problem**: CSS variables cascade from `:root` through themes; editing them requires understanding the inheritance chain.
*   **Solution**: When a variable is detected (e.g., `var(--accent)`), show its full cascade path.
*   **Implementation**:
    *   Parse `document.styleSheets` to find where `--accent` is defined (e.g., `:root`, `.theme-abyss`, `.user-overrides`).
    *   Display a breadcrumb: `:root (--accent: #667eea) → .theme-abyss (--accent: #ff6b6b) → .message (uses var(--accent))`.
    *   Allow editing at any level:
        *   "Edit Root" - changes global default
        *   "Edit Theme" - changes theme-specific override
        *   "Edit Local" - creates a new rule for this specific selector
    *   Show a "Where Used" panel listing all selectors that reference this variable.
*   **Benefit**: Empowers users to make systematic design changes via variables rather than repetitive property edits.

### 7. Shadow DOM & Component Boundary Detection
*   **Problem**: If the app uses Web Components or Shadow DOM, `document.styleSheets` won't find styles inside shadow roots.
*   **Solution**: Implement a `traverseShadowRoots()` function that recursively finds shadow roots and extracts their styles.
*   **Implementation**:
    ```javascript
    function getAllStyleSheets(root = document) {
      const sheets = [...root.styleSheets];
      root.querySelectorAll('*').forEach(el => {
        if (el.shadowRoot) {
          sheets.push(...getAllStyleSheets(el.shadowRoot));
        }
      });
      return sheets;
    }
    ```
*   **UI**: When targeting an element inside a shadow root, show a badge: "Inside Component - styles may be scoped". Offer to edit the component's internal stylesheet if accessible.
*   **Note**: This may be read-only for third-party components; document this limitation.

### 8. Dry Run Mode & Change Preview Diff
*   **Problem**: Users may want to see the impact of changes before committing to localStorage or file writes.
*   **Solution**: Add a "Preview Mode" toggle that shows a diff of what would change without applying anything.
*   **Implementation**:
    *   When "Preview Mode" is active, the modal shows:
        *   Original CSS (read-only, grayed out)
        *   New CSS (highlighted in green)
        *   A unified diff view
    *   "Apply" button is disabled; only "Cancel" or "Exit Preview" available.
    *   Useful for educational purposes or when exploring the codebase.
*   **Benefit**: Low-risk exploration for new users learning the CSS structure.

---

## IMPLEMENTATION PRIORITY MATRIX

| Feature | Complexity | Impact | Priority |
|---------|------------|--------|----------|
| UI Toggle + Hover Highlight | Low | High | P0 (MVP) |
| Design Editor Modal (Basic) | Medium | High | P0 (MVP) |
| CSS Manager (AST-based) | High | Critical | P0 (MVP) |
| localStorage Auto-Save | Low | High | P0 (MVP) |
| Selector Breadcrumb | Medium | High | P1 |
| CSS Variable Integration | Medium | High | P1 |
| user-overrides.css Architecture | Low | Critical | P1 |
| Accessibility Validation | Medium | High | P1 |
| Debounced Updates | Low | Medium | P1 |
| Box Model Overlay | Medium | Medium | P2 |
| Undo/Redo Buffer | Low | Medium | P2 |
| Backup/Rollback System | Medium | High | P2 |
| Responsive Preview | Medium | Medium | P2 |
| Animation Support | High | Medium | P3 |
| Shadow DOM Support | High | Low | P3 |
| Theme Export/Import | Medium | Medium | P3 |
| Design Tokens | High | Medium | P3 |
| Dry Run Mode | Low | Low | P4 |

---

## TECHNICAL DEPENDENCIES

### Frontend
- **tinycss2** (Python) - AST-based CSS parsing
- **debounce** utility - Already in codebase or implement inline
- **color** library - For contrast ratio calculations (WCAG)

### Backend
- **Flask** route extension - `/api/design/save`, `/api/design/reset`
- **Atomic file writes** - `tempfile` + `os.replace` pattern
- **Backup manifest** - JSON tracking for rollback UI

### New Files to Create
1. `js/design_mode.js` - Main controller
2. `services/css_manager.py` - AST manipulation
3. `css/user-overrides.css` - User-generated styles (empty initially)
4. `config/design-tokens.json` - Optional design system config
