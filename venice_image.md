# Venice AI Image Generation

Source: https://docs.venice.ai/overview/guides/image-generation

## Overview

Venice offers synchronous image generation through native and OpenAI-compatible endpoints. Requests to `/image/generate` return images as base64 JSON or raw binary in the same response.

## Primary Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /image/generate` | Native Venice API with full feature support |
| `GET /image/styles` | Retrieve available style presets |
| `POST /images/generations` | OpenAI-compatible alternative |

## Key Request Parameters

Essential fields: `model` and `prompt`

| Parameter | Description |
|-----------|-------------|
| `model` | The image model to use (required) |
| `prompt` | Text description of the image to generate (required) |
| `format` | Output format: `jpeg`, `png`, `webp` (default: `webp`) |
| `width` | Image width in pixels (default: 1024) |
| `height` | Image height in pixels (default: 1024) |
| `negative_prompt` | Content to exclude from the generated image |
| `seed` | Seed value for reproducible results |
| `cfg_scale` | Classifier-free guidance scale |
| `variants` | Number of image variants to generate (1–4) |
| `return_binary` | If `true`, returns raw image bytes instead of base64 JSON |
| `safe_mode` | If enabled, blurs adult content |
| `style_preset` | Apply a style preset (retrieve options from `GET /image/styles`) |
| `aspect_ratio` | Aspect ratio string (e.g. `"16:9"`) — model-dependent |
| `resolution` | Resolution string (e.g. `"2K"`) — model-dependent |
| `enable_web_search` | Enable web search to inform image generation |

## Implementation Workflow

1. **POST** to `/image/generate` with `model`, `prompt`, and desired parameters
2. **Decode** base64 image data from the response, or use `return_binary: true` for direct file output
3. **Extract** timing metrics from the response object

## Model-Specific Considerations

Some models support `aspect_ratio` and `resolution` (e.g., `"16:9"`, `"2K"`) instead of pixel `width`/`height`. Check the Image Models documentation for capability details and pricing.

## Error Handling

| Status Code | Meaning |
|-------------|---------|
| `400` | Parameter validation failed |
| `401` | Authentication or tier access issues |
| `402` | Insufficient account credits |
| `429` | Rate limiting — check `Retry-After` header |
| `503` | Model capacity reached |

## Prompting Best Practices

Structure prompts as:

```
subject → medium → lighting → composition → mood
```

- Reserve negative details for `negative_prompt`
- Use `seed` for consistent iterations during refinement

---

# Venice AI Image Editing

Source: https://docs.venice.ai/overview/guides/image-editing

## Overview

Venice's image editing provides synchronous APIs for modifying images. Users submit source images and receive edited PNGs in the same response. The service supports editing, inpainting, compositing, and background removal.

## Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /image/edit` | Single-image modification with text prompts (general edits and inpainting) |
| `POST /image/multi-edit` | Accepts 1–3 layered images for controlled edits using masks or overlays |
| `POST /image/background-remove` | Produces transparent PNGs by isolating foreground subjects |

## `/image/edit`

Accepts images as files, base64-encoded strings, or URLs, paired with editing instructions.

**Constraints:**
- Image size: 65,536 – 33,177,600 pixels
- Upload limit: 25MB max

## `/image/multi-edit`

The first image serves as the base layer; subsequent images function as masks or edit layers.

- Accepts 1–3 layered images
- Uses `modelId` parameter instead of `model`

## `/image/background-remove`

Isolates the foreground subject and returns a transparent PNG.

**Input options:**
- `image` — file or base64-encoded string
- `image_url` — publicly accessible URL

## Pricing & Models

| Model | Cost |
|-------|------|
| `qwen-edit` (default) | $0.04 per edit |

Other edit-capable models can be discovered via the Models API filtered by `type=inpaint`.

## Prompting Best Practices

- Keep prompts concise and location-specific (e.g., `"remove the tree"`, `"change sky to sunset"`)
- For broader modifications, specify what should remain unchanged
- If results target incorrect areas, switch to `/image/multi-edit` with explicit masks for improved precision

## Error Handling

| Status Code | Meaning |
|-------------|---------|
| `402` | Insufficient API balance |
| `429` | Rate limiting — check `Retry-After` header |
| `503` | Model capacity constraints |

Images
Multi-Edit Image
Edit or modify an image using up to three layered inputs (base image plus masks/overlays).

Supported input formats by Content-Type:

multipart/form-data: Only file uploads are supported. Send images as form file fields.

application/json: Base64 strings and URLs are supported:

Raw base64 string: "iVBORw0KGgoAAAANSUhEUgAA..."
Data URL: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
HTTP/HTTPS URL: "https://example.com/image.png"
Authentication: This endpoint accepts either a Bearer API key or an X-Sign-In-With-X header for x402 wallet-based authentication. When using x402, a 402 Payment Required response indicates insufficient balance and includes top-up instructions.

POST
/
image
/
multi-edit

Try it
Pricing: Multi-edit pricing varies by model. See the Pricing overview for current per-edit prices.
Authorizations

BearerAuth
BearerAuth
​
Authorization
stringheaderrequired
Bearer authentication header of the form Bearer <token>, where <token> is your auth token.

Body

application/json
application/json
Edit an image by compositing up to three layered images with a single prompt. Supports base64-encoded strings and URLs.

​
prompt
stringrequired
The text directions to edit or modify the image. Short, descriptive prompts work best (e.g., "remove the tree", "change the sky to sunrise"). Character limit is model specific and is listed in the promptCharacterLimit setting in the model list endpoint.

Required string length: 1 - 32768
​
images
(string<uri> | string)[]required
Array of 1 to 3 images used for multi-editing. The first image is treated as the base image, and the remaining images are used as edit layers/masks. Each image can be a base64-encoded string or a URL starting with http:// or https://. Image dimensions must be at least 65536 pixels and must not exceed 33177600 pixels. File size must be less than 25MB.

Required array length: 1 - 3 elements
Image as a base64-encoded string or a URL starting with http:// or https://

​
modelId
enum<string>default:qwen-edit
The model ID to use for multi-edit.

Available options: qwen-edit, grok-imagine-edit, qwen-image-2-edit, qwen-image-2-pro-edit, wan-2-7-pro-edit, flux-2-max-edit, gpt-image-2-edit, gpt-image-1-5-edit, nano-banana-2-edit, nano-banana-pro-edit, seedream-v5-lite-edit, seedream-v4-edit 
Minimum string length: 1
​
safe_mode
booleandefault:true
Whether to use safe mode. If enabled, this will blur images that are classified as having adult content.

Example:
false

Response

200

image/png
OK

The response is of type file.

example:

import requests

url = "https://api.venice.ai/api/v1/image/multi-edit"

payload = {
    "prompt": "<string>",
    "images": ["<string>"],
    "modelId": "grok-imagine-edit",
    "safe_mode": False
}
headers = {
    "Authorization": "Bearer <token>",
    "Content-Type": "application/json"
}

response = requests.post(url, json=payload, headers=headers)

print(response.text)
