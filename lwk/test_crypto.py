"""
Testes do helper de cifragem da seed non-custodial (ADR 0051).

Rodar: `python -m pytest lwk/test_crypto.py` ou `python -m unittest lwk.test_crypto`.
Usa parametros Argon2 REDUZIDOS via monkeypatch para nao gastar 256MiB/teste.
"""

import unittest

import crypto
from crypto import (
    encrypt_seed,
    decrypt_seed,
    rewrap_seed,
    InvalidPassphraseError,
    BLOB_VERSION,
)

MNEMONIC = (
    "abandon abandon abandon abandon abandon abandon abandon abandon "
    "abandon abandon abandon abandon abandon abandon abandon abandon "
    "abandon abandon abandon abandon abandon abandon abandon art"
)
PASSPHRASE = "uma-senha-forte-que-so-eu-sei-123"


def _fast_argon2():
    """Reduz custo do Argon2 para os testes rodarem rapido (8 MiB, 1 iter)."""
    crypto.ARGON2_MEMORY_KIB = 8192
    crypto.ARGON2_TIME_COST = 1
    crypto.ARGON2_PARALLELISM = 1


class TestSeedCrypto(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _fast_argon2()

    def test_round_trip(self):
        blob = encrypt_seed(MNEMONIC, PASSPHRASE)
        self.assertEqual(decrypt_seed(blob, PASSPHRASE), MNEMONIC)

    def test_blob_versioned_and_self_describing(self):
        blob = encrypt_seed(MNEMONIC, PASSPHRASE)
        self.assertEqual(blob["v"], BLOB_VERSION)
        self.assertEqual(blob["kdf"], "argon2id")
        self.assertEqual(blob["cipher"], "aes-256-gcm")
        for key in ("kdfParams", "kdfSalt", "iv", "authTag", "ciphertext", "createdAt"):
            self.assertIn(key, blob)
        # ciphertext NAO contem o mnemonico em claro.
        self.assertNotIn("abandon", blob["ciphertext"])

    def test_wrong_passphrase_raises(self):
        blob = encrypt_seed(MNEMONIC, PASSPHRASE)
        with self.assertRaises(InvalidPassphraseError):
            decrypt_seed(blob, "senha-errada")

    def test_salt_and_iv_unique_per_call(self):
        b1 = encrypt_seed(MNEMONIC, PASSPHRASE)
        b2 = encrypt_seed(MNEMONIC, PASSPHRASE)
        # Mesmo mnemonico+passphrase -> blobs diferentes (salt/iv aleatorios).
        self.assertNotEqual(b1["kdfSalt"], b2["kdfSalt"])
        self.assertNotEqual(b1["iv"], b2["iv"])
        self.assertNotEqual(b1["ciphertext"], b2["ciphertext"])
        # Mas ambos decifram para o mesmo mnemonico.
        self.assertEqual(decrypt_seed(b1, PASSPHRASE), MNEMONIC)
        self.assertEqual(decrypt_seed(b2, PASSPHRASE), MNEMONIC)

    def test_tampered_blob_fails(self):
        blob = encrypt_seed(MNEMONIC, PASSPHRASE)
        # Adultera o ciphertext -> auth tag GCM nao verifica.
        tampered = dict(blob)
        ct = bytearray(crypto._b64d(blob["ciphertext"]))
        ct[0] ^= 0x01
        tampered["ciphertext"] = crypto._b64e(bytes(ct))
        with self.assertRaises(InvalidPassphraseError):
            decrypt_seed(tampered, PASSPHRASE)

    def test_rewrap_changes_passphrase(self):
        blob = encrypt_seed(MNEMONIC, PASSPHRASE)
        new_pass = "nova-passphrase-456"
        rewrapped = rewrap_seed(blob, PASSPHRASE, new_pass)
        # Antiga nao decifra mais; a nova sim; mnemonico preservado.
        with self.assertRaises(InvalidPassphraseError):
            decrypt_seed(rewrapped, PASSPHRASE)
        self.assertEqual(decrypt_seed(rewrapped, new_pass), MNEMONIC)
        # createdAt preservado, rewrappedAt presente.
        self.assertEqual(rewrapped["createdAt"], blob["createdAt"])
        self.assertIn("rewrappedAt", rewrapped)

    def test_empty_inputs_raise(self):
        with self.assertRaises(ValueError):
            encrypt_seed("", PASSPHRASE)
        with self.assertRaises(ValueError):
            encrypt_seed(MNEMONIC, "")

    def test_unsupported_version_raises(self):
        blob = encrypt_seed(MNEMONIC, PASSPHRASE)
        blob["v"] = 999
        with self.assertRaises(ValueError):
            decrypt_seed(blob, PASSPHRASE)


if __name__ == "__main__":
    unittest.main()
