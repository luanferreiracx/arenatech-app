"""
Guarda da carteira watch-only (achado de 2026-07-28).

O tenant `Loja NO-KYC` tem no seu diretorio um `descriptor.txt` IGUAL ao da
carteira central e NENHUM `mnemonic.txt`: e um espelho watch-only da carteira da
central (ve saldo e depositos, nao assina).

`load_or_create_wallet` exigia descriptor E mnemonic para "carregar". Com o
mnemonic ausente ela caia no ramo de criacao e **sobrescrevia o descriptor.txt**
com uma carteira nova e aleatoria. Consequencia: a primeira operacao que tocasse
essa carteira destruiria o vinculo watch-only em silencio — o tenant passaria a
apontar para uma carteira vazia e pararia de enxergar os proprios depositos.

O certo e recusar alto: existe descriptor, falta a seed, entao nao da pra assinar
e NAO se inventa carteira nova por cima.

Rodar: `python -m unittest test_watch_only_guard`
"""

import os
import sys
import tempfile
import types
import unittest
from unittest import mock

# Mesmo stub do test_app_noncustodial: a lib `lwk` e nativa e pesada.
_lwk_stub = types.ModuleType("lwk")


class _FakeMnemonic:
    def __init__(self, s):
        self._s = s

    @staticmethod
    def from_random(n):
        return _FakeMnemonic("novo " * n)

    def __str__(self):
        return self._s


class _FakeSigner:
    def __init__(self, mnemonic, network):
        self._m = str(mnemonic)

    def wpkh_slip77_descriptor(self):
        return f"ct(desc-of:{self._m})"


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
_lwk_stub.EsploraClient = mock.MagicMock()
_lwk_stub.Pset = mock.MagicMock()
sys.modules.setdefault("lwk", _lwk_stub)

os.environ.setdefault("API_KEY", "test-key")
os.environ.setdefault("WALLET_DATA_DIR", tempfile.mkdtemp(prefix="lwk-watchonly-"))

import app  # noqa: E402

TENANT = "22222222-2222-2222-2222-222222222222"
SHARED_DESCRIPTOR = "ct(slip77(abc),elwpkh([deadbeef/84h/1776h/0h]xpub-da-central))"


class TestWatchOnlyWalletGuard(unittest.TestCase):
    def setUp(self):
        self.data_dir = tempfile.mkdtemp(prefix="lwk-watchonly-case-")
        patcher = mock.patch.object(app, "WALLET_DATA_DIR", self.data_dir)
        patcher.start()
        self.addCleanup(patcher.stop)

        self.tenant_dir = os.path.join(self.data_dir, TENANT)
        os.makedirs(self.tenant_dir, exist_ok=True)
        self.descriptor_path = os.path.join(self.tenant_dir, "descriptor.txt")
        with open(self.descriptor_path, "w") as f:
            f.write(SHARED_DESCRIPTOR)

    def test_nao_sobrescreve_descriptor_de_carteira_watch_only(self):
        """Descriptor presente + mnemonic ausente => recusa, sem tocar no arquivo."""
        with self.assertRaises(app.WatchOnlyWalletError):
            app.load_or_create_wallet(TENANT)

        with open(self.descriptor_path) as f:
            self.assertEqual(
                f.read(),
                SHARED_DESCRIPTOR,
                "o descriptor watch-only foi sobrescrito — o vinculo com a "
                "carteira central seria destruido",
            )

    def test_nao_cria_mnemonic_para_carteira_watch_only(self):
        """Nao basta preservar o descriptor: nao pode inventar seed nova."""
        with self.assertRaises(app.WatchOnlyWalletError):
            app.load_or_create_wallet(TENANT)

        self.assertFalse(
            os.path.exists(os.path.join(self.tenant_dir, "mnemonic.txt")),
            "gerou uma seed nova para uma carteira que e so espelho",
        )


if __name__ == "__main__":
    unittest.main()
