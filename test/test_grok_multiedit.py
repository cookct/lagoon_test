import base64
import json
import os
import requests

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(SCRIPT_DIR, "..", "app_config.json")

with open(CONFIG_FILE) as f:
    api_key = json.load(f)["venice_api_key"]


def encode(path):
    with open(path, "rb") as f:
        data = base64.b64encode(f.read()).decode("utf-8")
    ext = os.path.splitext(path)[1].lstrip(".")
    mime = "jpeg" if ext in ("jpg", "jpeg") else ext
    return f"data:image/{mime};base64,{data}"


target_b64    = encode(os.path.join(SCRIPT_DIR, "target.png"))
reference_b64 = encode(os.path.join(SCRIPT_DIR, "reference.png"))

payload = {
    "modelId": "grok-imagine-edit",
    "prompt": "Redraw the character from the first image in the pose shown in the second image.",
    "images": [target_b64, reference_b64],
    "safe_mode": False,
}

headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
}

print("Sending request to Venice multi-edit...")
resp = requests.post(
    "https://api.venice.ai/api/v1/image/multi-edit",
    json=payload,
    headers=headers,
    timeout=300,
)

if resp.status_code != 200:
    print(f"Error {resp.status_code}: {resp.text}")
    exit(1)

data = resp.json()
images = data.get("images", [])
if not images:
    print(f"No images in response: {data}")
    exit(1)

raw = images[0]
if raw.startswith("data:"):
    header, b64 = raw.split(",", 1)
    ext = header.split("/")[1].split(";")[0]
else:
    b64 = raw
    ext = "png"

out_path = os.path.join(SCRIPT_DIR, f"result.{ext}")
with open(out_path, "wb") as f:
    f.write(base64.b64decode(b64))

print(f"Saved: {out_path}")
if "_balance" in data:
    print(f"Balance: ${data['_balance']}")
