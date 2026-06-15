"""
Cifragem da seed DePix non-custodial (ADR 0051).

Funcoes PURAS (sem I/O, sem efeito colateral) para cifrar/decifrar o mnemonico
de 24 palavras com uma passphrase que SO o usuario sabe. O servidor guarda
apenas o blob versionado resultante (em `tenant_depix_wallets.encrypted_seed`);
sem a passphrase, o blob e inutil.

Esquema:
  - KDF:     Argon2id (memory-hard, resistente a GPU/ASIC) deriva uma chave de
             32 bytes a partir da passphrase + salt aleatorio por carteira.
  - Cipher:  AES-256-GCM (IV 12B aleatorio, auth tag 16B) — autenticado, entao
             passphrase errada falha na verificacao do tag (nao decifra lixo).

O blob e autodescritivo e versionado (campo `v` + `kdfParams`) para permitir
rotacao de parametros sem migracao cega. Formato no ADR 0051.

NUNCA logar passphrase nem mnemonico. Estas funcoes nao logam nada.
"""

from __future__ import annotations

import os
import json
import base64
from datetime import datetime, timezone

from argon2.low_level import hash_secret_raw, Type
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


# Versao do esquema de blob. Bump quando mudar formato/algoritmo.
BLOB_VERSION = 1

# Parametros Argon2id — perfil INTERACTIVE (ADR 0051 decisao 4).
# Vao DENTRO do blob (kdfParams) para permitir rotacao; estes sao os defaults
# de criacao de novos blobs.
ARGON2_MEMORY_KIB = 262144   # 256 MiB
ARGON2_TIME_COST = 3
ARGON2_PARALLELISM = 2
ARGON2_HASH_LEN = 32         # 32 bytes -> chave AES-256

SALT_LEN = 16
IV_LEN = 12


def _b64e(raw: bytes) -> str:
    return base64.b64encode(raw).decode("ascii")


def _b64d(s: str) -> bytes:
    return base64.b64decode(s.encode("ascii"))


def _derive_key(passphrase: str, salt: bytes, params: dict) -> bytes:
    """Deriva a chave AES-256 (32B) da passphrase via Argon2id."""
    return hash_secret_raw(
        secret=passphrase.encode("utf-8"),
        salt=salt,
        time_cost=int(params["t"]),
        memory_cost=int(params["m"]),
        parallelism=int(params["p"]),
        hash_len=ARGON2_HASH_LEN,
        type=Type.ID,
    )


def encrypt_seed(mnemonic: str, passphrase: str) -> dict:
    """
    Cifra o mnemonico com a passphrase. Retorna o blob (dict serializavel em
    JSON). Salt e IV sao aleatorios a cada chamada (dois blobs do mesmo
    mnemonico+passphrase diferem).

    Levanta ValueError se mnemonic/passphrase vazios.
    """
    if not mnemonic or not mnemonic.strip():
        raise ValueError("mnemonic vazio")
    if not passphrase:
        raise ValueError("passphrase vazia")

    params = {"m": ARGON2_MEMORY_KIB, "t": ARGON2_TIME_COST, "p": ARGON2_PARALLELISM}
    salt = os.urandom(SALT_LEN)
    iv = os.urandom(IV_LEN)
    key = _derive_key(passphrase, salt, params)

    aes = AESGCM(key)
    # AESGCM.encrypt retorna ciphertext || tag concatenados; separamos o tag
    # (ultimos 16B) para deixar o blob explicito e auditavel.
    ct_and_tag = aes.encrypt(iv, mnemonic.encode("utf-8"), None)
    ciphertext, auth_tag = ct_and_tag[:-16], ct_and_tag[-16:]

    now = datetime.now(timezone.utc).isoformat()
    return {
        "v": BLOB_VERSION,
        "kdf": "argon2id",
        "kdfParams": params,
        "kdfSalt": _b64e(salt),
        "cipher": "aes-256-gcm",
        "iv": _b64e(iv),
        "authTag": _b64e(auth_tag),
        "ciphertext": _b64e(ciphertext),
        "createdAt": now,
        "rewrappedAt": now,
    }


def decrypt_seed(blob: dict, passphrase: str) -> str:
    """
    Decifra o blob com a passphrase, devolvendo o mnemonico.

    Levanta:
      - ValueError se o blob estiver malformado ou em versao desconhecida.
      - InvalidPassphraseError se a passphrase estiver errada (tag GCM nao
        verifica). NAO distinguir de blob corrompido para o caller — ambos =
        "nao consegue decifrar".
    """
    if not isinstance(blob, dict):
        raise ValueError("blob invalido")
    if blob.get("v") != BLOB_VERSION:
        raise ValueError(f"versao de blob nao suportada: {blob.get('v')}")
    if blob.get("kdf") != "argon2id" or blob.get("cipher") != "aes-256-gcm":
        raise ValueError("algoritmo de blob nao suportado")
    if not passphrase:
        raise InvalidPassphraseError("passphrase vazia")

    try:
        params = blob["kdfParams"]
        salt = _b64d(blob["kdfSalt"])
        iv = _b64d(blob["iv"])
        auth_tag = _b64d(blob["authTag"])
        ciphertext = _b64d(blob["ciphertext"])
    except (KeyError, ValueError, TypeError) as exc:
        raise ValueError("blob malformado") from exc

    key = _derive_key(passphrase, salt, params)
    aes = AESGCM(key)
    try:
        plaintext = aes.decrypt(iv, ciphertext + auth_tag, None)
    except Exception as exc:
        # InvalidTag (passphrase errada ou blob adulterado) cai aqui.
        raise InvalidPassphraseError("passphrase incorreta ou blob invalido") from exc
    return plaintext.decode("utf-8")


def rewrap_seed(blob: dict, old_passphrase: str, new_passphrase: str) -> dict:
    """Troca a passphrase: decifra com a antiga, recifra com a nova (novo salt/iv)."""
    mnemonic = decrypt_seed(blob, old_passphrase)
    new_blob = encrypt_seed(mnemonic, new_passphrase)
    # Preserva createdAt original; marca rewrappedAt agora.
    new_blob["createdAt"] = blob.get("createdAt", new_blob["createdAt"])
    new_blob["rewrappedAt"] = datetime.now(timezone.utc).isoformat()
    return new_blob


class InvalidPassphraseError(Exception):
    """Passphrase errada (ou blob adulterado). Mensagem generica de proposito."""
