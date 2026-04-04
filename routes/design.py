"""
Lagoon Design Mode — Save/Reset API
POST /api/design/save   — upsert a CSS rule into user-overrides.css
POST /api/design/reset  — remove a CSS rule from user-overrides.css
"""
from flask import Blueprint, request, jsonify
from services.css_manager import validate_selector, validate_styles, save_rule, reset_rule

design_bp = Blueprint('design', __name__)


def _full_selector(selector: str, scope: str, theme_class: str) -> str:
    if scope == 'theme' and theme_class:
        tc = theme_class.lstrip('.')
        return f'.{tc} {selector}'
    return selector


@design_bp.route('/api/design/save', methods=['POST'])
def design_save():
    data = request.get_json(silent=True) or {}

    try:
        selector    = validate_selector(data.get('selector', ''))
        styles      = validate_styles(data.get('styles') or {})
        scope       = data.get('scope', 'global')
        theme_class = str(data.get('theme_class', '')).strip()
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    if not styles:
        return jsonify({'error': 'No styles provided'}), 400

    full_sel = _full_selector(selector, scope, theme_class)

    try:
        save_rule(full_sel, styles)
    except Exception as e:
        return jsonify({'error': f'CSS write failed: {e}'}), 500

    return jsonify({'ok': True, 'selector': full_sel})


@design_bp.route('/api/design/reset', methods=['POST'])
def design_reset():
    data = request.get_json(silent=True) or {}

    try:
        selector    = validate_selector(data.get('selector', ''))
        scope       = data.get('scope', 'global')
        theme_class = str(data.get('theme_class', '')).strip()
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    full_sel = _full_selector(selector, scope, theme_class)

    try:
        reset_rule(full_sel)
    except Exception as e:
        return jsonify({'error': f'CSS reset failed: {e}'}), 500

    return jsonify({'ok': True, 'selector': full_sel})
