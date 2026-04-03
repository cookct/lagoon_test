"""
Chats Routes
Handles chat history CRUD operations.
"""
import os
import json
from flask import Blueprint, request, jsonify

from config import CHATS_DIR

chats_bp = Blueprint('chats', __name__)


@chats_bp.route('/api/chats', methods=['GET'])
def get_chats():
    if not os.path.exists(CHATS_DIR):
        return jsonify([])
    chat_metadata_list = []
    for filename in os.listdir(CHATS_DIR):
        if filename.endswith('.json'):
            try:
                filepath = os.path.join(CHATS_DIR, filename)
                mtime = os.path.getmtime(filepath)
                with open(filepath, 'r') as f:
                    chat_data = json.load(f)
                chat_metadata_list.append({
                    "id": filename,
                    "display_name": chat_data.get("display_name"),
                    "parent_config": chat_data.get("parent_config"),
                    "modified": mtime
                })
            except:
                continue  # Skip corrupted files
    # Sort by modification time, newest first
    return jsonify(sorted(chat_metadata_list, key=lambda x: x.get('modified', 0), reverse=True))


@chats_bp.route('/api/chat/<chat_id>', methods=['GET'])
def get_chat(chat_id):
    filepath = os.path.join(CHATS_DIR, chat_id)
    if not os.path.exists(filepath):
        return jsonify({"error": "Chat not found"}), 404
    with open(filepath, 'r') as f:
        return jsonify(json.load(f))


@chats_bp.route('/api/chat/<chat_id>/rename', methods=['POST'])
def rename_chat(chat_id):
    if '..' in chat_id or chat_id.startswith('/'):
        return jsonify({"error": "Invalid filename"}), 400
    new_name = (request.json or {}).get('name', '').strip()
    if not new_name:
        return jsonify({"error": "Name required"}), 400
    filepath = os.path.join(CHATS_DIR, chat_id)
    if not os.path.exists(filepath):
        return jsonify({"error": "Chat not found"}), 404
    try:
        with open(filepath, 'r') as f:
            data = json.load(f)
        data['display_name'] = new_name
        with open(filepath, 'w') as f:
            json.dump(data, f)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@chats_bp.route('/api/chats/reparent', methods=['POST'])
def reparent_chats():
    """Update parent_config for all chats after a character rename."""
    data = request.json or {}
    old_parent = data.get('old_parent', '').strip()
    new_parent = data.get('new_parent', '').strip()
    if not old_parent or not new_parent:
        return jsonify({"error": "old_parent and new_parent required"}), 400
    if not os.path.exists(CHATS_DIR):
        return jsonify({"updated": 0})
    updated = 0
    for filename in os.listdir(CHATS_DIR):
        if not filename.endswith('.json'):
            continue
        filepath = os.path.join(CHATS_DIR, filename)
        try:
            with open(filepath, 'r') as f:
                chat_data = json.load(f)
            if chat_data.get('parent_config') == old_parent:
                chat_data['parent_config'] = new_parent
                with open(filepath, 'w') as f:
                    json.dump(chat_data, f)
                updated += 1
        except Exception:
            continue
    return jsonify({"updated": updated})


@chats_bp.route('/api/chat/<chat_id>', methods=['DELETE'])
def delete_chat_file(chat_id):
    try:
        if '..' in chat_id or chat_id.startswith('/'):
            return jsonify({"error": "Invalid filename"}), 400
        filepath = os.path.join(CHATS_DIR, chat_id)
        if os.path.exists(filepath):
            os.remove(filepath)
            return jsonify({"success": True, "message": f"Deleted {chat_id}"})
        else:
            return jsonify({"error": "File not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500