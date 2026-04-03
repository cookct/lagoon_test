"""
Together AI Model Specifications
Based on brute-force parameter acceptance testing.
"""

TOGETHER_SPECS = {
    "full_support": [
        "black-forest-labs/FLUX.1-schnell",
        "stabilityai/stable-diffusion-xl-base-1.0",
        "black-forest-labs/FLUX.1-kontext-pro",
        "Qwen/Qwen-Image",
        "HiDream-ai/HiDream-I1-Full",
        "black-forest-labs/FLUX.1-dev",
        "Lykon/DreamShaper",
        "stabilityai/stable-diffusion-3-medium",
        "RunDiffusion/Juggernaut-pro-flux",
        "black-forest-labs/FLUX.2-dev",
        "black-forest-labs/FLUX.1-kontext-max",
        "HiDream-ai/HiDream-I1-Dev",
        "HiDream-ai/HiDream-I1-Fast",
        "Rundiffusion/Juggernaut-Lightning-Flux",
        "black-forest-labs/FLUX.1-krea-dev"
    ],
    "limited": {
        "black-forest-labs/FLUX.2-pro": {
            "missing": ["steps", "guidance_scale", "negative_prompt"],
            "accepted": ["aspect_ratio", "height", "output_format", "width", "n", "seed", "prompt_upsampling", "prompt", "model"]
        },
        "google/imagen-4.0-fast": {
            "missing": ["steps", "guidance_scale", "width/height"],
            "accepted": ["aspect_ratio", "output_format", "n", "seed", "negative_prompt", "prompt", "model"]
        },
        "ideogram/ideogram-3.0": {
            "missing": ["steps", "guidance_scale", "width/height"],
            "accepted": ["aspect_ratio", "output_format", "n", "seed", "negative_prompt", "prompt_upsampling", "prompt", "model"]
        },
        "ByteDance-Seed/Seedream-4.0": {
            "missing": ["steps", "guidance_scale", "negative_prompt", "width/height"],
            "accepted": ["aspect_ratio", "output_format", "n", "seed", "prompt_upsampling", "prompt", "model"]
        },
        "black-forest-labs/FLUX.2-flex": {
            "missing": ["guidance_scale", "negative_prompt"],
            "accepted": ["aspect_ratio", "height", "steps", "output_format", "width", "seed", "prompt_upsampling", "prompt", "model"]
        },
        "google/gemini-3-pro-image": {
            "missing": ["steps", "guidance_scale", "negative_prompt", "width/height"],
            "accepted": ["aspect_ratio", "output_format", "seed", "prompt_upsampling", "prompt", "model"]
        },
        "google/imagen-4.0-ultra": {
            "missing": ["steps", "guidance_scale", "width/height"],
            "accepted": ["aspect_ratio", "output_format", "n", "seed", "negative_prompt", "prompt_upsampling", "prompt", "model"]
        },
        "google/flash-image-2.5": {
            "missing": ["steps", "guidance_scale", "width/height"],
            "accepted": ["aspect_ratio", "output_format", "n", "seed", "negative_prompt", "prompt_upsampling", "prompt", "model"]
        },
        "ByteDance-Seed/Seedream-3.0": {
            "missing": ["steps", "negative_prompt", "width/height"],
            "accepted": ["aspect_ratio", "output_format", "n", "guidance_scale", "seed", "prompt_upsampling", "prompt", "model"]
        },
        "Wan-AI/Wan2.6-image": {
            "missing": ["steps", "guidance_scale"],
            "accepted": ["width", "height", "output_format", "n", "seed", "negative_prompt", "prompt_upsampling", "prompt", "model"],
            "overrides": {
                "max_width": 2700,
                "max_height": 2700,
                "min_width": 768,
                "min_height": 768,
                "default_width": 1440,
                "default_height": 1440
            }
        }
    },
    "broken": [
        "black-forest-labs/FLUX.1.1-pro",
        "black-forest-labs/FLUX.1-pro",
        "google/imagen-4.0-preview"
    ]
}

def get_model_constraints(model_id):
    """Return mapped constraints for a Together model."""
    
    # Defaults for full support models
    if model_id in TOGETHER_SPECS["full_support"]:
        return {
            'prompt_limit': 4000,
            'max_width': 1440,
            'max_height': 1440,
            'steps': {'default': 20, 'max': 50},
            'aspect_ratios': [],
            'supports_negative_prompt': True,
            'supports_n': True
        }
    
    # Handle limited models
    if model_id in TOGETHER_SPECS["limited"]:
        spec = TOGETHER_SPECS["limited"][model_id]
        accepted = spec["accepted"]
        overrides = spec.get("overrides", {})
        
        constraints = {
            'prompt_limit': 4000,
            'aspect_ratios': ["1:1", "3:2", "16:9", "21:9", "9:16", "2:3", "4:5"] if "aspect_ratio" in accepted else [],
            'supports_negative_prompt': "negative_prompt" in accepted,
            'supports_n': "n" in accepted
        }
        
        if "width" in accepted:
            constraints['max_width'] = overrides.get('max_width', 1440)
            constraints['max_height'] = overrides.get('max_height', 1440)
            constraints['min_width'] = overrides.get('min_width')
            constraints['min_height'] = overrides.get('min_height')
            constraints['default_width'] = overrides.get('default_width')
            constraints['default_height'] = overrides.get('default_height')
        
        if "steps" in accepted:
            constraints['steps'] = {'default': 20, 'max': 50}
            
        return constraints

    # Generic fallback
    return {
        'prompt_limit': None,
        'max_width': None,
        'max_height': None,
        'steps': None,
        'aspect_ratios': []
    }