"""
Test overseer with GLM 4.6 to diagnose empty response issue.
"""
import json
import httpx

with open('app_config.json') as f:
    cfg = json.load(f)
api_key = cfg.get('venice_api_key') or cfg.get('api_key')

VENICE_API_BASE = "https://api.venice.ai/api/v1"

text = """They stopped in front of a plain blue door on a quiet residential street. The energy from their conversation, the frantic, brilliant exchange of ideas, was still humming under Kelly's skin. She was still smiling, a real, unforced smile that made her face feel unfamiliar.

"Well, this is my house," Amy said, gesturing with her thumb. "See you tomorrow?"

The words landed, and the humming stopped. Kelly's smile tightened. Her leg, which had been bouncing with excited energy, went still. Mum. The thought was sharp and sudden. It was late. She would already be questions, about where she'd been, why she was late. Kelly's gaze flickered away from Amy, down the street towards the bus stop, the route home.

"What?" Amy's voice was softer now, questioning. She had seen the shift. "You can come in if you want." She listed the offers like they were nothing, simple, easy things. "Grab a snack, I can do your hair... you can check out my pc...\""""

rules = [
    'ABSOLUTE BANS - Metaphors: "landed," "hit," "cut," "weighed," "stretched," "hung," "fizzled," "drained"',
    'ABSOLUTE BANS - Similes: "like," "as," "with the," "as if"',
    'ABSOLUTE BANS - Abstract forces: "energy," "momentum," "weight," "pull," "anchor," "void"',
    'ABSOLUTE BANS - Personification: emotions/actions given to non-human things',
    'REQUIRED - Concrete physical actions: fingers stop, gaze drops, leg bounces, breath catches',
    'REQUIRED - Sensory specifics: what Kelly sees, hears, feels physically',
    'CLUNKY SENTENCE FIX - REJECT: "What?" Amy\'s voice made her look up. ACCEPT: "What?" Amy was watching her, head tilted.',
]

rules_text = "\n".join(f"RULE {i+1} — {r}" for i, r in enumerate(rules))
prompt = (
    "You are a prose style editor. Read the TEXT below and flag every violation of the listed rules.\n\n"
    f"RULES:\n{rules_text}\n\n"
    "Return ONLY valid JSON with no commentary:\n"
    "{\"violations\": [...]}\n"
    "If there are no violations: {\"violations\": []}\n\n"
    f"TEXT:\n{text}"
)

print("=== SENDING REQUEST ===")
print(f"Model: zai-org-glm-4.6")
print(f"Prompt length: {len(prompt)} chars\n")

with httpx.Client(timeout=60.0) as client:
    resp = client.post(
        f"{VENICE_API_BASE}/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": "zai-org-glm-4.6",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1,
            "max_tokens": 2000,
            "stream": False,
            "venice_parameters": {"include_venice_system_prompt": False}
        }
    )

print(f"=== STATUS: {resp.status_code} ===\n")
body = resp.json()
print("=== FULL RESPONSE BODY ===")
print(json.dumps(body, indent=2))

if resp.status_code == 200:
    msg = body['choices'][0]['message']
    print("\n=== MESSAGE KEYS ===")
    print(list(msg.keys()))
    print("\n=== content field ===")
    print(repr(msg.get('content')))
    for key in msg:
        if key != 'content':
            print(f"\n=== {key} field ===")
            print(repr(str(msg[key])[:500]))
