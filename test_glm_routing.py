#!/usr/bin/env python3
"""
GLM 4.6 vs 4.7 routing detective script.
Tests whether zai-org-glm-4.6 requests are silently routed to zai-org-glm-4.7.
"""

import httpx
import json
import time

API_KEY = "VENICE-ADMIN-KEY-aScVCNqaqsZ5QZdtvbVzm-yhm6P7D17vqDJrfHQR1A"
BASE_URL = "https://api.venice.ai/api/v1"
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

MODELS = ["zai-org-glm-4.6", "zai-org-glm-4.7"]


def chat(model_id, messages, stream=False, extra_params=None):
    payload = {
        "model": model_id,
        "messages": messages,
        "max_tokens": 300,
        "stream": stream,
        **(extra_params or {}),
    }
    t0 = time.time()
    resp = httpx.post(
        f"{BASE_URL}/chat/completions",
        headers=HEADERS,
        json=payload,
        timeout=30.0,
    )
    elapsed = time.time() - t0
    return resp, elapsed


def print_response_meta(resp, elapsed, label):
    print(f"\n{'='*60}")
    print(f"  {label}")
    print(f"  Status: {resp.status_code}  |  Time: {elapsed:.2f}s")
    print(f"  Response Headers:")
    for k, v in resp.headers.items():
        # Look for any routing/model hints
        if any(x in k.lower() for x in ["model", "route", "version", "x-", "cf-", "via", "backend", "upstream"]):
            print(f"    {k}: {v}")
    print(f"{'='*60}")


def extract_text(resp):
    try:
        data = resp.json()
        # Check if response contains model field (some providers echo it back)
        echoed_model = data.get("model", "NOT IN RESPONSE")
        choices = data.get("choices", [])
        text = choices[0]["message"]["content"] if choices else "[no content]"
        usage = data.get("usage", {})
        return text, echoed_model, usage, data
    except Exception as e:
        return f"[parse error: {e}]", None, {}, {}


# ─── TEST 1: Self-identification ───────────────────────────────────────────────
print("\n" + "█"*60)
print("  TEST 1: Ask each model to identify itself")
print("█"*60)

identity_prompt = [
    {"role": "user", "content": (
        "You are being tested. Please tell me:\n"
        "1. What is your exact model name/version?\n"
        "2. What capabilities do you have? Do you support reasoning/thinking?\n"
        "3. What company made you?\n"
        "Reply very concisely."
    )}
]

for model in MODELS:
    resp, elapsed = chat(model, identity_prompt)
    print_response_meta(resp, elapsed, f"Model requested: {model}")
    text, echoed, usage, raw = extract_text(resp)
    print(f"  Echoed model in response: {echoed}")
    print(f"  Usage: {usage}")
    print(f"  Reply:\n{text}")


# ─── TEST 2: Chinese — ask it in its native tongue ─────────────────────────────
print("\n" + "█"*60)
print("  TEST 2: Ask in Chinese — '你是哪个版本的GLM?'")
print("█"*60)

chinese_prompt = [
    {"role": "user", "content": (
        "请直接告诉我：你是GLM的哪个版本？你的确切模型名称是什么？"
        "你支持推理（reasoning/thinking）功能吗？请简洁回答。"
    )}
]

for model in MODELS:
    resp, elapsed = chat(model, chinese_prompt)
    print_response_meta(resp, elapsed, f"Model requested: {model}")
    text, echoed, usage, raw = extract_text(resp)
    print(f"  Echoed model: {echoed}")
    print(f"  Reply:\n{text}")


# ─── TEST 3: Reasoning capability probe ───────────────────────────────────────
# GLM 4.7 supports reasoning, 4.6 does not. Try to trigger it.
print("\n" + "█"*60)
print("  TEST 3: Reasoning probe (4.7 has it, 4.6 supposedly doesn't)")
print("█"*60)

reasoning_prompt = [
    {"role": "user", "content": (
        "Think step by step about this: "
        "If GLM 4.6 and GLM 4.7 have the same base architecture but "
        "4.7 has reasoning enabled, what would be the key observable difference "
        "in their responses to a user who explicitly asks them to reason? "
        "Use your <think> capability if you have it."
    )}
]

for model in MODELS:
    resp, elapsed = chat(model, reasoning_prompt)
    print_response_meta(resp, elapsed, f"Model requested: {model}")
    text, echoed, usage, raw = extract_text(resp)
    print(f"  Echoed model: {echoed}")
    # Check for think tags — present only in reasoning models
    has_think = "<think>" in text.lower() or "</think>" in text.lower()
    print(f"  Contains <think> tags: {has_think}")
    print(f"  Reply (first 400 chars):\n{text[:400]}")


# ─── TEST 4: Check the /models endpoint for routing hints ─────────────────────
print("\n" + "█"*60)
print("  TEST 4: /models endpoint — check for aliases/routing fields")
print("█"*60)

resp = httpx.get(f"{BASE_URL}/models", headers=HEADERS, timeout=10.0)
print(f"  Status: {resp.status_code}")
try:
    models_data = resp.json()
    for m in models_data.get("data", []):
        if "glm" in m.get("id", "").lower():
            print(f"\n  Model: {m['id']}")
            spec = m.get("model_spec", {})
            # Look for alias/routing fields
            for field in ["alias", "aliases", "routes_to", "deprecated", "offline", "compatibility",
                          "replaced_by", "successor", "redirect", "routing"]:
                if field in spec:
                    print(f"    {field}: {spec[field]}")
                if field in m:
                    print(f"    (top-level) {field}: {m[field]}")
            print(f"    traits: {spec.get('traits', [])}")
            print(f"    offline: {spec.get('offline')}")
            print(f"    capabilities: {spec.get('capabilities', {})}")
            pricing = spec.get("pricing", {})
            print(f"    pricing input: {pricing.get('input', {}).get('usd')} | output: {pricing.get('output', {}).get('usd')}")
            # Dump full spec keys so we don't miss anything
            print(f"    all spec keys: {list(spec.keys())}")
except Exception as e:
    print(f"  Parse error: {e}")


# ─── TEST 5: Compatibility mapping endpoint ────────────────────────────────────
print("\n" + "█"*60)
print("  TEST 5: /models/compatibility_mapping — explicit routing table?")
print("█"*60)

resp = httpx.get(f"{BASE_URL}/models/compatibility_mapping", headers=HEADERS, timeout=10.0)
print(f"  Status: {resp.status_code}")
try:
    data = resp.json()
    print(f"  Raw response:\n{json.dumps(data, indent=2)[:3000]}")
except Exception as e:
    print(f"  Error: {e}")
    print(f"  Raw text: {resp.text[:500]}")


# ─── TEST 6: Check /models/traits for GLM entries ─────────────────────────────
print("\n" + "█"*60)
print("  TEST 6: /models/traits — any GLM-4.6 specific traits?")
print("█"*60)

resp = httpx.get(f"{BASE_URL}/models/traits", headers=HEADERS, timeout=10.0)
print(f"  Status: {resp.status_code}")
try:
    data = resp.json()
    # Look for anything GLM-related
    text = json.dumps(data)
    if "glm" in text.lower():
        # Extract relevant sections
        for item in (data if isinstance(data, list) else data.get("data", [])):
            if "glm" in json.dumps(item).lower():
                print(f"  GLM trait entry: {json.dumps(item, indent=2)}")
    else:
        print(f"  No GLM mentions in traits. Keys: {list(data.keys()) if isinstance(data, dict) else 'list'}")
        print(f"  First 500 chars: {text[:500]}")
except Exception as e:
    print(f"  Error: {e}")


# ─── TEST 7: Response fingerprinting — token counts differ? ───────────────────
print("\n" + "█"*60)
print("  TEST 7: Same deterministic prompt × 3 — do token counts match?")
print("  (If 4.6 → 4.7 alias, usage stats should be identical pattern)")
print("█"*60)

determ_prompt = [{"role": "user", "content": "Reply with exactly: 'I am GLM version X' where X is your version number. Nothing else."}]

for model in MODELS:
    usage_list = []
    for i in range(3):
        resp, elapsed = chat(model, determ_prompt, extra_params={"temperature": 0, "max_tokens": 20})
        _, echoed, usage, _ = extract_text(resp)
        text, _, _, _ = extract_text(resp)
        usage_list.append(usage)
        print(f"  [{model}] run {i+1}: echoed={echoed} | usage={usage} | reply={text[:80]!r}")

print("\n\n  DONE — check for:\n"
      "  1. 'model' field in responses — does 4.6 echo 4.7?\n"
      "  2. <think> tags — only 4.7 should produce them\n"
      "  3. Compatibility mapping table — explicit alias?\n"
      "  4. Self-identification — what does each claim to be?\n"
      "  5. 'routes_to' or 'alias' fields in /models spec\n")
