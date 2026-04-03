"""
System Prompts Routes
Handles system prompt CRUD operations.
"""
import uuid
from flask import Blueprint, request, jsonify

from services.storage import load_system_prompts, save_system_prompts

system_prompts_bp = Blueprint('system_prompts', __name__)


@system_prompts_bp.route('/api/system_prompts', methods=['GET'])
def get_system_prompts():
    return jsonify(load_system_prompts())


@system_prompts_bp.route('/api/system_prompts', methods=['POST'])
def add_system_prompt():
    data = request.json
    name = data.get('name', '').strip()
    content = data.get('content', '')

    if not name:
        return jsonify({"error": "Name is required"}), 400

    prompts = load_system_prompts()

    # Check for duplicate names
    for p in prompts:
        if p['name'].lower() == name.lower():
            return jsonify({"error": "A prompt with that name already exists"}), 400

    new_prompt = {
        "id": str(uuid.uuid4()),
        "name": name,
        "content": content,
        "enabled": True
    }
    prompts.append(new_prompt)
    save_system_prompts(prompts)

    return jsonify({"success": True, "prompt": new_prompt})


@system_prompts_bp.route('/api/system_prompts/<prompt_id>', methods=['PUT'])
def update_system_prompt(prompt_id):
    data = request.json
    prompts = load_system_prompts()

    for p in prompts:
        if p['id'] == prompt_id:
            if 'name' in data:
                p['name'] = data['name']
            if 'content' in data:
                p['content'] = data['content']
            if 'enabled' in data:
                p['enabled'] = data['enabled']
            if 'include_venice' in data:
                p['include_venice'] = data['include_venice']
            if 'enable_web' in data:
                p['enable_web'] = data['enable_web']
            save_system_prompts(prompts)
            return jsonify({"success": True, "prompt": p})

    return jsonify({"error": "Prompt not found"}), 404


@system_prompts_bp.route('/api/system_prompts/<prompt_id>', methods=['DELETE'])
def delete_system_prompt(prompt_id):
    prompts = load_system_prompts()
    prompts = [p for p in prompts if p['id'] != prompt_id]
    save_system_prompts(prompts)
    return jsonify({"success": True})