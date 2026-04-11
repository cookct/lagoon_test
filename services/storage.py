"""
Storage Service
Handles file I/O operations for JSON data.
"""
import os
import json
import logging

from config import APP_CONFIG_FILE, SYSTEM_PROMPTS_FILE

logger = logging.getLogger(__name__)


def get_api_key():
    """Load Venice API key from config file"""
    try:
        with open(APP_CONFIG_FILE, 'r') as f:
            return json.load(f).get("venice_api_key")
    except Exception:
        return None


def get_together_api_key():
    """Load Together.ai API key from config file"""
    try:
        with open(APP_CONFIG_FILE, 'r') as f:
            return json.load(f).get("together_api_key")
    except Exception:
        return None


def get_zai_api_key():
    """Load Z.AI API key from config file"""
    try:
        with open(APP_CONFIG_FILE, 'r') as f:
            return json.load(f).get("zai_api_key")
    except Exception:
        return None


def get_google_api_key():
    """Load Google Gemini API key from config file"""
    try:
        with open(APP_CONFIG_FILE, 'r') as f:
            return json.load(f).get("google_api_key")
    except Exception:
        return None


def load_json(filepath, default=None):
    """Load JSON from file, return default if not found or invalid"""
    if default is None:
        default = {}
    if not os.path.exists(filepath):
        return default
    try:
        with open(filepath, 'r') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading {filepath}: {e}")
        return default


def save_json(filepath, data, indent=4):
    """Save data as JSON to file"""
    try:
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=indent)
        return True
    except Exception as e:
        logger.error(f"Error saving {filepath}: {e}")
        return False


def load_system_prompts():
    """Load system prompts from file"""
    return load_json(SYSTEM_PROMPTS_FILE, default=[])


def save_system_prompts(prompts):
    """Save system prompts to file"""
    return save_json(SYSTEM_PROMPTS_FILE, prompts)


def get_chat_display_name(messages):
    """Generate display name from first user message"""
    for msg in messages:
        if msg.get('role') == 'user':
            content = msg.get('content', '')
            # Handle multimodal content (list format)
            if isinstance(content, list):
                content = next((p.get('text', '') for p in content if p.get('type') == 'text'), '')
            first_line = content.split('\n')[0]
            return " ".join(first_line.split()[:4])
    return "New Chat"