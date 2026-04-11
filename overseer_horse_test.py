import json
import httpx
import os

with open('app_config.json') as f:
    cfg = json.load(f)
api_key = cfg.get('venice_api_key') or cfg.get('api_key')
VENICE_API_BASE = "https://api.venice.ai/api/v1"

models_to_test = [
    "zai-org-glm-5-1",
    "deepseek-v3.2",
    "llama-3.3-70b"
]

sample_text = """Amy looks at me. "Do you want me to break it?" My mind starts to short-circuit. I actually realize what she's doing."""

rules = ["MANDATE: STRICT PAST TENSE ONLY. REJECT 'looks', 'starts', 'realize'."]

def test_model(model_id):
    print(f"\n--- TESTING MODEL: {model_id} ---")
    prompt = (
        "RETURN ONLY VALID JSON. NO PROSE. NO PREFACE.\n"
        "Rules: " + str(rules) + "\n"
        "TEXT: " + sample_text + "\n"
        "JSON OUTPUT:"
    )
    
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(
                f"{VENICE_API_BASE}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": model_id,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                    "venice_parameters": {"include_venice_system_prompt": False}
                }
            )
            raw = resp.json()['choices'][0]['message'].get('content', '')
            print(f"RAW OUTPUT (first 100 chars): {repr(raw[:100])}")
            is_json = raw.strip().startswith('{')
            print(f"OBEYS JSON MANDATE: {'YES' if is_json else 'NO'}")
            return is_json
    except Exception as e:
        print(f"FAILED: {e}")
        return False

for m in models_to_test:
    test_model(m)
