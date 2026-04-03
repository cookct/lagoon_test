"""
Model Registry Service
Single source of truth for all image generation models.
Loads configuration from model_configs.json and provides lookup/validation.
"""
import json
import os
import logging

logger = logging.getLogger(__name__)

# Load config on module import
_CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'model_configs.json')
_config = None


_config_mtime = None

def _load_config():
    """Load and cache the model configuration. Reloads if file changed."""
    global _config, _config_mtime
    current_mtime = os.path.getmtime(_CONFIG_PATH)
    if _config is None or current_mtime != _config_mtime:
        with open(_CONFIG_PATH, 'r') as f:
            _config = json.load(f)
        _config_mtime = current_mtime
        logger.info(f"Loaded {len(_config['models'])} model configs")
    return _config


def get_config():
    """Get the full configuration object."""
    return _load_config()


def get_model(model_id):
    """
    Get a model's configuration by ID.
    Returns None if model not found.
    """
    config = _load_config()
    return config['models'].get(model_id)


def get_provider(provider_id):
    """
    Get a provider's configuration by ID.
    Returns None if provider not found.
    """
    config = _load_config()
    return config['providers'].get(provider_id)


def list_models(category=None, provider=None, supports_ai_mask=None):
    """
    List models, optionally filtered by category, provider, or capabilities.

    Args:
        category: Filter by category (generate, edit, upscale)
        provider: Filter by provider (venice, together, google)
        supports_ai_mask: Filter by AI mask support (True/False)

    Returns:
        Dict of model_id -> model_config
    """
    config = _load_config()
    models = config['models']

    result = {}
    for model_id, model_config in models.items():
        if category and model_config.get('category') != category:
            continue
        if provider and model_config.get('provider') != provider:
            continue
        if supports_ai_mask is not None:
            if model_config.get('supports_ai_mask', False) != supports_ai_mask:
                continue
        result[model_id] = model_config

    return result


def resolve_model(model_id, has_reference_image=False):
    """
    Resolve the actual model to use, handling auto-switching.

    For example, qwen-image -> qwen-edit when reference image is present.

    Args:
        model_id: The requested model ID
        has_reference_image: Whether a reference/target image is provided

    Returns:
        Tuple of (resolved_model_id, model_config) or (None, None) if not found
    """
    model = get_model(model_id)
    if not model:
        return None, None

    # Auto-switch to edit variant if reference image present
    if has_reference_image and model.get('edit_variant'):
        edit_model_id = model['edit_variant']
        edit_model = get_model(edit_model_id)
        if edit_model:
            logger.info(f"Auto-switched {model_id} -> {edit_model_id} (reference image present)")
            return edit_model_id, edit_model

    return model_id, model


def get_endpoint(model_id):
    """
    Get the full endpoint URL for a model.

    Returns:
        Full URL string or None if model/provider not found
    """
    model = get_model(model_id)
    if not model:
        return None

    provider = get_provider(model['provider'])
    if not provider:
        return None

    return provider['base_url'] + model['endpoint']


def get_api_key_name(model_id):
    """
    Get the API key name needed for a model.

    Returns:
        API key name string (e.g., 'venice', 'together', 'google')
    """
    model = get_model(model_id)
    if not model:
        return None

    provider = get_provider(model['provider'])
    if not provider:
        return None

    return provider['api_key_name']


def build_headers(model_id, api_key):
    """
    Build the request headers for a model.

    Args:
        model_id: The model ID
        api_key: The API key value

    Returns:
        Dict of headers
    """
    model = get_model(model_id)
    if not model:
        return {}

    provider = get_provider(model['provider'])
    if not provider:
        return {}

    headers = {"Content-Type": "application/json"}

    auth_header = provider['auth_header']
    auth_prefix = provider['auth_prefix']

    if auth_prefix:
        headers[auth_header] = f"{auth_prefix} {api_key}"
    else:
        headers[auth_header] = api_key

    return headers


def validate_params(model_id, params):
    """
    Validate parameters against model config.

    Args:
        model_id: The model ID
        params: Dict of parameters to validate

    Returns:
        Tuple of (is_valid, errors_list)
    """
    model = get_model(model_id)
    if not model:
        return False, [f"Unknown model: {model_id}"]

    errors = []
    model_params = model.get('params', {})

    # Check required params
    for param_name, param_config in model_params.items():
        if param_config.get('required') and param_name not in params:
            errors.append(f"Missing required parameter: {param_name}")

    # Validate provided params
    for param_name, param_value in params.items():
        if param_name not in model_params:
            continue  # Allow extra params, they'll be filtered later

        param_config = model_params[param_name]
        param_type = param_config.get('type')

        # Type validation
        if param_type == 'int':
            if not isinstance(param_value, int):
                try:
                    param_value = int(param_value)
                except (ValueError, TypeError):
                    errors.append(f"{param_name} must be an integer")
                    continue

            if 'min' in param_config and param_value < param_config['min']:
                errors.append(f"{param_name} must be >= {param_config['min']}")
            if 'max' in param_config and param_value > param_config['max']:
                errors.append(f"{param_name} must be <= {param_config['max']}")

        elif param_type == 'float':
            if not isinstance(param_value, (int, float)):
                try:
                    param_value = float(param_value)
                except (ValueError, TypeError):
                    errors.append(f"{param_name} must be a number")
                    continue

            if 'min' in param_config and param_value < param_config['min']:
                errors.append(f"{param_name} must be >= {param_config['min']}")
            if 'max' in param_config and param_value > param_config['max']:
                errors.append(f"{param_name} must be <= {param_config['max']}")

        elif param_type == 'string':
            if not isinstance(param_value, str):
                errors.append(f"{param_name} must be a string")
                continue

            if 'max_length' in param_config and len(param_value) > param_config['max_length']:
                errors.append(f"{param_name} exceeds max length of {param_config['max_length']}")

        elif param_type == 'enum':
            options = param_config.get('options', [])
            if param_value not in options:
                errors.append(f"{param_name} must be one of: {options}")

        elif param_type == 'bool':
            if not isinstance(param_value, bool):
                errors.append(f"{param_name} must be a boolean")

    return len(errors) == 0, errors


def filter_params(model_id, params):
    """
    Filter parameters to only include those supported by the model.
    Also applies defaults for missing optional params.

    Args:
        model_id: The model ID
        params: Dict of parameters

    Returns:
        Filtered dict of parameters
    """
    model = get_model(model_id)
    if not model:
        return params

    model_params = model.get('params', {})
    filtered = {}

    # Apply defaults and filter
    for param_name, param_config in model_params.items():
        if param_name in params:
            value = params[param_name]

            # Apply step constraint for dimensions
            if param_config.get('step') and isinstance(value, int):
                step = param_config['step']
                value = (value // step) * step

            filtered[param_name] = value
        elif 'default' in param_config:
            filtered[param_name] = param_config['default']

    return filtered


def get_ui_controls(model_id):
    """
    Get the list of UI controls that should be shown for a model.

    Returns:
        List of control names or empty list
    """
    model = get_model(model_id)
    if not model:
        return []
    return model.get('ui_controls', [])


def supports_feature(model_id, feature):
    """
    Check if a model supports a specific feature.

    Features: 'ai_mask', 'multi_edit', 'reference_images'

    Returns:
        Boolean
    """
    model = get_model(model_id)
    if not model:
        return False

    feature_map = {
        'ai_mask': 'supports_ai_mask',
        'multi_edit': 'supports_multi_edit',
        'reference_images': 'supports_reference_images'
    }

    config_key = feature_map.get(feature)
    if not config_key:
        return False

    return model.get(config_key, False)
