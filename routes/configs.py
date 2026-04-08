"""
Config Routes
Handles character configuration CRUD operations.
"""
import os
import json
import logging
from flask import Blueprint, request, jsonify

from config import CONFIG_DIR

logger = logging.getLogger(__name__)
from services import memory_settings
from services.storage import get_api_key, get_google_api_key, get_together_api_key

configs_bp = Blueprint('configs', __name__)


@configs_bp.route('/api/key_status', methods=['GET'])
def key_status():
    return jsonify({
        'venice': bool(get_api_key()),
        'google': bool(get_google_api_key()),
        'together': bool(get_together_api_key())
    })


@configs_bp.route('/api/configs', methods=['GET'])
def get_configs():
    if not os.path.exists(CONFIG_DIR):
        return jsonify([])
    return jsonify(sorted([f for f in os.listdir(CONFIG_DIR) if f.endswith('.json')]))


@configs_bp.route('/api/config/<config_name>', methods=['GET'])
def get_config(config_name):
    filepath = os.path.join(CONFIG_DIR, config_name)
    if not os.path.exists(filepath):
        return jsonify({"error": "Config not found"}), 404
    with open(filepath, 'r') as f:
        return jsonify(json.load(f))


@configs_bp.route('/api/config/<config_name>', methods=['DELETE'])
def delete_config_file(config_name):
    try:
        if '..' in config_name or config_name.startswith('/'):
            return jsonify({"error": "Invalid filename"}), 400
        filepath = os.path.join(CONFIG_DIR, config_name)
        if os.path.exists(filepath):
            os.remove(filepath)
            return jsonify({"success": True, "message": f"Deleted {config_name}"})
        else:
            return jsonify({"error": "File not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@configs_bp.route('/api/save_config', methods=['POST'])
def save_config():
    data = request.json
    filename, config_data = data.get('filename'), data.get('config')
    if not all([filename, filename.strip(), config_data]):
        return jsonify({"error": "Filename and config data required."}), 400

    filename = "".join(c for c in filename if c.isalnum() or c in (' ', '_', '-')).rstrip()
    filepath = os.path.join(CONFIG_DIR, f"{filename}.json")
    try:
        with open(filepath, 'w') as f:
            json.dump(config_data, f, indent=4)
        return jsonify({"success": True, "message": f"Configuration '{filename}' saved."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@configs_bp.route('/api/copy_config', methods=['POST'])
def copy_config():
    """Duplicate a character config with an incremented index suffix."""
    data = request.json
    source = data.get('config_name', '')
    if not source or '..' in source or source.startswith('/'):
        return jsonify({"error": "Invalid config name"}), 400

    source_path = os.path.join(CONFIG_DIR, source)
    if not os.path.exists(source_path):
        return jsonify({"error": "Source config not found"}), 404

    with open(source_path, 'r') as f:
        config_data = json.load(f)

    base = source.replace('.json', '')
    # Strip trailing number so "Kelly 2" → "Kelly", then increment from there
    import re as _re
    base = _re.sub(r'\s+\d+$', '', base)
    # Find next available index suffix
    index = 2
    while True:
        candidate = f"{base} {index}.json"
        if not os.path.exists(os.path.join(CONFIG_DIR, candidate)):
            break
        index += 1

    dest_path = os.path.join(CONFIG_DIR, candidate)
    try:
        config_data['character_name'] = candidate.replace('.json', '')
        with open(dest_path, 'w') as f:
            json.dump(config_data, f, indent=4)

        # Copy lore file if it exists
        # First try the exact source name (e.g., "Hermione Granger 2.lore.json")
        # Then try the base name without number suffix (e.g., "Hermione Granger.lore.json")
        source_lore_name = source.replace('.json', '')
        lore_candidates = [
            os.path.join(CONFIG_DIR, '.lore', f"{source_lore_name}.lore.json"),  # Exact source name
            os.path.join(CONFIG_DIR, '.lore', f"{base.rstrip()}.lore.json")      # Base name (stripped of number)
        ]
        for lore_src in lore_candidates:
            if os.path.exists(lore_src):
                dest_lore_dir = os.path.join(CONFIG_DIR, '.lore')
                os.makedirs(dest_lore_dir, exist_ok=True)
                dest_lore = os.path.join(dest_lore_dir, f"{candidate.replace('.json', '')}.lore.json")
                import shutil as _shutil
                _shutil.copy2(lore_src, dest_lore)
                logger.info(f"[Configs] Copied lore file: {lore_src} -> {dest_lore}")
                break

        return jsonify({"success": True, "new_config": candidate})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@configs_bp.route('/api/memory_settings', methods=['GET'])
def get_memory_settings():
    return jsonify(memory_settings.get_all())


@configs_bp.route('/api/memory_settings', methods=['POST'])
def save_memory_settings():
    data = request.json or {}
    try:
        saved = memory_settings.save(data)
        return jsonify(saved)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@configs_bp.route('/api/config/google_api_key', methods=['GET'])
def get_google_api_key():
    """Get Google API key from app_config.json for Gemini Live"""
    # app_config.json is in the root directory
    app_config_path = 'app_config.json'
    try:
        if os.path.exists(app_config_path):
            with open(app_config_path, 'r') as f:
                config = json.load(f)
                key = config.get('google_api_key')
                if key:
                    return jsonify({"key": key})
        return jsonify({"key": None, "error": "No Google API key configured"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500