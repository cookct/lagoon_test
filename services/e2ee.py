"""Venice E2EE — ECDH/HKDF/AES-GCM client-side encryption.

Implements the full Venice E2EE protocol per docs:
  - secp256k1 ECDH key exchange
  - HKDF-SHA256 key derivation (info=b'ecdsa_encryption')
  - AES-256-GCM symmetric encryption
  - TEE attestation verification (verified, nonce, debug mode)
"""
import os, secrets, logging
import httpx
from cryptography.hazmat.primitives.asymmetric.ec import (
    generate_private_key, SECP256K1, ECDH, EllipticCurvePublicNumbers
)
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

logger = logging.getLogger(__name__)
HKDF_INFO = b'ecdsa_encryption'

# Cache attestation results per model — attestations are valid for hours
# (leaf cert typically expires ~24h). Cache for 30 minutes to stay fresh.
import time
_attestation_cache: dict = {}  # model_id -> (signing_key, timestamp)
_ATTESTATION_TTL = 1800  # 30 minutes


def generate_session_keypair():
    """Generate ephemeral secp256k1 session keypair.
    Returns (private_key_obj, public_key_uncompressed_hex).
    Public key is validated: 130 hex chars starting with '04'.
    """
    priv = generate_private_key(SECP256K1())
    pub_bytes = priv.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    pub_hex = pub_bytes.hex()
    # Validate per Venice docs: must be 130 hex chars starting with '04'
    if len(pub_hex) != 130 or not pub_hex.startswith('04'):
        raise ValueError(f"Client pubkey validation failed: {len(pub_hex)} chars, prefix={pub_hex[:2]}")
    return priv, pub_hex


def _check_debug_mode(data):
    """Reject debug enclaves per Venice E2EE security requirements."""
    # Top-level debug flag
    if data.get('debug') is True:
        raise ValueError("TEE is in debug mode — refusing E2EE")

    # Intel TDX debug bit: bit 0 of tdAttributes first byte
    # tdAttributes may be nested under 'intel' or at top level
    intel = data.get('intel') or data.get('attestation', {}).get('intel', {}) or {}
    td_attrs = intel.get('tdAttributes') or data.get('tdAttributes')
    if td_attrs:
        try:
            first_byte = int(td_attrs[:2], 16)
            if first_byte & 0x01:
                raise ValueError("TDX debug mode detected — refusing E2EE")
        except (ValueError, IndexError):
            pass


def fetch_attestation(model_id, api_key, venice_base):
    """Fetch + verify TEE attestation. Returns model public key hex.
    Results are cached per model for 30 minutes.
    """
    cached = _attestation_cache.get(model_id)
    if cached and (time.time() - cached[1]) < _ATTESTATION_TTL:
        logger.info(f"[E2EE] Using cached attestation for {model_id}")
        return cached[0]

    nonce = secrets.token_hex(32)  # 32 bytes = 64 hex chars (required)
    resp = httpx.get(
        f'{venice_base}/tee/attestation',
        params={'model': model_id, 'nonce': nonce},
        headers={'Authorization': f'Bearer {api_key}'},
        timeout=60.0
    )
    resp.raise_for_status()
    data = resp.json()

    if data.get('verified') is not True:
        raise ValueError(f"Attestation failed: {data.get('error', data)}")
    if data.get('nonce') != nonce:
        raise ValueError("Attestation nonce mismatch — possible replay attack")

    _check_debug_mode(data)

    key = data.get('signing_key') or data.get('signing_public_key')
    if not key:
        raise ValueError("No signing key in attestation response")

    logger.info(f"[E2EE] signing_key ({len(key)} chars): {key}")
    _attestation_cache[model_id] = (key, time.time())
    return key


def _parse_pub(hex_key):
    if not hex_key.startswith('04') and len(hex_key) == 128:
        hex_key = '04' + hex_key
    b = bytes.fromhex(hex_key)
    x, y = int.from_bytes(b[1:33], 'big'), int.from_bytes(b[33:65], 'big')
    return EllipticCurvePublicNumbers(x, y, SECP256K1()).public_key()


def _derive_key(shared_secret):
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=HKDF_INFO).derive(shared_secret)


def encrypt_message(plaintext, model_pub_hex):
    """Encrypt a single plaintext string. Returns hex-encoded ciphertext.
    Format: ephemeral_pub(65 bytes) + nonce(12 bytes) + ciphertext
    """
    model_pub = _parse_pub(model_pub_hex)
    ephemeral_priv = generate_private_key(SECP256K1())
    shared = ephemeral_priv.exchange(ECDH(), model_pub)
    aes_key = _derive_key(shared)
    nonce = os.urandom(12)
    ciphertext = AESGCM(aes_key).encrypt(nonce, plaintext.encode(), None)
    eph_pub = ephemeral_priv.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return (eph_pub + nonce + ciphertext).hex()


def encrypt_messages(messages, model_pub_hex):
    """Encrypt all user/system messages. File uploads not supported in E2EE —
    list-content messages have image parts dropped, text parts flattened and encrypted.
    """
    out = []
    for msg in messages:
        role = msg.get('role')
        content = msg.get('content') or ''  # None-safe: null key returns None, not default
        if isinstance(content, list):
            # File uploads not supported — extract text parts only
            content = ' '.join(
                p.get('text', '') for p in content
                if isinstance(p, dict) and p.get('type') == 'text'
            )
        elif not isinstance(content, str):
            logger.warning(f"[E2EE] Unexpected content type {type(content).__name__} for role={role}, coercing to str")
            content = str(content)
        out.append({**msg, 'content': encrypt_message(content, model_pub_hex)})
    return out


def is_hex_encrypted(s):
    """Minimum: ephemeral_pub(65) + nonce(12) + tag(16) = 93 bytes = 186 hex chars."""
    return len(s) >= 186 and all(c in '0123456789abcdefABCDEF' for c in s)


def decrypt_chunk(hex_chunk, session_priv):
    """Decrypt a response chunk using the session private key."""
    raw = bytes.fromhex(hex_chunk)
    server_eph_pub = _parse_pub(raw[:65].hex())
    nonce = raw[65:77]
    ciphertext = raw[77:]
    shared = session_priv.exchange(ECDH(), server_eph_pub)
    aes_key = _derive_key(shared)
    return AESGCM(aes_key).decrypt(nonce, ciphertext, None).decode()
