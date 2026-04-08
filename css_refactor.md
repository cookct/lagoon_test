# CSS Refactor Plan: "Clean Cascade" Architecture

## Objective
Remove all `!important` declarations and restructure Lagoon's CSS to be 100% compatible with Design Mode using modern CSS best practices.

## 1. Core Architecture: Cascade Layers (@layer)
Define an explicit hierarchy where the user's overrides always win without needing `!important`.

**Layer Order:**
1. `reset`: Browser normalization.
2. `base`: Global typography and layout.
3. `components`: Structural CSS for UI elements (Sidebar, Chat, Modals).
4. `themes`: Theme-specific variable assignments.
5. `overrides`: Design Mode output (`user-overrides.css`).

## 2. Variable-First Theming
Themes will no longer override properties directly. They will only redefine variable tokens.

- **Semantic Tokens**: `--accent-primary`, `--bg-app`.
- **Component Tokens**: `--sidebar-bg`, `--chat-bubble-user-bg`.

## 3. Structural Changes
- **`main.css`**: The new entry point defining `@layer` order and importing all modules.
- **`variables.css`**: Centralized default tokens in `:root`.
- **`user-overrides.css`**: Wrapped in `@layer overrides` to guarantee precedence.

## 4. Implementation Phases

### Phase 1: Foundation
- Create `main.css` with `@layer` definitions.
- Centralize all existing variables into `variables.css`.
- Update `index.html` to load `main.css` (which imports the others).

### Phase 2: Variable Extraction (The "Un-importanting")
- Strip `!important` from all theme files.
- Replace hardcoded values with variables in `components/`.
- Re-assign those variables within `.theme-x` blocks in `themes/`.

### Phase 3: Layering
- Wrap existing CSS files in `@layer` blocks to enforce the new cascade order.

### Phase 4: Validation
- Ensure Design Mode can override any property without `!important`.
- Verify theme switching remains functional and bug-free.
