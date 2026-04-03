"""
Anchors Routes — CRUD API for anchors entries per character config.
"""
from flask import Blueprint, request, jsonify
from services.anchors import load_anchors, save_anchors, add_entry, update_entry, delete_entry

anchors_bp = Blueprint('anchors', __name__)


@anchors_bp.route('/api/lore/<config_name>', methods=['GET'])
def get_anchors(config_name):
    entries = load_anchors(config_name)
    return jsonify({"entries": entries})


@anchors_bp.route('/api/lore/<config_name>', methods=['POST'])
def create_entry(config_name):
    data = request.json or {}
    keywords = data.get('keywords', [])
    content = data.get('content', '').strip()
    priority = int(data.get('priority', 0))
    character_aware = data.get('character_aware', True)
    if not content:
        return jsonify({"error": "content is required"}), 400
    entry = add_entry(config_name, keywords, content, priority, character_aware)
    return jsonify(entry), 201


@anchors_bp.route('/api/lore/<config_name>/<entry_id>', methods=['PUT'])
def edit_entry(config_name, entry_id):
    updates = request.json or {}
    ok = update_entry(config_name, entry_id, updates)
    if not ok:
        return jsonify({"error": "entry not found"}), 404
    return jsonify({"ok": True})


@anchors_bp.route('/api/lore/<config_name>/<entry_id>', methods=['DELETE'])
def remove_entry(config_name, entry_id):
    ok = delete_entry(config_name, entry_id)
    if not ok:
        return jsonify({"error": "entry not found"}), 404
    return jsonify({"ok": True})
