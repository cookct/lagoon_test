"""
Config Routes
Handles character configuration CRUD operations.
"""
import os
import io
import json
import zipfile
import logging
from flask import Blueprint, request, jsonify, send_file

from config import CONFIG_DIR

logger = logging.getLogger(__name__)
from services import memory_settings
from services.storage import get_api_key, get_google_api_key, get_together_api_key, get_zai_api_key
from services.context_rag import embed_context_file, delete_context_store

configs_bp = Blueprint('configs', __name__)


@configs_bp.route('/api/key_status', methods=['GET'])
def key_status():
    return jsonify({
        'venice': bool(get_api_key()),
        'google': bool(get_google_api_key()),
        'together': bool(get_together_api_key()),
        'zai': bool(get_zai_api_key())
    })


@configs_bp.route('/api/configs', methods=['GET'])
def get_configs():
    if not os.path.exists(CONFIG_DIR):
        return jsonify([])
    return jsonify(sorted([f for f in os.listdir(CONFIG_DIR) if f.endswith('.json')]))


@configs_bp.route('/api/configs/lore_files', methods=['GET'])
def get_lore_files():
    """Return list of config base names that have a sidecar lore file."""
    lore_dir = os.path.join(CONFIG_DIR, '.lore')
    if not os.path.exists(lore_dir):
        return jsonify([])
    names = []
    for f in sorted(os.listdir(lore_dir)):
        if f.endswith('.lore.json'):
            names.append(f[:-len('.lore.json')])
    return jsonify(names)


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


@configs_bp.route('/api/embed_context', methods=['POST'])
def embed_context():
    """Embed a context file for a character config using RAG chunking.
    
    Expects JSON: { config_name: str, content: str, source_file: str }
    Returns: { success: bool, chunks: int }
    """
    data = request.json or {}
    config_name = data.get('config_name', '').strip()
    content = data.get('content', '').strip()
    source_file = data.get('source_file', '')

    if not config_name or not content:
        return jsonify({"error": "config_name and content are required"}), 400

    # Validate config exists
    cfg_path = os.path.join(CONFIG_DIR, config_name)
    if not os.path.exists(cfg_path):
        return jsonify({"error": f"Config {config_name} not found"}), 404

    try:
        success = embed_context_file(config_name, content, source_file)
        if success:
            # Load just the metadata back to report chunk count
            from services.context_rag import _load_ctx_store
            store = _load_ctx_store(config_name)
            return jsonify({"success": True, "chunks": store.get("chunk_count", 0)})
        else:
            return jsonify({"error": "Failed to embed context — sentence-transformers may not be available"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@configs_bp.route('/api/context_status/<path:config_name>', methods=['GET'])
def context_status(config_name):
    """Check if a character has an embedded context file and how many chunks."""
    if '..' in config_name or config_name.startswith('/'):
        return jsonify({"error": "Invalid config name"}), 400
    from services.context_rag import _load_ctx_store
    store = _load_ctx_store(config_name)
    return jsonify({
        "source_file": store.get("source_file", ""),
        "chunk_count": store.get("chunk_count", 0)
    })


@configs_bp.route('/api/embed_context/<path:config_name>', methods=['DELETE'])
def delete_embedded_context(config_name):
    """Delete the embedded context store for a character."""
    if '..' in config_name or config_name.startswith('/'):
        return jsonify({"error": "Invalid config name"}), 400
    delete_context_store(config_name)
    return jsonify({"success": True})


@configs_bp.route('/api/export_character/<path:config_name>', methods=['GET'])
def export_character(config_name):
    """Package a character config + lore into a downloadable zip."""
    if '..' in config_name or config_name.startswith('/'):
        return jsonify({"error": "Invalid config name"}), 400

    config_path = os.path.join(CONFIG_DIR, config_name)
    if not os.path.exists(config_path):
        return jsonify({"error": "Config not found"}), 404

    base_name = config_name.replace('.json', '')
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.write(config_path, 'config.json')
        lore_path = os.path.join(CONFIG_DIR, '.lore', f"{base_name}.lore.json")
        if os.path.exists(lore_path):
            zf.write(lore_path, 'lore.json')
    buf.seek(0)
    return send_file(buf, mimetype='application/zip', as_attachment=True,
                     download_name=f"{base_name}.lagoon-char.zip")


@configs_bp.route('/api/import_character', methods=['POST'])
def import_character():
    """Import a character from a .lagoon-char.zip file."""
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
    file = request.files['file']
    try:
        buf = io.BytesIO(file.read())
        with zipfile.ZipFile(buf, 'r') as zf:
            names = zf.namelist()
            if 'config.json' not in names:
                return jsonify({"error": "Invalid zip: missing config.json"}), 400

            config_data = json.loads(zf.read('config.json').decode('utf-8'))
            char_name = config_data.get('character_name', '').strip()
            if not char_name:
                return jsonify({"error": "Config missing character_name"}), 400

            filename = "".join(c for c in char_name if c.isalnum() or c in (' ', '_', '-')).rstrip()
            os.makedirs(CONFIG_DIR, exist_ok=True)
            with open(os.path.join(CONFIG_DIR, f"{filename}.json"), 'w') as f:
                json.dump(config_data, f, indent=4)

            if 'lore.json' in names:
                lore_data = json.loads(zf.read('lore.json').decode('utf-8'))
                lore_dir = os.path.join(CONFIG_DIR, '.lore')
                os.makedirs(lore_dir, exist_ok=True)
                with open(os.path.join(lore_dir, f"{filename}.lore.json"), 'w') as f:
                    json.dump(lore_data, f, indent=4)

        return jsonify({"success": True, "character_name": char_name,
                        "filename": f"{filename}.json", "has_lore": 'lore.json' in names})
    except zipfile.BadZipFile:
        return jsonify({"error": "Invalid zip file"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500