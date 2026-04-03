"""
Model Variant Map
Maps generation models to their edit/variant counterparts.
This allows for external configuration of model switching logic.
"""

MODEL_VARIANT_MAP = {
    "qwen-image": "qwen-edit",
    "seedream-v4": "seedream-v4-edit",
    "nano-banana-pro": "nano-banana-pro-edit",
    # Add future mappings here
}
