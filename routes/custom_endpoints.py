"""
Custom OpenAI-compatible endpoint management.
"""
import os
import json
from flask import Blueprint, request, jsonify
from services import installed_models

custom_endpoints_bp = Blueprint('custom_endpoints', __name__)
ENDPOINTS_FILE = os.path.join(os.path.dirname(__file__), '..', 'custom_endpoints.json')


def _load():
    if not os.path.exists(ENDPOINTS_FILE):
        return []
    with open(ENDPOINTS_FILE) as f:
        return json.load(f)


def _save(data):
    with open(ENDPOINTS_FILE, 'w') as f:
        json.dump(data, f, indent=2)


@custom_endpoints_bp.route('/api/custom_endpoints', methods=['GET'])
def list_endpoints():
    return jsonify(_load())


@custom_endpoints_bp.route('/api/custom_endpoints', methods=['POST'])
def save_endpoint():
    ep = request.json or {}
    if not ep.get('id') or not ep.get('base_url') or not ep.get('model_id'):
        return jsonify({'error': 'id, base_url, and model_id are required'}), 400
    data = _load()
    # Check if this is an update (endpoint already existed)
    existing = next((e for e in data if e['id'] == ep['id']), None)
    data = [e for e in data if e['id'] != ep['id']]  # upsert
    data.append(ep)
    _save(data)

    # Sync to installed_models: remove old model entry if model_id changed
    if existing and existing.get('model_id') != ep.get('model_id'):
        installed_models.remove_model(existing['model_id'])

    installed_models.add_model({
        'id': ep['model_id'],
        'name': ep.get('name') or ep['model_id'],
        'provider': 'custom'
    })

    return jsonify({'ok': True})


@custom_endpoints_bp.route('/api/custom_endpoints/<ep_id>', methods=['DELETE'])
def delete_endpoint(ep_id):
    data = _load()
    ep = next((e for e in data if e['id'] == ep_id), None)
    data = [e for e in data if e['id'] != ep_id]
    _save(data)
    if ep and ep.get('model_id'):
        installed_models.remove_model(ep['model_id'])
    return jsonify({'ok': True})
