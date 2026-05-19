#!/usr/bin/env python3
"""Test E2EE attestation for specific models against Venice's TEE endpoint."""
import json, secrets, sys
import httpx

APP_CONFIG = "app_config.json"
VENICE_BASE = "https://api.venice.ai/api/v1"
MODELS = [
    "e2ee-gemma-3-27b-p",
    "e2ee-venice-uncensored-24b-p",
    "e2ee-glm-4-7-p",        # control — should work
    "e2ee-qwen3-5-122b-a10b", # control
]

def get_key():
    with open(APP_CONFIG) as f:
        key = json.load(f).get("venice_api_key")
    if not key:
        sys.exit("No venice_api_key in app_config.json")
    return key

def check_model_list(api_key):
    print("\n── Venice /models supportsE2EE ──────────────────────")
    resp = httpx.get(f"{VENICE_BASE}/models", params={"type": "text"},
                     headers={"Authorization": f"Bearer {api_key}"}, timeout=15)
    resp.raise_for_status()
    for m in resp.json().get("data", []):
        if m["id"] in MODELS:
            caps = m.get("model_spec", {}).get("capabilities", {})
            e2ee = caps.get("supportsE2EE", m.get("supportsE2EE", "NOT FOUND"))
            print(f"  {m['id']:<40} supportsE2EE={e2ee}")

def check_attestation(model_id, api_key):
    nonce = secrets.token_hex(32)
    try:
        resp = httpx.get(
            f"{VENICE_BASE}/tee/attestation",
            params={"model": model_id, "nonce": nonce},
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=15,
        )
        data = resp.json()
        verified  = data.get("verified")
        nonce_ok  = data.get("nonce") == nonce
        has_key   = bool(data.get("signing_key") or data.get("signing_public_key"))
        status    = "OK" if (verified and nonce_ok and has_key) else "FAIL"
        print(f"  [{status}] {model_id}")
        print(f"         verified={verified}  nonce_match={nonce_ok}  has_signing_key={has_key}")
        if not has_key:
            print(f"         raw keys present: {[k for k in data if 'key' in k.lower()]}")
        if data.get("error"):
            print(f"         error: {data['error']}")
    except Exception as e:
        print(f"  [ERR] {model_id}: {e}")

def main():
    key = get_key()
    check_model_list(key)
    print("\n── Attestation probe ────────────────────────────────")
    for m in MODELS:
        check_attestation(m, key)

if __name__ == "__main__":
    main()
