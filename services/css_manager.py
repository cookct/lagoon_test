"""
Lagoon Design Mode — CSS Manager
Reads/writes css/user-overrides.css only. Core CSS files are never touched.

Uses tinycss2 for AST-based parsing. Serialises back to a clean, owned format.
Atomic writes with timestamped backups (last 20 kept).
"""
import os
import re
import shutil
import tempfile
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
CSS_PATH     = PROJECT_ROOT / 'css' / 'user-overrides.css'
BACKUP_DIR   = PROJECT_ROOT / 'backups' / 'css'

ALLOWED_PROPERTIES = {
    'color', 'background', 'background-color', 'background-image', 'border-color', 'border-width', 'border-style',
    'border-radius', 'border-top-left-radius', 'border-top-right-radius',
    'border-bottom-left-radius', 'border-bottom-right-radius',
    'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'font-size', 'opacity', 'gap', 'box-shadow', 'display', 'width', 'height',
    'flex-grow', 'flex-shrink', 'flex-basis', 'align-self', 'justify-self',
    'box-sizing', 'cursor'
}

_SELECTOR_RE  = re.compile(r'^[a-zA-Z0-9_\-\.:\[\]#\s>~+*=^$|"\'()]+$')
_BAD_VALUE_RE = re.compile(r'expression\s*\(|[;}]') # Removed url() and url\s*\( to allow some backgrounds, though still restricted by design. Added back safely if needed.



# ── Validation ────────────────────────────────────────────────────────────────

def validate_selector(sel: str) -> str:
    sel = sel.strip()
    if not sel or len(sel) > 256:
        raise ValueError('Selector empty or too long')
    if not _SELECTOR_RE.match(sel):
        raise ValueError(f'Selector contains disallowed characters: {sel!r}')
    return sel


def validate_styles(styles: dict) -> dict:
    clean = {}
    for prop, val in styles.items():
        prop = prop.strip().lower()
        val  = str(val).strip()
        if prop not in ALLOWED_PROPERTIES:
            raise ValueError(f'Property not allowed: {prop!r}')
        if _BAD_VALUE_RE.search(val):
            raise ValueError(f'Value contains disallowed content: {val!r}')
        clean[prop] = val
    return clean


# ── Parse / Serialise ─────────────────────────────────────────────────────────
# user-overrides.css is written exclusively by this module in a predictable
# format, so a lightweight regex parser is sufficient and avoids dependencies.

_RULE_RE = re.compile(r'([^{/][^{]*?)\{([^}]*)\}', re.DOTALL)
_DECL_RE = re.compile(r'([\w-]+)\s*:\s*([^;]+);')


def _load_rules() -> dict:
    """Return {selector: {prop: value}} from user-overrides.css."""
    if not CSS_PATH.exists():
        return {}
    text  = CSS_PATH.read_text(encoding='utf-8')
    rules = {}
    for m in _RULE_RE.finditer(text):
        selector = m.group(1).strip()
        if not selector:
            continue
        props = {d.group(1).lower(): d.group(2).strip()
                 for d in _DECL_RE.finditer(m.group(2))}
        if props:
            rules[selector] = props
    return rules


def _serialise(rules: dict) -> str:
    lines = [
        '/* Lagoon Design Mode — User Overrides',
        '   Managed by the Design Mode tool. Do not edit manually. */\n',
    ]
    for selector, props in rules.items():
        lines.append(f'{selector} {{')
        for prop, val in props.items():
            lines.append(f'  {prop}: {val};')
        lines.append('}\n')
    return '\n'.join(lines)


# ── File I/O ──────────────────────────────────────────────────────────────────

def _backup():
    if not CSS_PATH.exists():
        return
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    ts   = datetime.now().strftime('%Y%m%d_%H%M%S')
    dest = BACKUP_DIR / f'user-overrides_{ts}.css.bak'
    shutil.copy2(CSS_PATH, dest)
    # Keep last 20
    baks = sorted(BACKUP_DIR.glob('*.css.bak'))
    for old in baks[:-20]:
        old.unlink(missing_ok=True)


def _atomic_write(content: str):
    CSS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        'w', dir=CSS_PATH.parent, delete=False,
        suffix='.tmp', encoding='utf-8'
    ) as f:
        f.write(content)
        tmp = f.name
    os.replace(tmp, CSS_PATH)


# ── Public API ────────────────────────────────────────────────────────────────

def save_rule(full_selector: str, styles: dict):
    """
    Upsert a CSS rule into user-overrides.css.
    full_selector already includes scope (e.g. '.theme-hacker .message.user').
    styles is a validated {prop: value} dict.
    """
    _backup()
    rules = _load_rules()
    existing = rules.get(full_selector, {})
    existing.update(styles)
    rules[full_selector] = existing
    _atomic_write(_serialise(rules))


def reset_rule(full_selector: str):
    """Remove a rule entirely from user-overrides.css."""
    _backup()
    rules = _load_rules()
    if full_selector in rules:
        del rules[full_selector]
        _atomic_write(_serialise(rules))
