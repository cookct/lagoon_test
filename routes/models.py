"""
Model Routes
Serves model configuration and installed model SSOT to frontend.
"""
from flask import Blueprint, jsonify, request
from services import model_registry, installed_models
from services.storage import get_api_key, get_together_api_key
import httpx

models_bp = Blueprint('models', __name__)


@models_bp.route('/api/models', methods=['GET'])
def get_all_models():
    """Get all model configurations for frontend."""
    config = model_registry.get_config()
    return jsonify(config)


@models_bp.route('/api/models/list', methods=['GET'])
def list_models():
    """Get a simplified list of models for dropdowns."""
    models = model_registry.list_models()
    result = []
    for model_id, config in models.items():
        result.append({
            "id": model_id,
            "display_name": config.get("display_name", model_id),
            "category": config.get("category"),
            "provider": config.get("provider"),
            "price": config.get("price_per_image"),
            "ui_controls": config.get("ui_controls", [])
        })
    return jsonify(sorted(result, key=lambda x: x["display_name"]))


@models_bp.route('/api/models/<path:model_id>', methods=['GET'])
def get_model(model_id):
    """Get a specific model's configuration."""
    model = model_registry.get_model(model_id)
    if not model:
        return jsonify({"error": f"Model not found: {model_id}"}), 404
    return jsonify({"id": model_id, **model})



@models_bp.route('/api/providers', methods=['GET'])
def get_providers():
    """Get provider configurations."""
    config = model_registry.get_config()
    return jsonify(config.get("providers", {}))


@models_bp.route('/api/models/local', methods=['GET'])
def get_local_models():
    """Proxy to Ollama /api/tags — returns list of locally available model names."""
    url = request.args.get('url', 'http://localhost:11434').rstrip('/')
    try:
        resp = httpx.get(f"{url}/api/tags", timeout=5.0)
        if resp.status_code == 200:
            models = [m['name'] for m in resp.json().get('models', [])]
            return jsonify({'models': models})
        return jsonify({'models': [], 'error': f'Ollama returned {resp.status_code}'})
    except Exception as e:
        return jsonify({'models': [], 'error': str(e)})


@models_bp.route('/api/models/test', methods=['GET'])
def test_models():
    return jsonify({"status": "ok"})


# --- Installed Models SSOT ---

@models_bp.route('/api/installed_models', methods=['GET'])
def get_installed_models():
    return jsonify(installed_models.load())


@models_bp.route('/api/installed_models', methods=['POST'])
def add_installed_model():
    data = request.json or {}
    model_id = data.get('id', '').strip()
    name = data.get('name', '').strip()
    if not model_id or not name:
        return jsonify({"error": "id and name required"}), 400
    added = installed_models.add_model({
        "id": model_id,
        "name": name,
        "provider": data.get('provider', 'venice'),
        "pricing": data.get('pricing')
    })
    return jsonify({"added": added, **installed_models.load()})


@models_bp.route('/api/installed_models/<path:model_id>', methods=['DELETE'])
def delete_installed_model(model_id):
    removed = installed_models.remove_model(model_id)
    return jsonify({"removed": removed, **installed_models.load()})


# --- Venice Model Discovery ---

@models_bp.route('/api/venice/models', methods=['GET'])
def get_venice_models():
    """Proxy Venice GET /api/v1/models?type=text — requires Venice API key."""
    api_key = get_api_key()
    if not api_key:
        return jsonify({"error": "no_key"}), 403
    try:
        resp = httpx.get(
            'https://api.venice.ai/api/v1/models',
            params={'type': 'text'},
            headers={'Authorization': f'Bearer {api_key}'},
            timeout=10.0
        )
        if not resp.is_success:
            return jsonify({"error": f"Venice returned {resp.status_code}"}), 502
        data = resp.json()
        # Filter to text models only, return slim objects
        models = []
        for m in data.get('data', []):
            spec = m.get('model_spec', {})
            if m.get('type') != 'text' or spec.get('offline'):
                continue
            
            # Filter for serverless models: pricing.input.usd should be > 0
            pricing_data = spec.get('pricing', {})
            input_price = pricing_data.get('input', {}).get('usd', 0)
            output_price = pricing_data.get('output', {}).get('usd', 0)
            
            if input_price == 0 and output_price == 0:
                continue

            models.append({
                "id": m['id'],
                "name": spec.get('name', m['id']),
                "description": spec.get('description'),
                "context_tokens": spec.get('availableContextTokens'),
                "traits": spec.get('traits', []),
                "capabilities": spec.get('capabilities', {}),
                "pricing": spec.get('pricing', {}).get('input', {}).get('usd') is not None and {
                    "input": spec.get('pricing', {}).get('input', {}).get('usd'),
                    "output": spec.get('pricing', {}).get('output', {}).get('usd')
                } or None
            })
        return jsonify({"models": models})
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@models_bp.route('/api/venice/compatibility_mapping', methods=['GET'])
def get_venice_compatibility_mapping():
    api_key = get_api_key()
    if not api_key:
        return jsonify({"error": "no_key"}), 403
    try:
        resp = httpx.get(
            'https://api.venice.ai/api/v1/models/compatibility_mapping',
            params={'type': 'text'},
            headers={'Authorization': f'Bearer {api_key}'},
            timeout=10.0
        )
        return jsonify(resp.json())
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@models_bp.route('/api/venice/traits', methods=['GET'])
def get_venice_traits():
    api_key = get_api_key()
    if not api_key:
        return jsonify({"error": "no_key"}), 403
    try:
        resp = httpx.get(
            'https://api.venice.ai/api/v1/models/traits',
            params={'type': 'text'},
            headers={'Authorization': f'Bearer {api_key}'},
            timeout=10.0
        )
        return jsonify(resp.json())
    except Exception as e:
        return jsonify({"error": str(e)}), 502


# --- Together.ai Model Discovery ---

@models_bp.route('/api/together/models', methods=['GET'])
def get_together_models():
    """Proxy Together.ai GET /v1/models — requires Together.ai API key."""
    api_key = get_together_api_key()
    if not api_key:
        return jsonify({"error": "no_key"}), 403
    try:
        # 1. Fetch all models
        # 2. Fetch dedicated models only
        # 3. Serverless = All - Dedicated (and must be 'chat')
        headers = {'Authorization': f'Bearer {api_key}'}
        
        all_resp = httpx.get('https://api.together.xyz/v1/models', headers=headers, timeout=10.0)
        dedicated_resp = httpx.get('https://api.together.xyz/v1/models', params={'dedicated': 'true'}, headers=headers, timeout=10.0)
        
        if not all_resp.is_success:
            return jsonify({"error": f"Together.ai returned {all_resp.status_code}"}), 502
            
        dedicated_ids = set()
        if dedicated_resp.is_success:
            dedicated_ids = {m['id'] for m in dedicated_resp.json()}

        data = all_resp.json()
        models = []
        for m in data:
            if m.get('type') != 'chat':
                continue
            
            # Exclude models that are in the dedicated list
            if m['id'] in dedicated_ids:
                continue

            models.append({
                "id": m['id'],
                "name": m.get('display_name') or m['id'],
                "organization": m.get('organization'),
                "context_tokens": m.get('context_length'),
                "traits": [],
                "pricing": m.get('pricing') and {
                    "input": m['pricing'].get('input'),
                    "output": m['pricing'].get('output')
                } or None
            })
        models.sort(key=lambda x: x['name'])
        return jsonify({"models": models})
    except Exception as e:
        return jsonify({"error": str(e)}), 502
