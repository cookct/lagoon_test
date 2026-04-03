from flask import Blueprint, jsonify, request
import json
import os

macros_bp = Blueprint('macros', __name__)
MACROS_FILE = 'lagoon_macros.json'

@macros_bp.route('/api/macros', methods=['GET'])
def get_macros():
    try:
        if os.path.exists(MACROS_FILE):
            with open(MACROS_FILE, 'r') as f:
                return jsonify(json.load(f))
        return jsonify({})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@macros_bp.route('/api/macros', methods=['POST'])
def save_macros():
    try:
        data = request.json
        with open(MACROS_FILE, 'w') as f:
            json.dump(data, f, indent=4)
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
