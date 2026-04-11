import json
import httpx
import os

# Load config
config_path = 'app_config.json'
if not os.path.exists(config_path):
    # Try parent dir
    config_path = '../app_config.json'

with open(config_path) as f:
    cfg = json.load(f)

api_key = cfg.get('venice_api_key') or cfg.get('api_key')
VENICE_API_BASE = "https://api.venice.ai/api/v1"

# The text that likely failed (the mashed potato scene with present tense)
sample_text = """Amy looks at me and asks if I want her to break it. 
My mind starts to short circuit but then stops. I actually realize what she's doing. 
I address Brian, telling him to stop whimpering. I taunt him about his reputation..."""

custom_rules = [
    'MANDATE 1: STRICT PAST TENSE ONLY. REJECT any present tense ("I look", "She says"). ACCEPT only past tense ("I looked", "She said").',
    'MANDATE 2: NO METAPHORS OR SIMILES. REJECT: "like", "as if", "as though".',
    'MANDATE 3: NO LABELS. REJECT clinical or psychological terms: "short-circuit", "social cues", "overload".'
]

builtin_rules = [
    "No isolated single sentences standing alone as their own paragraph",
    "No verbatim echo of the user's input phrasing",
]

all_rules = builtin_rules + custom_rules
rules_text = "\n".join(f"RULE {i+1} — {r}" for i, r in enumerate(all_rules))

# This is the EXACT prompt from chat.py after my hardening
overseer_prompt = (
    "### NUCLEAR MANDATE: RETURN ONLY VALID JSON. NO PROSE. NO ANALYSIS.\n"
    "You are a silent JSON validator. Read the TEXT and flag every violation of the rules.\n\n"
    f"RULES:\n{rules_text}\n\n"
    "For each violation return an object:\n"
    "  {\"rule\": N, \"scope\": \"local\", \"excerpt\": \"exact offending text\", \"replacement\": \"corrected version\", \"suggestion\": \"one-line description\"}\n"
    "Return ONLY valid JSON:\n"
    "{\"violations\": [...]}\n\n"
    "### CRITICAL BANS:\n"
    "- DO NOT explain your process.\n"
    "- DO NOT say 'Let me analyze' or 'I found'.\n"
    "- DO NOT provide a list of rule checks.\n"
    "- If there are no violations, return exactly: {\"violations\": []}\n\n"
    f"TEXT:\n{sample_text}"
)

print("--- SENDING DIAGNOSTIC REQUEST ---")
print(f"Model: grok-4-20-beta")

try:
    with httpx.Client(timeout=60.0) as client:
        resp = client.post(
            f"{VENICE_API_BASE}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "grok-4-20-beta",
                "messages": [{"role": "user", "content": overseer_prompt}],
                "temperature": 0.1,
                "max_tokens": 2000,
                "stream": False,
                "venice_parameters": {
                    "include_venice_system_prompt": False,
                    "strip_thinking_response": True
                }
            }
        )
        
        print(f"Status Code: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            raw_content = data['choices'][0]['message'].get('content', '')
            print("\n--- RAW LLM OUTPUT START ---")
            print(raw_content)
            print("--- RAW LLM OUTPUT END ---\n")
            
            # Try to parse it manually to see where it fails
            try:
                parsed = json.loads(raw_content)
                print("JSON Parsing: SUCCESS")
                print(f"Violations found: {len(parsed.get('violations', []))}")
            except Exception as e:
                print(f"JSON Parsing: FAILED - {e}")
        else:
            print(f"Error Response: {resp.text}")

except Exception as e:
    print(f"Diagnostic failed: {e}")
