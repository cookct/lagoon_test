import requests
import base64
import os
import json

def encode_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

url = "https://api.venice.ai/api/v1/image/multi-edit"
api_key = "VENICE-ADMIN-KEY-aScVCNqaqsZ5QZdtvbVzm-yhm6P7D17vqDJrfHQR1A"

img1_path = "lagoon_test/test/1.png"
img2_path = "lagoon_test/test/2.webp"

img1_base64 = f"data:image/png;base64,{encode_image(img1_path)}"
img2_base64 = f"data:image/webp;base64,{encode_image(img2_path)}"

payload = {
    "prompt": "use the hairstyle from image1 and apply it to image2",
    "images": [img1_base64, img2_base64],
    "modelId": "nano-banana-pro-edit",
    "safe_mode": False
}
headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}

print(f"Sending request to Venice Multi-Edit with {img1_path} and {img2_path}...")
response = requests.post(url, json=payload, headers=headers)

if response.status_code == 200:
    output_path = "lagoon_test/test/result.png"
    with open(output_path, "wb") as f:
        f.write(response.content)
    print(f"Success! Result saved to {output_path}")
else:
    print(f"Error: {response.status_code}")
    print(response.text)
