"""
Testes dos endpoints non-custodial do LWK (ADR 0051 Etapa 2).

Foco: (1) o caminho CUSTODIAL nao muda; (2) o non-custodial decide certo por
{encrypted_seed, passphrase}; (3) reveal/encrypt-seed/rewrap/recover usam o
crypto real. A lib `lwk` (nativa) e a rede sao mockadas — testamos a LOGICA de
roteamento e de cripto, nao a blockchain.

Rodar: `python -m pytest lwk/test_app_noncustodial.py`
       ou `python -m unittest lwk.test_app_noncustodial`
"""

import os
import sys
import types
import unittest
from unittest import mock

# A lib `lwk` e nativa e pesada; substituimos por um stub ANTES de importar app.
_lwk_stub = types.ModuleType("lwk")


class _FakeMnemonic:
    def __init__(self, s):
        self._s = s

    @staticmethod
    def from_random(n):
        return _FakeMnemonic("word " * n)

    def __str__(self):
        return self._s


class _FakeSigner:
    """Signer fake: o descriptor deriva deterministicamente do mnemonico, para
    o teste de `recover` validar o match descriptor<->mnemonico."""

    def __init__(self, mnemonic, network):
        self._m = str(mnemonic)

    def wpkh_slip77_descriptor(self):
        return f"ct(desc-of:{self._m})"

    def sign(self, pset):
        return pset


class _FakeNetwork:
    @staticmethod
    def mainnet():
        return "mainnet"

    @staticmethod
    def testnet():
        return "testnet"


_lwk_stub.Mnemonic = _FakeMnemonic
_lwk_stub.Signer = _FakeSigner
_lwk_stub.Network = _FakeNetwork
_lwk_stub.Wollet = mock.MagicMock()
_lwk_stub.WolletDescriptor = mock.MagicMock()
_lwk_stub.Address = mock.MagicMock()
_lwk_stub.TxBuilder = mock.MagicMock()
sys.modules["lwk"] = _lwk_stub

os.environ.setdefault("API_KEY", "test-key")
os.environ.setdefault("WALLET_DATA_DIR", "/tmp/lwk-test-data")

import app  # noqa: E402  (import depois do stub e do env)
import crypto  # noqa: E402

# Argon2 rapido nos testes.
crypto.ARGON2_MEMORY_KIB = 8192
crypto.ARGON2_TIME_COST = 1
crypto.ARGON2_PARALLELISM = 1

TENANT = "11111111-1111-1111-1111-111111111111"
MNEMONIC = "word " * 24
PASSPHRASE = "minha-passphrase-secreta"
HEADERS = {"X-API-Key": "test-key"}


def _blob():
    return crypto.encrypt_seed(MNEMONIC.strip(), PASSPHRASE)


class TestNonCustodialEndpoints(unittest.TestCase):
    def setUp(self):
        app.app.config["TESTING"] = True
        self.client = app.app.test_client()

    # ── reveal ────────────────────────────────────────────────────────────
    def test_reveal_non_custodial_requires_passphrase(self):
        r = self.client.post(
            f"/wallet/{TENANT}/mnemonic/reveal",
            json={"encrypted_seed": _blob()},
            headers=HEADERS,
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn("passphrase", r.get_json()["error"])

    def test_reveal_non_custodial_wrong_passphrase(self):
        r = self.client.post(
            f"/wallet/{TENANT}/mnemonic/reveal",
            json={"encrypted_seed": _blob(), "passphrase": "errada"},
            headers=HEADERS,
        )
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.get_json()["error"], "invalid_passphrase")

    def test_reveal_non_custodial_ok(self):
        r = self.client.post(
            f"/wallet/{TENANT}/mnemonic/reveal",
            json={"encrypted_seed": _blob(), "passphrase": PASSPHRASE},
            headers=HEADERS,
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()["mnemonic"], MNEMONIC.strip())

    def test_reveal_custodial_unchanged(self):
        # Sem encrypted_seed -> caminho custodial (le do disco via load_or_create).
        with mock.patch.object(
            app, "load_or_create_wallet",
            return_value=(None, None, "desc", MNEMONIC.strip()),
        ):
            r = self.client.post(
                f"/wallet/{TENANT}/mnemonic/reveal", json={}, headers=HEADERS,
            )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()["mnemonic"], MNEMONIC.strip())

    # ── encrypt-seed (migracao) ───────────────────────────────────────────
    def test_encrypt_seed_round_trips(self):
        with mock.patch.object(
            app, "load_or_create_wallet",
            return_value=(None, None, "desc", MNEMONIC.strip()),
        ):
            r = self.client.post(
                f"/wallet/{TENANT}/encrypt-seed",
                json={"passphrase": PASSPHRASE}, headers=HEADERS,
            )
        self.assertEqual(r.status_code, 200)
        blob = r.get_json()["encrypted_seed"]
        self.assertEqual(crypto.decrypt_seed(blob, PASSPHRASE), MNEMONIC.strip())

    def test_encrypt_seed_requires_passphrase(self):
        r = self.client.post(
            f"/wallet/{TENANT}/encrypt-seed", json={}, headers=HEADERS,
        )
        self.assertEqual(r.status_code, 400)

    # ── rewrap ────────────────────────────────────────────────────────────
    def test_rewrap_changes_passphrase(self):
        blob = _blob()
        r = self.client.post(
            f"/wallet/{TENANT}/rewrap",
            json={"encrypted_seed": blob, "old_passphrase": PASSPHRASE, "new_passphrase": "nova"},
            headers=HEADERS,
        )
        self.assertEqual(r.status_code, 200)
        new_blob = r.get_json()["encrypted_seed"]
        self.assertEqual(crypto.decrypt_seed(new_blob, "nova"), MNEMONIC.strip())

    def test_rewrap_wrong_old_passphrase(self):
        r = self.client.post(
            f"/wallet/{TENANT}/rewrap",
            json={"encrypted_seed": _blob(), "old_passphrase": "errada", "new_passphrase": "nova"},
            headers=HEADERS,
        )
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.get_json()["error"], "invalid_passphrase")

    # ── recover ───────────────────────────────────────────────────────────
    def test_recover_matching_descriptor(self):
        # O descriptor esperado deriva do mesmo mnemonico (FakeSigner).
        expected_desc = f"ct(desc-of:{MNEMONIC.strip()})"
        with mock.patch.object(
            app, "load_watch_only", return_value=(object(), expected_desc),
        ):
            r = self.client.post(
                f"/wallet/{TENANT}/recover",
                json={"mnemonic": MNEMONIC.strip(), "new_passphrase": "nova"},
                headers=HEADERS,
            )
        self.assertEqual(r.status_code, 200)
        blob = r.get_json()["encrypted_seed"]
        self.assertEqual(crypto.decrypt_seed(blob, "nova"), MNEMONIC.strip())

    def test_recover_rejects_wrong_wallet(self):
        with mock.patch.object(
            app, "load_watch_only", return_value=(object(), "ct(desc-of:OUTRA-CARTEIRA)"),
        ):
            r = self.client.post(
                f"/wallet/{TENANT}/recover",
                json={"mnemonic": MNEMONIC.strip(), "new_passphrase": "nova"},
                headers=HEADERS,
            )
        self.assertEqual(r.status_code, 400)
        self.assertIn("nao corresponde", r.get_json()["error"])

    # ── transfer: roteamento custodial vs non-custodial ───────────────────
    def test_transfer_non_custodial_requires_passphrase(self):
        r = self.client.post(
            f"/wallet/{TENANT}/transfer",
            json={"encrypted_seed": _blob(), "recipients": [{"to": "lq1xxx", "amount": 1}]},
            headers=HEADERS,
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn("passphrase", r.get_json()["error"])

    def test_auth_required(self):
        r = self.client.post(f"/wallet/{TENANT}/encrypt-seed", json={"passphrase": "x"})
        self.assertEqual(r.status_code, 401)


import shutil
import uuid as _uuid


class TestSetupNonCustodial(unittest.TestCase):
    """ADR 0051 — provisionamento non-custodial no primeiro acesso."""

    def setUp(self):
        app.app.config["TESTING"] = True
        self.client = app.app.test_client()
        # Tenant unico por teste -> dir limpo (guard 409 + checagem de arquivos).
        self.tenant = str(_uuid.uuid4())

    def tearDown(self):
        d = os.path.join(os.environ["WALLET_DATA_DIR"], self.tenant)
        shutil.rmtree(d, ignore_errors=True)

    def _paths(self):
        return app.WalletPaths(self.tenant)

    def test_create_returns_blob_and_mnemonic(self):
        r = self.client.post(
            f"/wallet/{self.tenant}/setup-noncustodial",
            json={"mode": "create", "passphrase": PASSPHRASE},
            headers=HEADERS,
        )
        self.assertEqual(r.status_code, 200)
        body = r.get_json()
        self.assertIn("mnemonic", body)
        self.assertIn("encrypted_seed", body)
        self.assertIn("descriptor", body)
        self.assertIn("master_address", body)
        self.assertEqual(crypto.decrypt_seed(body["encrypted_seed"], PASSPHRASE), body["mnemonic"])

    def test_create_never_writes_mnemonic_file(self):
        self.client.post(
            f"/wallet/{self.tenant}/setup-noncustodial",
            json={"mode": "create", "passphrase": PASSPHRASE},
            headers=HEADERS,
        )
        p = self._paths()
        # GARANTIA CENTRAL: so o descriptor e gravado; mnemonic.txt NUNCA.
        self.assertTrue(os.path.exists(p.descriptor))
        self.assertFalse(os.path.exists(p.mnemonic))

    def test_import_uses_provided_mnemonic_and_omits_it(self):
        m = "abandon " * 23 + "art"
        r = self.client.post(
            f"/wallet/{self.tenant}/setup-noncustodial",
            json={"mode": "import", "passphrase": PASSPHRASE, "mnemonic": m},
            headers=HEADERS,
        )
        self.assertEqual(r.status_code, 200)
        body = r.get_json()
        self.assertNotIn("mnemonic", body)
        self.assertEqual(crypto.decrypt_seed(body["encrypted_seed"], PASSPHRASE), m)

    def test_import_rejects_wrong_word_count(self):
        r = self.client.post(
            f"/wallet/{self.tenant}/setup-noncustodial",
            json={"mode": "import", "passphrase": PASSPHRASE, "mnemonic": "word word word"},
            headers=HEADERS,
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn("24 palavras", r.get_json()["error"])

    def test_requires_passphrase(self):
        r = self.client.post(
            f"/wallet/{self.tenant}/setup-noncustodial",
            json={"mode": "create"}, headers=HEADERS,
        )
        self.assertEqual(r.status_code, 400)

    def test_invalid_mode(self):
        r = self.client.post(
            f"/wallet/{self.tenant}/setup-noncustodial",
            json={"mode": "xxx", "passphrase": PASSPHRASE}, headers=HEADERS,
        )
        self.assertEqual(r.status_code, 400)

    def test_rejects_if_already_provisioned(self):
        r1 = self.client.post(
            f"/wallet/{self.tenant}/setup-noncustodial",
            json={"mode": "create", "passphrase": PASSPHRASE}, headers=HEADERS,
        )
        self.assertEqual(r1.status_code, 200)
        r2 = self.client.post(
            f"/wallet/{self.tenant}/setup-noncustodial",
            json={"mode": "create", "passphrase": "outra-senha"}, headers=HEADERS,
        )
        self.assertEqual(r2.status_code, 409)

    def test_requires_auth(self):
        r = self.client.post(
            f"/wallet/{self.tenant}/setup-noncustodial",
            json={"mode": "create", "passphrase": PASSPHRASE},
        )
        self.assertEqual(r.status_code, 401)


class TestReadEndpointsNeverAutoCreate(unittest.TestCase):
    """Regressao: endpoints de LEITURA (balance/master-address/address/transactions)
    NUNCA podem auto-criar uma carteira custodial. Consultar um tenant sem
    carteira provisionada deve devolver 404 e NAO gravar mnemonic.txt — senao
    gera uma carteira fantasma que bloqueia o setup non-custodial (guard 409)."""

    def setUp(self):
        app.app.config["TESTING"] = True
        self.client = app.app.test_client()
        self.tenant = str(_uuid.uuid4())

    def tearDown(self):
        d = os.path.join(os.environ["WALLET_DATA_DIR"], self.tenant)
        shutil.rmtree(d, ignore_errors=True)

    def _no_wallet_on_disk(self):
        p = app.WalletPaths(self.tenant)
        return not os.path.exists(p.descriptor) and not os.path.exists(p.mnemonic)

    def test_balance_unprovisioned_returns_404_and_creates_nothing(self):
        r = self.client.get(f"/wallet/{self.tenant}/balance?sync=false", headers=HEADERS)
        self.assertEqual(r.status_code, 404)
        self.assertTrue(self._no_wallet_on_disk())

    def test_master_address_unprovisioned_returns_404(self):
        r = self.client.get(f"/wallet/{self.tenant}/master-address", headers=HEADERS)
        self.assertEqual(r.status_code, 404)
        self.assertTrue(self._no_wallet_on_disk())

    def test_new_address_unprovisioned_returns_404(self):
        r = self.client.post(f"/wallet/{self.tenant}/address/new", json={}, headers=HEADERS)
        self.assertEqual(r.status_code, 404)
        self.assertTrue(self._no_wallet_on_disk())

    def test_transactions_unprovisioned_returns_404(self):
        r = self.client.get(f"/wallet/{self.tenant}/transactions", headers=HEADERS)
        self.assertEqual(r.status_code, 404)
        self.assertTrue(self._no_wallet_on_disk())


if __name__ == "__main__":
    unittest.main()
