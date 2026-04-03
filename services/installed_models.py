"""
Installed Models Service
Single source of truth for which models are available in the UI.
"""
import json
import os
import logging

logger = logging.getLogger(__name__)

INSTALLED_MODELS_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'installed_models.json')

DEFAULTS = []


def load():
    """Load installed models, seeding defaults if file is missing."""
    if not os.path.exists(INSTALLED_MODELS_FILE):
        data = {"models": DEFAULTS}
        save(data)
        return data
    try:
        with open(INSTALLED_MODELS_FILE, 'r') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"[installed_models] Failed to load: {e}")
        return {"models": DEFAULTS}


def save(data):
    try:
        with open(INSTALLED_MODELS_FILE, 'w') as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        logger.error(f"[installed_models] Failed to save: {e}")


def add_model(model_obj):
    """Add a model if not already present. Returns True if added."""
    data = load()
    if any(m['id'] == model_obj['id'] for m in data['models']):
        return False
    data['models'].append(model_obj)
    save(data)
    return True


def remove_model(model_id):
    """Remove a model by ID. Returns True if removed."""
    data = load()
    before = len(data['models'])
    data['models'] = [m for m in data['models'] if m['id'] != model_id]
    if len(data['models']) < before:
        save(data)
        return True
    return False
