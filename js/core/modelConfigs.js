export const modelConfigs =
{
  "_meta": {
    "version": "1.0",
    "description": "Single source of truth for all image generation models"
  },
  "providers": {
    "venice": {
      "base_url": "https://api.venice.ai/api/v1",
      "auth_header": "Authorization",
      "auth_prefix": "Bearer",
      "api_key_name": "venice"
    },
    "google": {
      "base_url": "https://generativelanguage.googleapis.com/v1beta/models",
      "auth_header": "x-goog-api-key",
      "auth_prefix": "",
      "api_key_name": "google"
    },
    "zai": {
      "base_url": "https://api.z.ai/api/paas/v4",
      "auth_header": "Authorization",
      "auth_prefix": "Bearer",
      "api_key_name": "zai"
    },
  },
  "models": {
    "glm-image": {
      "provider": "zai",
      "endpoint": "/images/generations",
      "display_name": "GLM-Image",
      "category": "generate",
      "price_per_image": 0.01,
      "params": {
        "prompt": {
          "type": "string",
          "required": true
        },
        "size": {
          "type": "enum",
          "options": [
            "1280x1280",
            "1568x1056",
            "1056x1568",
            "1472x1088",
            "1088x1472",
            "1728x960",
            "960x1728"
          ],
          "default": "1280x1280"
        },
        "quality": {
          "type": "enum",
          "options": ["standard", "hd"],
          "default": "hd"
        }
      },
      "ui_controls": ["dimensions", "quality"]
    },
    "e2ee-gemma-3-27b-p": {
      "provider": "venice",
      "display_name": "Gemma 3 27B (E2EE)",
      "category": "chat",
      "price_per_token": 0.0
    },
    "e2ee-glm-4-7-p": {
      "provider": "venice",
      "display_name": "GLM 4.7 (E2EE)",
      "category": "chat",
      "price_per_token": 0.0
    },
    "e2ee-glm-4-7-flash-p": {
      "provider": "venice",
      "display_name": "GLM 4.7 Flash (E2EE)",
      "category": "chat",
      "price_per_token": 0.0
    },
    "e2ee-gpt-oss-20b-p": {
      "provider": "venice",
      "display_name": "GPT OSS 20B (E2EE)",
      "category": "chat",
      "price_per_token": 0.0
    },
    "e2ee-gpt-oss-120b-p": {
      "provider": "venice",
      "display_name": "GPT OSS 120B (E2EE)",
      "category": "chat",
      "price_per_token": 0.0
    },
    "e2ee-qwen-2-5-7b-p": {
      "provider": "venice",
      "display_name": "Qwen 2.5 7B (E2EE)",
      "category": "chat",
      "price_per_token": 0.0
    },
    "e2ee-qwen3-30b-a3b-p": {
      "provider": "venice",
      "display_name": "Qwen3 30B A3B (E2EE)",
      "category": "chat",
      "price_per_token": 0.0
    },
    "e2ee-qwen3-vl-30b-a3b-p": {
      "provider": "venice",
      "display_name": "Qwen3 VL 30B A3B (E2EE)",
      "category": "chat",
      "price_per_token": 0.0
    },
    "e2ee-glm-5": {
      "provider": "venice",
      "display_name": "GLM 5 (E2EE)",
      "category": "chat",
      "price_per_token": 0.0
    },
    "e2ee-qwen3-5-122b-a10b": {
      "provider": "venice",
      "display_name": "Qwen3.5 122B A10B (E2EE)",
      "category": "chat",
      "price_per_token": 0.0
    },
    "wan-2.6-image-to-video": {
      "provider": "venice",
      "endpoint": "/video/queue",
      "display_name": "Wan 2.6 I2V",
      "category": "image-to-video",
      "supports_reference_images": true,
      "price_per_image": 0.83,
      "params": {
        "prompt": {
          "type": "string",
          "required": true,
          "max_length": 2500
        },
        "image_url": {
          "type": "image",
          "required": true
        },
        "duration": {
          "type": "enum",
          "options": ["5s", "10s", "15s"],
          "default": "5s"
        },
        "resolution": {
          "type": "enum",
          "options": ["720p", "1080p"],
          "default": "720p"
        },
        "negative_prompt": {
          "type": "string",
          "default": "low resolution, error, worst quality, low quality, defects"
        }
      },
      "ui_controls": ["duration", "resolution", "negative_prompt"]
    },
    "qwen-image": {
      "provider": "venice",
      "endpoint": "/image/generate",
      "display_name": "Qwen Image",
      "category": "generate",
      "edit_variant": "qwen-edit",
      "price_per_image": 0.01,
      "params": {
        "prompt": {
          "type": "string",
          "required": true,
          "max_length": 7500
        },
        "width": {
          "type": "int",
          "default": 1024,
          "min": 256,
          "max": 1280
        },
        "height": {
          "type": "int",
          "default": 1024,
          "min": 256,
          "max": 1280
        },
        "seed": {
          "type": "int",
          "min": -999999999,
          "max": 999999999
        },
        "safe_mode": {
          "type": "bool",
          "default": false
        },
        "hide_watermark": {
          "type": "bool",
          "default": false
        }
      },
      "ui_controls": [
        "dimensions",
        "seed"
      ]
    },
    "qwen-image-2-pro": {
      "provider": "venice",
      "endpoint": "/image/generate",
      "display_name": "Qwen Image 2 Pro",
      "category": "generate",
      "edit_variant": "qwen-image-2-pro-edit",
      "price_per_image": 0.10,
      "params": {
        "prompt": {
          "type": "string",
          "required": true,
          "max_length": 7500
        },
        "width": {
          "type": "int",
          "default": 1024,
          "min": 256,
          "max": 1280
        },
        "height": {
          "type": "int",
          "default": 1024,
          "min": 256,
          "max": 1280
        },
        "seed": {
          "type": "int",
          "min": -999999999,
          "max": 999999999
        }
      },
      "ui_controls": [
        "dimensions",
        "seed"
      ]
    },
    "qwen-image-2-pro-edit": {
      "provider": "venice",
      "endpoint": "/image/edit",
      "display_name": "Qwen Image 2 Pro Edit",
      "category": "edit",
      "supports_ai_mask": true,
      "supports_multi_edit": true,
      "price_per_image": 0.10,
      "params": {
        "prompt": {
          "type": "string",
          "required": true,
          "max_length": 7500
        },
        "image": {
          "type": "image",
          "required": true
        },
        "mask": {
          "type": "image"
        }
      },
      "ui_controls": []
    },
    "hunyuan-image-v3": {
      "provider": "venice",
      "endpoint": "/image/generate",
      "display_name": "Hunyuan Image v3",
      "category": "generate",
      "price_per_image": 0.09,
      "params": {
        "prompt": {
          "type": "string",
          "required": true,
          "max_length": 10000
        },
        "aspect_ratio": {
          "type": "enum",
          "options": [
            "1:1",
            "3:2",
            "16:9",
            "21:9",
            "9:16",
            "2:3",
            "3:4",
            "4:5"
          ],
          "default": "1:1"
        },
        "steps": {
          "type": "int",
          "default": 20,
          "max": 50
        },
        "seed": {
          "type": "int",
          "min": -999999999,
          "max": 999999999
        }
      },
      "ui_controls": [
        "aspect_ratio",
        "steps",
        "seed"
      ]
    },
    "nano-banana-pro": {
      "provider": "venice",
      "endpoint": "/image/generate",
      "display_name": "Nano Banana Pro (Venice)",
      "category": "generate",
      "edit_variant": "nano-banana-pro-edit",
      "price_per_image": 0.18,
      "params": {
        "prompt": {
          "type": "string",
          "required": true,
          "max_length": 32768
        },
        "resolution": {
          "type": "enum",
          "options": ["1K", "2K", "4K"],
          "default": "1K"
        },
        "aspect_ratio": {
          "type": "enum",
          "options": [
            "1:1",
            "3:2",
            "16:9",
            "21:9",
            "9:16",
            "2:3",
            "4:5"
          ],
          "default": "1:1"
        },
        "steps": {
          "type": "int",
          "default": 20,
          "max": 50
        }
      },
      "ui_controls": [
        "resolution",
        "aspect_ratio",
        "steps"
      ]
    },
    "nano-banana-pro-edit": {
      "provider": "venice",
      "endpoint": "/image/edit",
      "display_name": "Nano Banana Pro Edit (Venice)",
      "category": "edit",
      "supports_ai_mask": true,
      "supports_multi_edit": true,
      "price_per_image": 0.18,
      "params": {
        "prompt": {
          "type": "string",
          "required": true,
          "max_length": 32768
        },
        "image": {
          "type": "image",
          "required": true
        },
        "mask": {
          "type": "image"
        }
      },
      "ui_controls": []
    },
    "seedream-v5-lite": {
      "provider": "venice",
      "endpoint": "/image/generate",
      "display_name": "Seedream V5 Lite",
      "category": "generate",
      "edit_variant": "seedream-v5-lite-edit",
      "price_per_image": 0.01,
      "params": {
        "prompt": {
          "type": "string",
          "required": true,
          "max_length": 10000
        },
        "aspect_ratio": {
          "type": "enum",
          "options": [
            "1:1",
            "3:2",
            "16:9",
            "21:9",
            "9:16",
            "2:3",
            "3:4",
            "4:5"
          ],
          "default": "1:1"
        },
        "steps": {
          "type": "int",
          "default": 20,
          "max": 50
        },
        "seed": {
          "type": "int",
          "min": -999999999,
          "max": 999999999
        },
        "safe_mode": {
          "type": "bool",
          "default": false
        },
        "format": {
          "type": "enum",
          "options": ["png", "webp", "jpeg"],
          "default": "png"
        }
      },
      "ui_controls": [
        "aspect_ratio",
        "steps",
        "seed",
        "format"
      ]
    },
    "seedream-v5-lite-edit": {
      "provider": "venice",
      "endpoint": "/image/edit",
      "display_name": "Seedream V5 Lite Edit",
      "category": "edit",
      "supports_ai_mask": true,
      "supports_multi_edit": true,
      "price_per_image": 0.04,
      "params": {
        "prompt": {
          "type": "string",
          "required": true,
          "max_length": 32768
        },
        "image": {
          "type": "image",
          "required": true
        },
        "mask": {
          "type": "image"
        }
      },
      "ui_controls": []
    },
    "seedream-v4": {
      "provider": "venice",
      "endpoint": "/image/generate",
      "display_name": "Seedream V4",
      "category": "generate",
      "edit_variant": "seedream-v4-edit",
      "price_per_image": 0.01,
      "params": {
        "prompt": {
          "type": "string",
          "required": true,
          "max_length": 10000
        },
        "aspect_ratio": {
          "type": "enum",
          "options": [
            "1:1",
            "3:2",
            "16:9",
            "21:9",
            "9:16",
            "2:3",
            "3:4",
            "4:5"
          ],
          "default": "1:1"
        },
        "steps": {
          "type": "int",
          "default": 20,
          "max": 50
        },
        "seed": {
          "type": "int",
          "min": -999999999,
          "max": 999999999
        },
        "safe_mode": {
          "type": "bool",
          "default": false
        },
        "format": {
          "type": "enum",
          "options": ["png", "webp", "jpeg"],
          "default": "png"
        }
      },
      "ui_controls": [
        "aspect_ratio",
        "steps",
        "seed",
        "format"
      ]
    },
    "seedream-v4-edit": {
      "provider": "venice",
      "endpoint": "/image/edit",
      "display_name": "Seedream V4 Edit",
      "category": "edit",
      "supports_ai_mask": true,
      "supports_multi_edit": true,
      "price_per_image": 0.04,
      "params": {
        "prompt": {
          "type": "string",
          "required": true,
          "max_length": 32768
        },
        "image": {
          "type": "image",
          "required": true
        },
        "mask": {
          "type": "image"
        }
      },
      "ui_controls": []
    },
    "qwen-edit": {
      "provider": "venice",
      "endpoint": "/image/edit",
      "display_name": "Qwen Edit",
      "category": "edit",
      "supports_ai_mask": true,
      "supports_multi_edit": true,
      "price_per_image": 0.02,
      "params": {
        "prompt": {
          "type": "string",
          "required": true,
          "max_length": 32768
        },
        "image": {
          "type": "image",
          "required": true
        },
        "mask": {
          "type": "image"
        }
      },
      "ui_controls": []
    },
    "firered-image-edit": {
      "provider": "venice",
      "endpoint": "/image/edit",
      "display_name": "FireRed Image Edit",
      "category": "edit",
      "supports_ai_mask": true,
      "supports_multi_edit": false,
      "price_per_image": 0.04,
      "params": {
        "prompt": {
          "type": "string",
          "required": true,
          "max_length": 32768
        },
        "image": {
          "type": "image",
          "required": true
        }
      },
      "ui_controls": []
    },
    "gemini-3-pro-image-preview": {
      "provider": "google",
      "endpoint": "/gemini-3-pro-image-preview:generateContent",
      "display_name": "Nano Banana Pro (Google)",
      "category": "generate",
      "edit_variant": "gemini-3-pro-edit",
      "supports_reference_images": true,
      "price_per_image": 0.02,
      "params": {
        "prompt": {
          "type": "string",
          "required": true
        },
        "aspect_ratio": {
          "type": "enum",
          "options": ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
          "default": "1:1"
        },
        "resolution": {
          "type": "enum",
          "options": ["1K", "2K", "4K"],
          "default": "2K"
        }
      },
      "ui_controls": ["aspect_ratio", "resolution"]
    },
    "gemini-3-pro-edit": {
      "provider": "google",
      "endpoint": "/gemini-3-pro-image-preview:generateContent",
      "display_name": "Nano Banana Pro Edit (Google)",
      "category": "edit",
      "supports_reference_images": true,
      "price_per_image": 0.02,
      "params": {
        "prompt": {
          "type": "string",
          "required": true
        }
      },
      "ui_controls": []
    },
    "nano-banana-pro": {
      "provider": "venice",
      "endpoint": "/image/generate",
      "display_name": "Nano Banana Pro (Venice)",
      "category": "generate",
      "edit_variant": "nano-banana-pro-edit",
      "supports_reference_images": true,
      "price_per_image": 0.02,
      "params": {
        "prompt": {
          "type": "string",
          "required": true
        },
        "aspect_ratio": {
          "type": "enum",
          "options": ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
          "default": "1:1"
        },
        "resolution": {
          "type": "enum",
          "options": ["1K", "2K", "4K"],
          "default": "2K"
        }
      },
      "ui_controls": ["aspect_ratio", "resolution"]
    },
    "nano-banana-pro-edit": {
      "provider": "venice",
      "endpoint": "/image/edit",
      "display_name": "Nano Banana Pro Edit (Venice)",
      "category": "edit",
      "supports_reference_images": true,
      "supports_ai_mask": true,
      "supports_multi_edit": true,
      "price_per_image": 0.18,
      "params": {
        "prompt": {
          "type": "string",
          "required": true
        },
        "image": {
          "type": "image",
          "required": true
        },
        "mask": {
          "type": "image"
        }
      },
      "ui_controls": []
    },
    "lustify-sdxl": {
      "provider": "venice",
      "endpoint": "/image/generate",
      "display_name": "Lustify SDXL",
      "category": "generate",
      "price_per_image": 0.01,
      "params": {
        "prompt": {
          "type": "string",
          "required": true
        },
        "negative_prompt": {
          "type": "string"
        },
        "aspect_ratio": {
          "type": "enum",
          "options": ["1:1", "3:2", "16:9", "2:3", "9:16"],
          "default": "1:1"
        },
        "steps": {
          "type": "int",
          "default": 20,
          "min": 10,
          "max": 50
        },
        "cfg_scale": {
          "type": "float",
          "default": 7.0,
          "min": 1.0,
          "max": 20.0
        },
        "seed": {
          "type": "int",
          "min": -999999999,
          "max": 999999999
        },
        "num_variants": {
          "type": "int",
          "default": 1,
          "min": 1,
          "max": 4
        },
        "safe_mode": {
          "type": "bool",
          "default": false
        }
      },
      "ui_controls": ["aspect_ratio", "steps", "cfg_scale", "seed", "negative_prompt"]
    },
    "wai-Illustrious": {
      "provider": "venice",
      "endpoint": "/image/generate",
      "display_name": "WAI Illustrious",
      "category": "generate",
      "price_per_image": 0.01,
      "params": {
        "prompt": {
          "type": "string",
          "required": true
        },
        "negative_prompt": {
          "type": "string"
        },
        "aspect_ratio": {
          "type": "enum",
          "options": ["1:1", "3:2", "16:9", "2:3", "9:16"],
          "default": "1:1"
        },
        "steps": {
          "type": "int",
          "default": 30,
          "min": 1,
          "max": 30
        },
        "cfg_scale": {
          "type": "float",
          "default": 20.0,
          "min": 0.1,
          "max": 20.0
        },
        "seed": {
          "type": "int",
          "min": -999999999,
          "max": 999999999
        },
        "num_variants": {
          "type": "int",
          "default": 1,
          "min": 1,
          "max": 4
        },
        "safe_mode": {
          "type": "bool",
          "default": false
        }
      },
      "ui_controls": ["aspect_ratio", "steps", "cfg_scale", "seed", "negative_prompt"]
    },
    "bg-remover": {
      "provider": "venice",
      "endpoint": "/image/background-remove",
      "display_name": "Background Remover",
      "category": "background-remove",
      "supports_reference_images": true,
      "price_per_image": 0.01,
      "params": {
        "image": {
          "type": "image",
          "required": true
        }
      },
      "ui_controls": []
    },
    "deepseek-v3.2": {
      "provider": "venice",
      "display_name": "DeepSeek V3.2",
      "category": "chat",
      "price_per_token": 0.0
    },
    "kimi-k2-5": {
      "provider": "venice",
      "display_name": "Kimi K2.5",
      "category": "chat",
      "price_per_token": 0.0
    },
    "zai-org-glm-5": {
      "provider": "venice",
      "display_name": "GLM-5",
      "category": "chat",
      "price_per_token": 0.0
    },
    "venice-uncensored": {
      "provider": "venice",
      "display_name": "Venice Uncensored",
      "category": "chat",
      "price_per_token": 0.0
    },
    "venice-uncensored-role-play": {
      "provider": "venice",
      "display_name": "Venice Uncensored (Roleplay)",
      "category": "chat",
      "price_per_token": 0.0
    }
  }
};
