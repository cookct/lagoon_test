#!/usr/bin/env python3
"""
Standalone E2EE chat test for e2ee-venice-uncensored-24b-p.
No local imports. All crypto inline per Venice E2EE docs.
"""
import sys, json, os, secrets
import httpx
from cryptography.hazmat.primitives.asymmetric.ec import (
    generate_private_key, SECP256K1, ECDH, EllipticCurvePublicNumbers
)
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

MODEL = "e2ee-glm-5-1"
VENICE_BASE = "https://api.venice.ai/api/v1"
TEST_PROMPT = "What is 2+2? One word answer only."
HKDF_INFO = b'ecdsa_encryption'


def load_key():
    with open("app_config.json") as f:
        key = json.load(f).get("venice_api_key")
    if not key:
        sys.exit("No venice_api_key in app_config.json")
    return key


def gen_keypair():
    priv = generate_private_key(SECP256K1())
    pub_hex = priv.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    ).hex()
    return priv, pub_hex


def parse_pub(hex_key):
    if not hex_key.startswith('04') and len(hex_key) == 128:
        hex_key = '04' + hex_key
    b = bytes.fromhex(hex_key)
    x = int.from_bytes(b[1:33], 'big')
    y = int.from_bytes(b[33:65], 'big')
    return EllipticCurvePublicNumbers(x, y, SECP256K1()).public_key()


def derive_key(shared_secret):
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=HKDF_INFO).derive(shared_secret)


def encrypt(plaintext, model_pub_hex):
    model_pub = parse_pub(model_pub_hex)
    eph_priv = generate_private_key(SECP256K1())
    shared = eph_priv.exchange(ECDH(), model_pub)
    aes_key = derive_key(shared)
    nonce = os.urandom(12)
    ct = AESGCM(aes_key).encrypt(nonce, plaintext.encode(), None)
    eph_pub = eph_priv.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return (eph_pub + nonce + ct).hex()


def decrypt(hex_chunk, session_priv):
    raw = bytes.fromhex(hex_chunk)
    server_eph_pub = parse_pub(raw[:65].hex())
    nonce = raw[65:77]
    ct = raw[77:]
    shared = session_priv.exchange(ECDH(), server_eph_pub)
    aes_key = derive_key(shared)
    return AESGCM(aes_key).decrypt(nonce, ct, None).decode()


def is_encrypted(s):
    return len(s) >= 186 and all(c in '0123456789abcdefABCDEF' for c in s)


def main():
    api_key = load_key()

    # Step 1: Attestation
    print(f"\n[1] Attestation — {MODEL}")
    nonce = secrets.token_hex(32)
    r = httpx.get(f"{VENICE_BASE}/tee/attestation",
                  params={"model": MODEL, "nonce": nonce},
                  headers={"Authorization": f"Bearer {api_key}"}, timeout=60)
    r.raise_for_status()
    att = r.json()

    verified    = att.get("verified")
    nonce_ok    = att.get("nonce") == nonce
    signing_key = att.get("signing_key") or att.get("signing_public_key")
    debug_mode  = att.get("debug", False)

    print(f"  verified    : {verified}")
    print(f"  nonce_match : {nonce_ok}")
    print(f"  debug_mode  : {debug_mode}")
    print(f"  tee_provider: {att.get('tee_provider', 'n/a')}")
    print(f"  signing_key : {'present (' + str(len(signing_key)) + ' chars)' if signing_key else 'MISSING'}")
    if att.get("error"):
        print(f"  error       : {att['error']}")

    if not verified:
        sys.exit("FAIL: attestation not verified")
    if not nonce_ok:
        sys.exit("FAIL: nonce mismatch")
    if debug_mode:
        sys.exit("FAIL: debug enclave — refusing E2EE")
    if not signing_key:
        print("\nFAIL: no signing_key — TEE attestation passes but E2EE key exchange is impossible")
        print("      This model is TEE-resident but not E2EE-capable.")
        sys.exit(1)

    print("  attestation OK")

    # Step 2: Session keypair
    print(f"\n[2] Generating session keypair")
    session_priv, session_pub_hex = gen_keypair()
    print(f"  client pub  : {session_pub_hex[:20]}...{session_pub_hex[-10:]}")
    assert len(session_pub_hex) == 130 and session_pub_hex.startswith('04')

    # Step 3: Encrypt
    print(f"\n[3] Encrypting: \"{TEST_PROMPT}\"")
    enc = encrypt(TEST_PROMPT, signing_key)
    print(f"  length      : {len(enc)} hex chars")
    print(f"  valid format: {is_encrypted(enc)}")

    # Step 4: Send
    print(f"\n[4] Sending E2EE request")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "X-Venice-TEE-Client-Pub-Key": session_pub_hex,
        "X-Venice-TEE-Model-Pub-Key": signing_key,
        "X-Venice-TEE-Signing-Algo": "ecdsa",
    }
    body = {
        "model": MODEL,
        "messages": [{"role": "user", "content": enc}],
        "stream": True,
        "max_tokens": 64,
    }

    full = ""
    enc_chunks = plain_chunks = 0

    with httpx.Client(timeout=httpx.Timeout(connect=30, read=120, write=30, pool=30)) as client:
        with client.stream("POST", f"{VENICE_BASE}/chat/completions",
                           headers=headers, json=body) as resp:
            print(f"  HTTP        : {resp.status_code}")
            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line.startswith("data: "):
                    continue
                payload = line[6:].strip()
                if payload == "[DONE]":
                    break
                try:
                    chunk = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                choices = chunk.get("choices") or []
                if not choices:
                    continue
                content = choices[0].get("delta", {}).get("content")
                if not content:
                    continue
                if is_encrypted(content):
                    enc_chunks += 1
                    try:
                        full += decrypt(content, session_priv)
                    except Exception as e:
                        print(f"\n  FAIL: decrypt error: {e}")
                        sys.exit(1)
                else:
                    plain_chunks += 1
                    full += content

    # Step 5: Results
    print(f"\n[5] Results")
    print(f"  encrypted chunks : {enc_chunks}")
    print(f"  plaintext chunks : {plain_chunks}{'  <-- BAD' if plain_chunks else ''}")
    print(f"  decrypted reply  : \"{full.strip()}\"")

    if enc_chunks > 0 and plain_chunks == 0:
        print("\nPASS: E2EE fully working end-to-end")
    elif plain_chunks > 0 and enc_chunks == 0:
        print("\nFAIL: model replied in plaintext — response not encrypted")
    else:
        print("\nMIXED: some chunks encrypted, some plain")


if __name__ == "__main__":
    main()
