"""
LWK Liquid Wallet API - DePix Wallet v6 (hardened)

Mudancas v6 (hardening pos-auditoria):
- Valores em Decimal (sem truncamento de centavos)
- Lock global serializa /transfer (evita double-spend) + monitor
- Sync SINCRONO antes de transferir (nunca envia sobre estado velho)
- Idempotencia no /transfer (Idempotency-Key -> txid)
- Broadcast com fallback entre Esploras + verificacao de aceitacao
- Persistencia atomica (write tmp + os.replace) e por-evento no monitor
- Auth com compare_digest + fail-closed (aborta se API_KEY vazio)
- Mnemonic gravado com chmod 0600
- /health sem auth (probe) + erros genericos (nao vaza internals)
- Webhook com retry + HMAC-SHA256 do corpo
"""

import os
import re
import json
import time
import uuid
import hmac
import hashlib
import logging
import threading
import requests
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from datetime import datetime, timezone
from flask import Flask, request, jsonify
from flask_cors import CORS
import lwk

# ADR 0051 — cifragem da seed non-custodial (passphrase do usuario).
import crypto

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Configuracoes
WALLET_DATA_DIR        = os.environ.get("WALLET_DATA_DIR", "/app/wallet_data")
NETWORK_NAME           = os.environ.get("NETWORK", "mainnet")
ESPLORA_URL            = os.environ.get("ESPLORA_URL", "")
API_KEY                = os.environ.get("API_KEY", "")
DEPIX_ASSET_ID         = os.environ.get("DEPIX_ASSET_ID", "02f22f8d9c76ab41661a2729e4752e2c5d1a263012141b86ea98af5472df5189")
WEBHOOK_URL            = os.environ.get("WEBHOOK_URL", "")
WEBHOOK_SECRET         = os.environ.get("WEBHOOK_SECRET", "")
MONITOR_INTERVAL       = int(os.environ.get("MONITOR_INTERVAL", "120"))
CONFIRMATIONS_REQUIRED = int(os.environ.get("CONFIRMATIONS_REQUIRED", "2"))
# Monitor de depositos: desabilitado na fase 1 (multi-wallet sem fluxo de
# deposito ainda). Habilitar na fase 2 quando o monitor varrer por tenant.
MONITOR_ENABLED        = os.environ.get("MONITOR_ENABLED", "false").lower() == "true"
# CORS restrito: CSV de origens permitidas (default: so localhost do dashboard)
CORS_ORIGINS           = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5000").split(",") if o.strip()]
# Teto de seguranca pro fee_rate (sat/vB) — evita queimar fundos em fee absurda
FEE_RATE_MAX           = float(os.environ.get("FEE_RATE_MAX", "1.0"))

CORS(app, origins=CORS_ORIGINS)

SAT_PER_COIN = Decimal("100000000")  # 1e8 — precision 8

os.makedirs(WALLET_DATA_DIR, exist_ok=True)

# Multi-wallet: cada tenant tem seu subdiretorio WALLET_DATA_DIR/{tenant_id}/.
# tenant_id e validado como UUID estrito antes de virar path (anti traversal).
_UUID_RE = re.compile(r"^[0-9a-fA-F-]{36}$")


def _valid_tenant_id(tenant_id):
    return bool(tenant_id) and bool(_UUID_RE.match(str(tenant_id)))


def _tenant_dir(tenant_id):
    d = os.path.join(WALLET_DATA_DIR, tenant_id)
    os.makedirs(d, exist_ok=True)
    return d


class WalletPaths:
    def __init__(self, tenant_id):
        d = _tenant_dir(tenant_id)
        self.dir         = d
        self.descriptor  = os.path.join(d, "descriptor.txt")
        self.mnemonic    = os.path.join(d, "mnemonic.txt")
        self.seen        = os.path.join(d, "seen_txids.json")
        self.labels      = os.path.join(d, "labels.json")
        self.pending     = os.path.join(d, "pending_txids.json")
        self.idempotency = os.path.join(d, "idempotency.json")

# Esploras pra broadcast/sync — primeiro env ESPLORA_URL (se setado), depois defaults.
ESPLORA_URLS = [u for u in [ESPLORA_URL.rstrip("/") if ESPLORA_URL else None,
                            "https://liquid.network/api",
                            "https://esplora.blockstream.com/liquid/api"] if u]
# dedup preservando ordem
ESPLORA_URLS = list(dict.fromkeys(ESPLORA_URLS))

# Locks POR-WALLET: serializa acesso a cada carteira (build/sign/broadcast)
# sem serializar tenants distintos entre si. Sem isso, /transfer concorrentes
# do MESMO tenant poderiam gastar o mesmo UTXO (double-spend).
_WALLET_LOCKS = defaultdict(threading.Lock)
_WALLET_LOCKS_META = threading.Lock()  # protege a criacao de locks no dict
_STATE_LOCKS = defaultdict(threading.Lock)
_STATE_LOCKS_META = threading.Lock()


def wallet_lock(tenant_id):
    with _WALLET_LOCKS_META:
        return _WALLET_LOCKS[tenant_id]


def state_lock(tenant_id):
    with _STATE_LOCKS_META:
        return _STATE_LOCKS[tenant_id]


# ── Rede ──────────────────────────────────────────────────────────────────────

def get_network():
    if NETWORK_NAME == "testnet":
        return lwk.Network.testnet()
    return lwk.Network.mainnet()


# ── Auth ──────────────────────────────────────────────────────────────────────

def auth_required():
    # Fail-closed: API_KEY vazia ja aborta no boot (require_config). Aqui so
    # comparamos em tempo constante pra evitar timing attack.
    provided = request.headers.get("X-API-Key", "")
    if not hmac.compare_digest(provided, API_KEY):
        return jsonify({"error": "unauthorized"}), 401
    return None


def fail(message, code=400, log_detail=None):
    """Resposta de erro generica pro cliente; detalhe so no log (nao vaza internals)."""
    if log_detail is not None:
        logger.warning(f"{message} :: {log_detail}")
    return jsonify({"error": message}), code


# ── Persistencia atomica ────────────────────────────────────────────────────

def _atomic_write_json(path, data):
    tmp = f"{path}.tmp.{os.getpid()}"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)  # rename atomico — leitor nunca ve arquivo parcial


def _load_json(path, default):
    if os.path.exists(path):
        try:
            with open(path) as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            logger.error(f"Estado corrompido em {path}: {e} — usando default SEM sobrescrever")
    return default


# ── Carteira ──────────────────────────────────────────────────────────────────

def load_or_create_wallet(tenant_id):
    """Carrega (ou cria) a carteira do tenant. Cada tenant tem mnemonic proprio
    no seu subdiretorio. Idempotente: se ja existe, so carrega."""
    p = WalletPaths(tenant_id)
    network = get_network()
    if os.path.exists(p.descriptor) and os.path.exists(p.mnemonic):
        with open(p.descriptor) as f:
            descriptor_str = f.read().strip()
        with open(p.mnemonic) as f:
            mnemonic_str = f.read().strip()
        signer = lwk.Signer(lwk.Mnemonic(mnemonic_str), network)
        wollet = lwk.Wollet(network, lwk.WolletDescriptor(descriptor_str), p.dir)
        return wollet, signer, descriptor_str, mnemonic_str
    else:
        mnemonic     = lwk.Mnemonic.from_random(24)
        mnemonic_str = str(mnemonic)
        signer       = lwk.Signer(mnemonic, network)
        descriptor   = signer.wpkh_slip77_descriptor()
        descriptor_str = str(descriptor)
        # Grava secrets com permissao restrita (0600) ANTES de escrever conteudo.
        _write_secret(p.mnemonic, mnemonic_str)
        _write_secret(p.descriptor, descriptor_str)
        wollet = lwk.Wollet(network, descriptor, p.dir)
        logger.info(f"Nova carteira criada para tenant {tenant_id}")
        return wollet, signer, descriptor_str, mnemonic_str


# ── Non-custodial (ADR 0051) ──────────────────────────────────────────────────
#
# No modelo non-custodial a seed NAO esta no disco: ela vive cifrada no Postgres
# e chega ao /transfer no corpo da requisicao como {encrypted_seed, passphrase}.
# Estas funcoes derivam o signer/watch-only SEM tocar o caminho custodial (que
# segue identico em load_or_create_wallet) — para nao arriscar o fluxo de saque
# que ja move dinheiro em producao.

def load_watch_only(tenant_id):
    """Carrega so a parte WATCH-ONLY (Wollet) a partir do descriptor em disco.
    NAO toca mnemonic. Usada no caminho non-custodial, onde o signer vem do
    blob cifrado (derive_signer_from_blob), nao do disco."""
    p = WalletPaths(tenant_id)
    if not os.path.exists(p.descriptor):
        raise FileNotFoundError("descriptor ausente (carteira nao provisionada)")
    with open(p.descriptor) as f:
        descriptor_str = f.read().strip()
    network = get_network()
    wollet = lwk.Wollet(network, lwk.WolletDescriptor(descriptor_str), p.dir)
    return wollet, descriptor_str


def derive_signer_from_blob(encrypted_seed, passphrase):
    """Decifra o blob em memoria, deriva o lwk.Signer e retorna (signer,
    descriptor_str). O mnemonico em claro existe so dentro desta funcao — nao
    e gravado, logado, nem retornado. Levanta crypto.InvalidPassphraseError se
    a passphrase estiver errada."""
    mnemonic_str = crypto.decrypt_seed(encrypted_seed, passphrase)
    try:
        signer = lwk.Signer(lwk.Mnemonic(mnemonic_str), get_network())
        descriptor_str = str(signer.wpkh_slip77_descriptor())
        return signer, descriptor_str
    finally:
        # Best-effort: solta a referencia ao mnemonico em claro o quanto antes.
        del mnemonic_str


def _write_secret(path, content):
    # Cria com 0600 (so dono le/escreve) — mnemonic/descriptor sao sensiveis.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        os.write(fd, content.encode())
    finally:
        os.close(fd)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def get_tip_height(per_attempt_timeout=8):
    """Tip da blockchain. Cada Esplora tem timeout via thread (a lib lwk
    nao expoe timeout nativo). Retorna None se todas falharem ou timeoutarem."""
    for url in ESPLORA_URLS:
        result = {"tip": None}
        def _try():
            try:
                result["tip"] = lwk.EsploraClient(url, get_network()).tip().height()
            except Exception:
                pass
        t = threading.Thread(target=_try, daemon=True)
        t.start()
        t.join(timeout=per_attempt_timeout)
        if result["tip"] is not None:
            return result["tip"]
        if t.is_alive():
            logger.warning(f"get_tip_height timeout [{url}]")
    return None


def sync_wallet(wollet, silent=False):
    """Sincroniza carteira. Retorna True se algum Esplora respondeu.
    Cada attempt tem timeout via thread — a lib lwk pode ficar hanging
    quando a Esplora rate-limita."""
    for url in ESPLORA_URLS:
        result = {"ok": False, "error": None}
        def _try():
            try:
                client = lwk.EsploraClient(url, get_network())
                update = client.full_scan(wollet)
                if update:
                    wollet.apply_update(update)
                result["ok"] = True
            except Exception as e:
                result["error"] = str(e)
        t = threading.Thread(target=_try, daemon=True)
        t.start()
        t.join(timeout=20)
        if result["ok"]:
            if not silent:
                logger.info(f"Carteira sincronizada via {url}")
            return True
        if t.is_alive():
            logger.warning(f"Sync timeout [{url}] (>20s)")
        elif result["error"]:
            logger.warning(f"Sync falhou [{url}]: {result['error']}")
    logger.error("Todos os servidores Esplora falharam.")
    return False


# ── Labels ────────────────────────────────────────────────────────────────────

def load_labels(paths):
    return _load_json(paths.labels, {"by_label": {}, "by_address": {}})


def save_labels(paths, data):
    _atomic_write_json(paths.labels, data)


def create_label(user):
    safe = "".join(c for c in user.lower() if c.isalnum() or c == "_")[:30] or "user"
    return f"{safe}_{uuid.uuid4().hex[:8]}"


def find_label_by_address(paths, address):
    data = load_labels(paths)
    lid  = data["by_address"].get(address)
    return data["by_label"].get(lid) if lid else None


# ── Pending / seen ──────────────────────────────────────────────────────────

def load_pending(paths):
    return _load_json(paths.pending, {})


def save_pending(paths, data):
    _atomic_write_json(paths.pending, data)


def load_seen_txids(paths):
    return set(_load_json(paths.seen, []))


def save_seen_txids(paths, seen):
    _atomic_write_json(paths.seen, list(seen))


# ── Idempotencia ──────────────────────────────────────────────────────────────

def _load_idempotency(paths):
    return _load_json(paths.idempotency, {})


def _save_idempotency(paths, data):
    _atomic_write_json(paths.idempotency, data)


# ── Conversao de valor (Decimal, sem perda) ──────────────────────────────────

def brl_to_satoshis(amount):
    """Converte valor BRL -> satoshis (1e8) com arredondamento correto.
    Aceita str/numero. Lanca ValueError em entrada invalida."""
    try:
        d = Decimal(str(amount))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError("amount invalido")
    if not d.is_finite() or d <= 0:
        raise ValueError("amount deve ser positivo e finito")
    sat = (d * SAT_PER_COIN).to_integral_value(rounding=ROUND_HALF_UP)
    return int(sat)


def satoshis_to_brl(sat):
    return float((Decimal(int(sat)) / SAT_PER_COIN))


# ── Webhook ───────────────────────────────────────────────────────────────────

def send_webhook(payload, max_attempts=3):
    """POST com retry + backoff. HMAC-SHA256 do corpo em X-Signature.
    Retorna True se o receptor respondeu 2xx."""
    if not WEBHOOK_URL:
        return False
    body = json.dumps(payload, separators=(",", ":")).encode()
    headers = {"Content-Type": "application/json"}
    if WEBHOOK_SECRET:
        # SO a assinatura HMAC do corpo (prova posse do secret sem transmiti-lo).
        # O receptor (/api/webhooks/lwk-deposit) valida exclusivamente por
        # X-Signature; NAO enviamos o secret em claro (evita vazamento se TLS/URL
        # for comprometida).
        headers["X-Signature"] = "sha256=" + hmac.new(
            WEBHOOK_SECRET.encode(), body, hashlib.sha256
        ).hexdigest()

    for attempt in range(1, max_attempts + 1):
        try:
            resp = requests.post(WEBHOOK_URL, data=body, headers=headers, timeout=10)
            if 200 <= resp.status_code < 300:
                logger.info(f"Webhook [{payload.get('status')}] -> {resp.status_code} | txid={payload.get('txid')}")
                return True
            logger.warning(f"Webhook nao-2xx [{resp.status_code}] tentativa {attempt}/{max_attempts} txid={payload.get('txid')}")
        except Exception as e:
            logger.warning(f"Erro webhook tentativa {attempt}/{max_attempts}: {e}")
        if attempt < max_attempts:
            time.sleep(min(2 ** attempt, 8))  # backoff: 2s, 4s, 8s
    logger.error(f"Webhook FALHOU apos {max_attempts} tentativas | txid={payload.get('txid')} | status={payload.get('status')}")
    return False


def build_payload(txid, tx, depix_amount, all_assets, label_info, status, tip_height=None, tenant_id=None):
    now        = datetime.now(timezone.utc).isoformat()
    tx_height  = None
    timestamp  = None
    fee_sat    = None
    confirmations = 0

    try:
        tx_height = tx.height()
        timestamp = tx.timestamp()
        fee_sat   = tx.fee()
    except Exception:
        pass

    if tx_height and tx_height > 0 and tip_height:
        confirmations = max(0, tip_height - tx_height + 1)

    explorer = (
        f"https://blockstream.info/liquid/tx/{txid}"
        if NETWORK_NAME == "mainnet"
        else f"https://blockstream.info/liquidtestnet/tx/{txid}"
    )

    return {
        "event":                  "deposit_received",
        "status":                 status,
        "tenant_id":              tenant_id,
        "confirmations":          confirmations,
        "required_confirmations": CONFIRMATIONS_REQUIRED,
        "network":                NETWORK_NAME,
        "txid":                   txid,
        "explorer_url":           explorer,
        "detected_at":            now,
        "block_height":           tx_height,
        "block_timestamp":        timestamp,
        "fee_satoshis":           fee_sat,
        "depix": {
            "asset_id":  DEPIX_ASSET_ID,
            "amount":    depix_amount,
            "currency":  "BRL",
            "formatted": f"R$ {depix_amount:,.2f}",
        },
        "all_assets": all_assets,
        "label":      label_info,
    }


def extract_label_from_tx(paths, tx):
    try:
        for out in (tx.outputs() or []):
            if out is None:
                continue
            try:
                found = find_label_by_address(paths, str(out.address()))
                if found:
                    return found
            except Exception:
                pass
    except Exception:
        pass
    return None


def get_tx_assets(tx):
    """Retorna (depix_received, all_assets, any_received)."""
    depix_received = 0.0
    all_assets     = {}
    try:
        for asset_id, amount in tx.balance().items():
            asset_str      = str(asset_id)
            amount_decimal = satoshis_to_brl(amount)
            all_assets[asset_str] = {
                "amount":   amount_decimal,
                "satoshis": amount,
                "is_depix": asset_str == DEPIX_ASSET_ID,
            }
            if asset_str == DEPIX_ASSET_ID and amount > 0:
                depix_received = amount_decimal
    except Exception as e:
        logger.warning(f"Erro ao ler balance da tx: {e}")

    any_received = any(v["satoshis"] > 0 for v in all_assets.values())
    return depix_received, all_assets, any_received


# ── Monitor ───────────────────────────────────────────────────────────────────

def _list_provisioned_tenants():
    """Tenants ja provisionados = subdirs com descriptor.txt."""
    out = []
    try:
        for name in os.listdir(WALLET_DATA_DIR):
            d = os.path.join(WALLET_DATA_DIR, name)
            if os.path.isdir(d) and _valid_tenant_id(name) and os.path.exists(os.path.join(d, "descriptor.txt")):
                out.append(name)
    except OSError:
        pass
    return out


def monitor_tenant(tenant_id):
    """Processa depositos de UM tenant. Serializado pelo lock daquele tenant.

    Usa WATCH-ONLY (so descriptor): o monitor so LE transacoes, nunca assina.
    Crucial p/ non-custodial: load_or_create_wallet veria a ausencia de
    mnemonic.txt e RECRIARIA uma carteira custodial nova, sobrescrevendo o
    descriptor da carteira non-custodial (corrompendo-a). Watch-only funciona
    igual p/ custodial e non-custodial (ambos tem descriptor.txt)."""
    paths = WalletPaths(tenant_id)
    with wallet_lock(tenant_id):
        try:
            wollet, _ = load_watch_only(tenant_id)
        except FileNotFoundError:
            # Carteira sumiu do disco entre o list e o lock — ignora este ciclo.
            return
        sync_wallet(wollet, silent=True)
        tip_height = get_tip_height()
        txs        = wollet.transactions()

    seen_txids = load_seen_txids(paths)
    pending    = load_pending(paths)

    for tx in txs:
        txid = str(tx.txid())
        depix_received, all_assets, any_received = get_tx_assets(tx)

        # So DEPOSITO de DePix. Tx de envio (balance negativo) nao notifica.
        if depix_received <= 0:
            if txid not in seen_txids:
                seen_txids.add(txid)
                save_seen_txids(paths, seen_txids)
            continue

        tx_height     = tx.height() if tx.height() else 0
        confirmations = max(0, tip_height - tx_height + 1) if (tx_height and tx_height > 0 and tip_height) else 0
        is_confirmed  = confirmations >= CONFIRMATIONS_REQUIRED
        label_info    = extract_label_from_tx(paths, tx)

        assets_log = ", ".join(
            f"{v['amount']} {'DePix' if k == DEPIX_ASSET_ID else k[:8]+'...'}"
            for k, v in all_assets.items() if v["satoshis"] > 0
        )

        if txid not in seen_txids:
            if is_confirmed:
                ok = send_webhook(build_payload(txid, tx, depix_received, all_assets, label_info, "confirmed", tip_height, tenant_id))
                if ok:
                    logger.info(f"[{tenant_id}] DEPOSITO confirmado: {assets_log} | txid={txid} | conf={confirmations}")
                    seen_txids.add(txid)
                    save_seen_txids(paths, seen_txids)
            else:
                ok = send_webhook(build_payload(txid, tx, depix_received, all_assets, label_info, "pending", tip_height, tenant_id))
                seen_txids.add(txid)
                save_seen_txids(paths, seen_txids)
                pending[txid] = {
                    "depix_amount": depix_received,
                    "all_assets":   all_assets,
                    "label_info":   label_info,
                    "first_seen":   datetime.now(timezone.utc).isoformat(),
                    "confirmed_sent": False,
                }
                save_pending(paths, pending)
                if ok:
                    logger.info(f"[{tenant_id}] DEPOSITO pendente: {assets_log} | txid={txid} | conf={confirmations}/{CONFIRMATIONS_REQUIRED}")

        elif txid in pending and not pending[txid].get("confirmed_sent"):
            if is_confirmed:
                p  = pending[txid]
                ok = send_webhook(build_payload(txid, tx, p["depix_amount"], p["all_assets"], p["label_info"], "confirmed", tip_height, tenant_id))
                if ok:
                    logger.info(f"[{tenant_id}] DEPOSITO confirmado: {assets_log} | txid={txid} | conf={confirmations}")
                    p["confirmed_sent"] = True
                    pending[txid] = p
                    save_pending(paths, pending)

    pending = {k: v for k, v in pending.items() if not v.get("confirmed_sent")}
    save_pending(paths, pending)


def monitor_loop():
    logger.info(
        f"Monitor MULTI-TENANT iniciado - intervalo: {MONITOR_INTERVAL}s | "
        f"confirmacoes: {CONFIRMATIONS_REQUIRED} | "
        f"webhook: {WEBHOOK_URL or 'NAO CONFIGURADO'}"
    )
    time.sleep(10)
    while True:
        try:
            for tenant_id in _list_provisioned_tenants():
                try:
                    monitor_tenant(tenant_id)
                except Exception as e:
                    logger.error(f"Erro no monitor do tenant {tenant_id}: {e}")
        except Exception as e:
            logger.error(f"Erro no monitor_loop: {e}")
        time.sleep(MONITOR_INTERVAL)


# ── Broadcast resiliente ──────────────────────────────────────────────────────

def broadcast_with_fallback(tx):
    """Transmite a tx tentando cada Esplora. Retorna (txid, url) ou lanca."""
    last_err = None
    for url in ESPLORA_URLS:
        try:
            client = lwk.EsploraClient(url, get_network())
            txid = str(client.broadcast(tx))
            return txid, url
        except Exception as e:
            last_err = e
            logger.warning(f"Broadcast falhou [{url}]: {e}")
    raise RuntimeError(f"broadcast falhou em todas as Esploras: {last_err}")


def verify_in_mempool(txid):
    """Confirma que a tx existe (mempool ou bloco) em alguma Esplora via REST.
    liquid.network/api e a Esplora — GET /tx/{txid} retorna 200 se conhecida."""
    for url in ESPLORA_URLS:
        try:
            resp = requests.get(f"{url}/tx/{txid}", timeout=10)
            if resp.status_code == 200:
                return True
        except Exception:
            pass
    return False


# ── Rotas ─────────────────────────────────────────────────────────────────────

def _require_tenant(tenant_id):
    """Valida tenant_id (UUID). Retorna (None) se ok, ou (response, code) se invalido."""
    if not _valid_tenant_id(tenant_id):
        return fail("tenant_id invalido")
    return None


@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "service": "LWK DePix Wallet API",
        "version": "7.0.0-multitenant",
        "network": NETWORK_NAME,
        "monitor": {
            "enabled":                MONITOR_ENABLED,
            "interval_seconds":       MONITOR_INTERVAL,
            "confirmations_required": CONFIRMATIONS_REQUIRED,
            "webhook_configured":     bool(WEBHOOK_URL),
        },
        "endpoints": [
            "GET  /health",
            "POST /wallet/{tenant_id}/create",
            "GET  /wallet/{tenant_id}/balance",
            "GET  /wallet/{tenant_id}/master-address",
            "GET  /wallet/{tenant_id}/info",
            "POST /wallet/{tenant_id}/mnemonic/reveal",
            "POST /wallet/{tenant_id}/address/new   body: {user, index?}",
            "POST /wallet/{tenant_id}/transfer      body: {recipients:[{to,amount}], fee_rate?, asset_id?}  header: Idempotency-Key",
            "GET  /wallet/{tenant_id}/transactions  ?limit=20",
            "POST /webhook/test",
        ]
    })


@app.route("/health", methods=["GET"])
def health():
    """Liveness probe (sem auth, sem rede). Retorna 200 se o processo
    Python esta vivo. NAO bloqueia em chamadas Esplora — quando a
    Esplora rate-limita, o /health ainda responde rapido."""
    return jsonify({"status": "ok", "network": NETWORK_NAME})


@app.route("/readiness", methods=["GET"])
def readiness():
    """Readiness probe (sem auth) que CONSULTA Esplora. 503 se nao
    consegue ler tip — sinaliza pro orquestrador que requests externos
    podem falhar agora. Usado pra healthcheck mais agressivo."""
    try:
        tip = get_tip_height(per_attempt_timeout=5)
        if tip is None:
            return jsonify({"status": "degraded", "reason": "esplora_unreachable"}), 503
        return jsonify({"status": "ok", "tip_height": tip, "network": NETWORK_NAME})
    except Exception as e:
        logger.error(f"Readiness check falhou: {e}")
        return jsonify({"status": "down"}), 503


@app.route("/wallet/<tenant_id>/create", methods=["POST"])
def wallet_create(tenant_id):
    err = auth_required()
    if err:
        return err
    bad = _require_tenant(tenant_id)
    if bad:
        return bad
    try:
        with wallet_lock(tenant_id):
            wollet, _, descriptor_str, _ = load_or_create_wallet(tenant_id)
            master_address = str(wollet.address(0).address())
        logger.info(f"Wallet provisionada/carregada para tenant {tenant_id}")
        return jsonify({
            "tenant_id":      tenant_id,
            "descriptor":     descriptor_str,
            "master_address": master_address,
            "network":        NETWORK_NAME,
        })
    except Exception as e:
        return fail("internal_error", 500, log_detail=f"wallet_create[{tenant_id}]: {e}")


@app.route("/wallet/<tenant_id>/master-address", methods=["GET"])
def wallet_master_address(tenant_id):
    err = auth_required()
    if err:
        return err
    bad = _require_tenant(tenant_id)
    if bad:
        return bad
    try:
        with wallet_lock(tenant_id):
            # Watch-only: nunca auto-cria. 404 se a carteira nao existe.
            try:
                wollet, _ = load_watch_only(tenant_id)
            except FileNotFoundError:
                return fail("carteira nao provisionada", 404)
            master_address = str(wollet.address(0).address())
        return jsonify({"tenant_id": tenant_id, "master_address": master_address, "network": NETWORK_NAME})
    except Exception as e:
        return fail("internal_error", 500, log_detail=f"master_address[{tenant_id}]: {e}")


@app.route("/wallet/<tenant_id>/info", methods=["GET"])
def wallet_info(tenant_id):
    err = auth_required()
    if err:
        return err
    bad = _require_tenant(tenant_id)
    if bad:
        return bad
    # Nao expoe descriptor (permite derivar enderecos/historico — privacidade).
    p = WalletPaths(tenant_id)
    provisioned = os.path.exists(p.descriptor)
    return jsonify({
        "tenant_id":      tenant_id,
        "provisioned":    provisioned,
        "network":        NETWORK_NAME,
        "depix_asset_id": DEPIX_ASSET_ID,
        "warning":        "mnemonic/descriptor nunca sao expostos via API",
    })


@app.route("/wallet/<tenant_id>/mnemonic/reveal", methods=["POST"])
def wallet_mnemonic_reveal(tenant_id):
    err = auth_required()
    if err:
        return err
    bad = _require_tenant(tenant_id)
    if bad:
        return bad
    # Non-custodial (ADR 0051): com {encrypted_seed, passphrase}, decifra o blob
    # e devolve o mnemonico SO a quem prova posse da passphrase. Sem passphrase
    # -> 400. (Superadmin nao revela seed alheia.) Sem o blob, cai no caminho
    # custodial (le o mnemonic.txt — compat enquanto o tenant nao migrou).
    data = request.get_json(silent=True) or {}
    encrypted_seed = data.get("encrypted_seed")
    passphrase = data.get("passphrase")
    try:
        if encrypted_seed is not None:
            if not passphrase or not isinstance(passphrase, str):
                return fail("passphrase obrigatoria para carteira non-custodial")
            try:
                mnemonic_str = crypto.decrypt_seed(encrypted_seed, passphrase)
            except crypto.InvalidPassphraseError:
                return fail("invalid_passphrase", 400)
        else:
            with wallet_lock(tenant_id):
                _, _, _, mnemonic_str = load_or_create_wallet(tenant_id)
        return jsonify({
            "tenant_id":   tenant_id,
            "mnemonic":    mnemonic_str,
            "word_count":  len(mnemonic_str.split()),
            "network":     NETWORK_NAME,
        })
    except Exception as e:
        return fail("internal_error", 500, log_detail=f"mnemonic_reveal[{tenant_id}]: {type(e).__name__}")


@app.route("/wallet/<tenant_id>/encrypt-seed", methods=["POST"])
def wallet_encrypt_seed(tenant_id):
    """Migracao custodial -> non-custodial (ADR 0051 Etapa 5). Le o mnemonic.txt
    atual + recebe a passphrase do usuario -> devolve o blob cifrado. NAO apaga
    o txt (a purga ocorre depois, com carencia). NAO loga passphrase/mnemonico."""
    err = auth_required()
    if err:
        return err
    bad = _require_tenant(tenant_id)
    if bad:
        return bad
    data = request.get_json(silent=True) or {}
    passphrase = data.get("passphrase")
    if not passphrase or not isinstance(passphrase, str):
        return fail("passphrase obrigatoria")
    try:
        with wallet_lock(tenant_id):
            _, _, descriptor_str, mnemonic_str = load_or_create_wallet(tenant_id)
        blob = crypto.encrypt_seed(mnemonic_str, passphrase)
        del mnemonic_str
        return jsonify({
            "tenant_id":   tenant_id,
            "encrypted_seed": blob,
            "descriptor":  descriptor_str,
            "network":     NETWORK_NAME,
        })
    except Exception as e:
        return fail("internal_error", 500, log_detail=f"encrypt_seed[{tenant_id}]: {type(e).__name__}")


@app.route("/wallet/<tenant_id>/rewrap", methods=["POST"])
def wallet_rewrap(tenant_id):
    """Troca a passphrase (ADR 0051). Decifra com a antiga, recifra com a nova.
    Nao toca on-chain. Sem passphrase antiga correta -> invalid_passphrase."""
    err = auth_required()
    if err:
        return err
    bad = _require_tenant(tenant_id)
    if bad:
        return bad
    data = request.get_json(silent=True) or {}
    encrypted_seed = data.get("encrypted_seed")
    old_passphrase = data.get("old_passphrase")
    new_passphrase = data.get("new_passphrase")
    if not isinstance(encrypted_seed, dict):
        return fail("encrypted_seed obrigatorio")
    if not old_passphrase or not new_passphrase:
        return fail("old_passphrase e new_passphrase obrigatorias")
    try:
        new_blob = crypto.rewrap_seed(encrypted_seed, old_passphrase, new_passphrase)
    except crypto.InvalidPassphraseError:
        return fail("invalid_passphrase", 400)
    except Exception as e:
        return fail("internal_error", 500, log_detail=f"rewrap[{tenant_id}]: {type(e).__name__}")
    return jsonify({"tenant_id": tenant_id, "encrypted_seed": new_blob, "network": NETWORK_NAME})


@app.route("/wallet/<tenant_id>/recover", methods=["POST"])
def wallet_recover(tenant_id):
    """Recuperacao por mnemonico (ADR 0051): usuario informa as 24 palavras +
    nova passphrase. So aceita se o mnemonico derivar o MESMO descriptor ja
    registrado da carteira (prova ser a carteira certa, sem mover fundos).
    Devolve o novo blob cifrado."""
    err = auth_required()
    if err:
        return err
    bad = _require_tenant(tenant_id)
    if bad:
        return bad
    data = request.get_json(silent=True) or {}
    mnemonic_in = data.get("mnemonic")
    new_passphrase = data.get("new_passphrase")
    if not mnemonic_in or not isinstance(mnemonic_in, str):
        return fail("mnemonic obrigatorio")
    if not new_passphrase or not isinstance(new_passphrase, str):
        return fail("new_passphrase obrigatoria")
    try:
        mnemonic_in = mnemonic_in.strip()
        try:
            signer = lwk.Signer(lwk.Mnemonic(mnemonic_in), get_network())
            derived_descriptor = str(signer.wpkh_slip77_descriptor())
        except Exception:
            return fail("mnemonic invalido")
        # Confere contra o descriptor registrado (sem mover fundos).
        wollet, expected_descriptor = load_watch_only(tenant_id)
        del wollet
        if derived_descriptor != expected_descriptor:
            return fail("mnemonic nao corresponde a esta carteira", 400)
        blob = crypto.encrypt_seed(mnemonic_in, new_passphrase)
        del mnemonic_in
        return jsonify({"tenant_id": tenant_id, "encrypted_seed": blob, "network": NETWORK_NAME})
    except Exception as e:
        return fail("internal_error", 500, log_detail=f"recover[{tenant_id}]: {type(e).__name__}")


@app.route("/wallet/<tenant_id>/setup-noncustodial", methods=["POST"])
def wallet_setup_noncustodial(tenant_id):
    """Provisiona uma carteira NON-CUSTODIAL no primeiro acesso (ADR 0051).

    mode=create: gera um mnemonico aleatorio (24 palavras).
    mode=import: usa o mnemonico de 24 palavras informado pelo usuario.

    Em AMBOS os casos a seed e cifrada com a passphrase do usuario e SO o
    descriptor (watch-only) e gravado no volume. O mnemonic.txt NUNCA e escrito
    — a seed em claro existe apenas como variavel local e e descartada. O
    mnemonico so volta na resposta no modo create (backup unico do usuario).
    """
    err = auth_required()
    if err:
        return err
    bad = _require_tenant(tenant_id)
    if bad:
        return bad
    data = request.get_json(silent=True) or {}
    mode = data.get("mode")
    passphrase = data.get("passphrase")
    mnemonic_in = data.get("mnemonic")

    if mode not in ("create", "import"):
        return fail("mode invalido (create|import)")
    if not passphrase or not isinstance(passphrase, str):
        return fail("passphrase obrigatoria")
    if mode == "import" and (not mnemonic_in or not isinstance(mnemonic_in, str)):
        return fail("mnemonic obrigatorio no modo import")

    try:
        with wallet_lock(tenant_id):
            p = WalletPaths(tenant_id)
            # Guard: nao sobrescreve carteira existente (apagaria acesso ao saldo).
            if os.path.exists(p.descriptor):
                return fail("carteira ja provisionada", 409)

            # Deriva o mnemonico EM MEMORIA.
            if mode == "create":
                mnemonic = lwk.Mnemonic.from_random(24)
            else:
                cleaned = mnemonic_in.strip()
                if len(cleaned.split()) != 24:
                    return fail("mnemonic invalido (deve ter 24 palavras)")
                try:
                    mnemonic = lwk.Mnemonic(cleaned)
                except Exception:
                    return fail("mnemonic invalido")

            mnemonic_str = str(mnemonic)
            signer = lwk.Signer(mnemonic, get_network())
            descriptor = signer.wpkh_slip77_descriptor()
            descriptor_str = str(descriptor)

            # Grava SO o descriptor (watch-only). NUNCA o mnemonic.txt.
            _write_secret(p.descriptor, descriptor_str)

            wollet = lwk.Wollet(get_network(), descriptor, p.dir)
            master_address = str(wollet.address(0).address())

            blob = crypto.encrypt_seed(mnemonic_str, passphrase)

        resp = {
            "tenant_id":      tenant_id,
            "encrypted_seed": blob,
            "descriptor":     descriptor_str,
            "master_address": master_address,
            "network":        NETWORK_NAME,
        }
        # Mnemonico so no create (backup unico). No import o usuario ja o tem.
        if mode == "create":
            resp["mnemonic"] = mnemonic_str
        del mnemonic_str
        logger.info(f"[{tenant_id}] Carteira non-custodial provisionada (mode={mode})")
        return jsonify(resp)
    except Exception as e:
        return fail("internal_error", 500, log_detail=f"setup_noncustodial[{tenant_id}]: {type(e).__name__}")


@app.route("/wallet/<tenant_id>/balance", methods=["GET"])
def wallet_balance(tenant_id):
    err = auth_required()
    if err:
        return err
    bad = _require_tenant(tenant_id)
    if bad:
        return bad
    try:
        do_sync = request.args.get("sync", "true").lower() != "false"
        lock = wallet_lock(tenant_id)
        # Quando sync=false, NAO bloqueia esperando o lock: se o monitor
        # esta segurando (porque ta no full_scan demorado), retorna o
        # saldo cached lendo a wallet em paralelo. balance() so le o cache
        # interno (nao toca rede), entao acesso concorrente eh seguro.
        acquired = lock.acquire(timeout=15 if do_sync else 1)
        try:
            # Watch-only (so descriptor): NUNCA auto-cria carteira. Consultar o
            # saldo de um tenant sem carteira deve falhar (404), nao provisionar
            # uma carteira custodial fantasma. Funciona p/ custodial e non-custodial.
            try:
                wollet, _ = load_watch_only(tenant_id)
            except FileNotFoundError:
                return fail("carteira nao provisionada", 404)
            if do_sync and acquired:
                sync_wallet(wollet, silent=True)
            bal = wollet.balance()
        finally:
            if acquired:
                lock.release()
        assets        = {}
        depix_balance = 0.0
        for asset_id, amount in bal.items():
            aid = str(asset_id)
            amt = satoshis_to_brl(amount)
            assets[aid] = {"satoshis": amount, "amount": amt, "is_depix": aid == DEPIX_ASSET_ID}
            if aid == DEPIX_ASSET_ID:
                depix_balance = amt
        return jsonify({
            "tenant_id":      tenant_id,
            "depix_balance":  depix_balance,
            "depix_asset_id": DEPIX_ASSET_ID,
            "all_assets":     assets,
            "network":        NETWORK_NAME,
        })
    except Exception as e:
        return fail("internal_error", 500, log_detail=f"balance[{tenant_id}]: {e}")


@app.route("/wallet/<tenant_id>/utxos", methods=["GET"])
def wallet_utxos(tenant_id):
    """Lista os UTXOs confidenciais da carteira com os blinding factors (abf/vbf).

    Necessario para o `start_quotes` do Sideswap (sondagem/swap DePix->L-USDt): a
    API exige {txid, vout, asset, value, asset_bf, value_bf} de cada input.

    SEGURANCA: abf/vbf sao dados sensiveis (revelam valor/asset de saidas
    confidenciais). Retornados so sob auth (auth_required) e NUNCA logados —
    seguem o mesmo cuidado do reveal de mnemonic. Watch-only: nao expoe chave.
    Filtro opcional `?asset=<id>` restringe ao asset (ex.: so DePix).
    """
    err = auth_required()
    if err:
        return err
    bad = _require_tenant(tenant_id)
    if bad:
        return bad
    try:
        asset_filter = request.args.get("asset")
        do_sync = request.args.get("sync", "true").lower() != "false"
        lock = wallet_lock(tenant_id)
        acquired = lock.acquire(timeout=15 if do_sync else 1)
        try:
            try:
                wollet, _ = load_watch_only(tenant_id)
            except FileNotFoundError:
                return fail("carteira nao provisionada", 404)
            if do_sync and acquired:
                sync_wallet(wollet, silent=True)
            wallet_utxos_list = wollet.utxos()
        finally:
            if acquired:
                lock.release()

        # API lwk 0.17: WalletTxOut.outpoint() -> {txid, vout}; .unblinded() ->
        # TxOutSecrets com .asset()/.value()/.asset_bf()/.value_bf(). Confirmar os
        # nomes exatos dos getters no PRIMEIRO rebuild (ver docs.rs/lwk_bindings) —
        # se algum diferir, ajustar aqui; a estrutura de retorno e estavel.
        items = []
        for u in wallet_utxos_list:
            outpoint = u.outpoint()
            secrets = u.unblinded()
            asset_id = str(secrets.asset())
            if asset_filter and asset_id != asset_filter:
                continue
            items.append({
                "txid":     str(outpoint.txid()),
                "vout":     outpoint.vout(),
                "asset":    asset_id,
                "value":    secrets.value(),          # satoshis
                "asset_bf": str(secrets.asset_bf()),  # asset blinding factor (hex)
                "value_bf": str(secrets.value_bf()),  # value blinding factor (hex)
                "is_depix": asset_id == DEPIX_ASSET_ID,
            })

        return jsonify({
            "tenant_id": tenant_id,
            "utxos":     items,
            "count":     len(items),
            "network":   NETWORK_NAME,
        })
    except Exception as e:
        return fail("internal_error", 500, log_detail=f"utxos[{tenant_id}]: {e}")


@app.route("/wallet/<tenant_id>/sign-pset", methods=["POST"])
def wallet_sign_pset(tenant_id):
    """Assina um PSET EXTERNO (recebido do Sideswap) com a chave do tenant.

    Usado no swap DePix->L-USDt: o Sideswap monta o PSET (get_quote), o tenant
    assina só os próprios inputs aqui, e o PSET assinado volta pro Sideswap
    (taker_sign), que finaliza e faz o broadcast. Diferente do /transfer, este
    endpoint NÃO constrói tx, NÃO finaliza e NÃO faz broadcast — só assina.

    Non-custodial (ADR 0051): exige {encrypted_seed, passphrase}. A passphrase
    nunca é logada nem persistida. Body: { pset: <base64>, encrypted_seed, passphrase }.
    """
    err = auth_required()
    if err:
        return err
    bad = _require_tenant(tenant_id)
    if bad:
        return bad

    data = request.get_json(silent=True) or {}
    pset_b64 = data.get("pset")
    encrypted_seed = data.get("encrypted_seed")
    passphrase = data.get("passphrase")

    if not pset_b64 or not isinstance(pset_b64, str):
        return fail("pset (base64) obrigatorio")
    if encrypted_seed is None:
        return fail("encrypted_seed obrigatorio (assinatura non-custodial)")
    if not passphrase or not isinstance(passphrase, str):
        return fail("passphrase obrigatoria para carteira non-custodial")

    with wallet_lock(tenant_id):
        try:
            # Carteira watch-only precisa existir (404 se não provisionada).
            try:
                wollet, _ = load_watch_only(tenant_id)
            except FileNotFoundError:
                return fail("carteira nao provisionada", 404)
            try:
                signer, _ = derive_signer_from_blob(encrypted_seed, passphrase)
            except crypto.InvalidPassphraseError:
                return fail("invalid_passphrase", 400)

            # Num PSET EXTERNO (do Sideswap), o signer só assina os inputs do
            # tenant se o PSET tiver os detalhes desses inputs (witness_utxo etc.).
            # `wollet.add_details(pset)` enriquece o PSET com o que a carteira
            # conhece — sem isso, o signer ignora inputs e o Sideswap rejeita com
            # "missing signature for input :N". Requer o wollet sincronizado para
            # reconhecer os UTXOs. (lwk_wollet: add_details "Add the PSET details
            # with respect to the wallet".)
            sync_wallet(wollet, silent=True)
            pset = lwk.Pset(pset_b64)
            wollet.add_details(pset)
            signed = signer.sign(pset)
            signed_b64 = str(signed)
        except Exception as e:
            return fail("falha ao assinar pset", 500, log_detail=f"sign-pset[{tenant_id}]: {e}")

    logger.info(f"[{tenant_id}] PSET de swap assinado")
    return jsonify({
        "tenant_id": tenant_id,
        "signed_pset": signed_b64,
        "network": NETWORK_NAME,
    })


@app.route("/wallet/<tenant_id>/address/new", methods=["POST"])
def new_address(tenant_id):
    err = auth_required()
    if err:
        return err
    bad = _require_tenant(tenant_id)
    if bad:
        return bad
    try:
        data  = request.get_json(silent=True) or {}
        user  = str(data.get("user", "user"))[:100]
        index = data.get("index", None)
        if index is not None:
            try:
                index = int(index)
                if index < 0:
                    return fail("index deve ser >= 0")
            except (ValueError, TypeError):
                return fail("index invalido")

        p = WalletPaths(tenant_id)
        with wallet_lock(tenant_id):
            # Watch-only: nunca auto-cria. 404 se a carteira nao existe.
            try:
                wollet, _ = load_watch_only(tenant_id)
            except FileNotFoundError:
                return fail("carteira nao provisionada", 404)
            sync_wallet(wollet, silent=True)
            addr_info = wollet.address(index)

        address    = str(addr_info.address())
        idx        = addr_info.index()
        label      = create_label(user)
        label_id   = uuid.uuid4().hex
        created_at = datetime.now(timezone.utc).isoformat()

        with state_lock(tenant_id):
            labels_data = load_labels(p)
            labels_data["by_label"][label_id] = {
                "label": label, "user": user, "address": address,
                "index": idx, "created_at": created_at,
            }
            labels_data["by_address"][address] = label_id
            save_labels(p, labels_data)

        logger.info(f"[{tenant_id}] Endereco gerado: label={label} index={idx}")
        return jsonify({
            "tenant_id": tenant_id, "address": address, "label": label,
            "user": user, "index": idx, "network": NETWORK_NAME, "created_at": created_at,
        })
    except Exception as e:
        return fail("internal_error", 500, log_detail=f"new_address[{tenant_id}]: {e}")


@app.route("/wallet/<tenant_id>/transfer", methods=["POST"])
def transfer(tenant_id):
    err = auth_required()
    if err:
        return err
    bad = _require_tenant(tenant_id)
    if bad:
        return bad

    data = request.get_json(silent=True)
    if not data:
        return fail("body JSON obrigatorio")

    asset_id = data.get("asset_id", DEPIX_ASSET_ID)
    fee_rate = data.get("fee_rate", 0.1)

    if not isinstance(asset_id, str) or len(asset_id) != 64 or not all(c in "0123456789abcdef" for c in asset_id.lower()):
        return fail("asset_id invalido")
    try:
        fee_rate = float(fee_rate)
    except (ValueError, TypeError):
        return fail("fee_rate invalido")
    if not (0 < fee_rate <= FEE_RATE_MAX):
        return fail(f"fee_rate fora da faixa (0, {FEE_RATE_MAX}]")

    # Suporta MULTIPLOS destinos no mesmo tx (rateio: liquido + taxa).
    # Aceita {recipients:[{to,amount},...]} OU legado {to,amount}.
    raw_recipients = data.get("recipients")
    if raw_recipients is None and data.get("to") is not None:
        raw_recipients = [{"to": data.get("to"), "amount": data.get("amount")}]
    if not isinstance(raw_recipients, list) or not raw_recipients:
        return fail("recipients obrigatorio (lista de {to, amount})")
    if len(raw_recipients) > 5:
        return fail("maximo 5 recipients por transacao")

    recipients = []
    for r in raw_recipients:
        if not isinstance(r, dict):
            return fail("recipient invalido")
        to = r.get("to")
        if not to or not isinstance(to, str):
            return fail("recipient sem 'to'")
        try:
            amt_sat = brl_to_satoshis(r.get("amount"))
        except ValueError as e:
            return fail(f"recipient '{to[:12]}...': {e}")
        try:
            addr = lwk.Address(to)
        except Exception:
            return fail(f"endereco invalido: {to[:20]}...")
        recipients.append({"to": to, "address": addr, "amount_sat": amt_sat})

    # Idempotencia POR TENANT.
    p = WalletPaths(tenant_id)
    idem_key = request.headers.get("Idempotency-Key")
    if idem_key:
        with state_lock(tenant_id):
            store = _load_idempotency(p)
            if idem_key in store:
                cached = store[idem_key]
                logger.info(f"[{tenant_id}] Transfer idempotente (replay): key={idem_key} txid={cached.get('txid')}")
                return jsonify({**cached, "idempotent_replay": True})

    # Non-custodial (ADR 0051): se o body traz {encrypted_seed, passphrase}, o
    # signer e derivado do blob em memoria (a seed NAO esta no disco). Senao,
    # caminho CUSTODIAL inalterado (signer do mnemonic.txt). A passphrase nunca
    # e logada nem persistida.
    encrypted_seed = data.get("encrypted_seed")
    passphrase = data.get("passphrase")
    non_custodial = encrypted_seed is not None

    with wallet_lock(tenant_id):
        try:
            if non_custodial:
                if not passphrase or not isinstance(passphrase, str):
                    return fail("passphrase obrigatoria para carteira non-custodial")
                wollet, _ = load_watch_only(tenant_id)
                try:
                    signer, _ = derive_signer_from_blob(encrypted_seed, passphrase)
                except crypto.InvalidPassphraseError:
                    return fail("invalid_passphrase", 400)
            else:
                wollet, signer, _, _ = load_or_create_wallet(tenant_id)
            if not sync_wallet(wollet, silent=True):
                return fail("carteira indisponivel: sync falhou", 503)

            builder = lwk.TxBuilder(get_network())
            for r in recipients:
                builder.add_recipient(r["address"], r["amount_sat"], asset_id)
            builder.fee_rate(fee_rate * 1000)

            pset = builder.finish(wollet)
            pset = signer.sign(pset)

            fee_sat = None
            try:
                fee_sat = wollet.pset_details(pset).balance().fee()
            except Exception as e:
                logger.warning(f"[{tenant_id}] Nao conseguiu ler fee: {e}")

            pset = wollet.finalize(pset)
            tx   = pset.extract_tx()

            txid, used_url = broadcast_with_fallback(tx)
        except Exception as e:
            # Categoriza erros comuns pra mensagem amigavel pro client.
            # Detalhe completo vai pro log (vem da lib lwk).
            err_str = str(e)
            if "InsufficientFunds" in err_str:
                # Identifica se eh L-BTC (asset 6f0279...) — fee de rede.
                # Asset DePix: 02f22f...df5189
                if "6f0279" in err_str.lower():
                    return fail("insufficient_lbtc", 400, log_detail=f"transfer[{tenant_id}]: {e}")
                return fail("insufficient_depix", 400, log_detail=f"transfer[{tenant_id}]: {e}")
            if "RecipientsAmountZero" in err_str or "BelowDust" in err_str:
                return fail("amount_too_small", 400, log_detail=f"transfer[{tenant_id}]: {e}")
            return fail("falha ao transferir", 500, log_detail=f"transfer[{tenant_id}]: {e}")

    accepted = verify_in_mempool(txid)

    result = {
        "success":       True,
        "tenant_id":     tenant_id,
        "txid":          txid,
        "recipients":    [{"to": r["to"], "amount_brl": satoshis_to_brl(r["amount_sat"]), "amount_satoshis": r["amount_sat"]} for r in recipients],
        "asset_id":      asset_id,
        "fee_satoshis":  fee_sat,
        "accepted":      accepted,
        "broadcast_via": used_url,
        "explorer_url":  f"https://blockstream.info/liquid/tx/{txid}",
    }

    if idem_key:
        with state_lock(tenant_id):
            store = _load_idempotency(p)
            store[idem_key] = result
            _save_idempotency(p, store)

    logger.info(f"[{tenant_id}] Transacao enviada: txid={txid} | fee={fee_sat} sat | accepted={accepted}")
    return jsonify(result)


@app.route("/wallet/<tenant_id>/transactions", methods=["GET"])
def transactions(tenant_id):
    err = auth_required()
    if err:
        return err
    bad = _require_tenant(tenant_id)
    if bad:
        return bad
    try:
        try:
            limit = int(request.args.get("limit", 20))
        except (ValueError, TypeError):
            return fail("limit invalido")
        limit = max(1, min(limit, 100))

        with wallet_lock(tenant_id):
            # Watch-only: nunca auto-cria. 404 se a carteira nao existe.
            try:
                wollet, _ = load_watch_only(tenant_id)
            except FileNotFoundError:
                return fail("carteira nao provisionada", 404)
            sync_wallet(wollet, silent=True)
            txs = wollet.transactions()
        tip_height = get_tip_height()
        result     = []

        for tx in txs[:limit]:
            tx_height     = tx.height() if tx.height() else 0
            confirmations = max(0, tip_height - tx_height + 1) if (tx_height and tx_height > 0 and tip_height) else 0
            tx_data = {
                "txid":          str(tx.txid()),
                "height":        tx_height,
                "timestamp":     tx.timestamp(),
                "fee_satoshis":  tx.fee(),
                "confirmations": confirmations,
                "status":        "confirmed" if confirmations >= CONFIRMATIONS_REQUIRED else "pending",
            }
            try:
                balances = {}
                for asset_id, amount in tx.balance().items():
                    aid = str(asset_id)
                    balances[aid] = {
                        "satoshis": amount,
                        "amount":   satoshis_to_brl(amount),
                        "is_depix": aid == DEPIX_ASSET_ID,
                    }
                tx_data["balance"] = balances
            except Exception:
                tx_data["balance"] = {}
            result.append(tx_data)

        return jsonify({"tenant_id": tenant_id, "count": len(result), "transactions": result})
    except Exception as e:
        return fail("internal_error", 500, log_detail=f"transactions[{tenant_id}]: {e}")


@app.route("/webhook/test", methods=["POST"])
def webhook_test():
    err = auth_required()
    if err:
        return err
    if not WEBHOOK_URL:
        return fail("WEBHOOK_URL nao configurada")

    now           = datetime.now(timezone.utc).isoformat()
    label_example = {"label": "luan_a3f9c2b1", "user": "luan", "address": "lq1qqteste...", "index": 0, "created_at": now}
    base = {
        "event":                  "webhook_test",
        "tenant_id":              "00000000-0000-0000-0000-000000000000",
        "required_confirmations": CONFIRMATIONS_REQUIRED,
        "network":                NETWORK_NAME,
        "txid":                   "teste-000000000000000000000000000000000000000000000000000000000000",
        "explorer_url":           "https://blockstream.info/liquid",
        "detected_at":            now,
        "block_height":           None,
        "block_timestamp":        None,
        "fee_satoshis":           47,
        "depix":                  {"asset_id": DEPIX_ASSET_ID, "amount": 123.45, "currency": "BRL", "formatted": "R$ 123,45"},
        "all_assets":             {DEPIX_ASSET_ID: {"amount": 123.45, "satoshis": 12345000000, "is_depix": True}},
        "label":                  label_example,
    }

    pending   = dict(base, status="pending",   confirmations=0,                      message="Teste PENDING")
    confirmed = dict(base, status="confirmed", confirmations=CONFIRMATIONS_REQUIRED, message="Teste CONFIRMED")

    p_ok = send_webhook(pending)
    c_ok = send_webhook(confirmed)
    return jsonify({"sent": True, "pending_ok": p_ok, "confirmed_ok": c_ok, "webhook_url": WEBHOOK_URL})


# ── Config / boot ─────────────────────────────────────────────────────────────

def require_config():
    """Fail-closed: aborta o boot se config insegura."""
    if not API_KEY:
        raise SystemExit("FATAL: API_KEY vazia — auth desligada nao e permitida. Defina API_KEY.")
    if WEBHOOK_URL and not WEBHOOK_URL.startswith("https://") and "localhost" not in WEBHOOK_URL:
        logger.warning("WEBHOOK_URL nao e https — secret/payload trafegam em claro.")


# Roda no import tambem (gunicorn nao chama __main__).
require_config()
if MONITOR_ENABLED:
    threading.Thread(target=monitor_loop, daemon=True, name="DepositMonitor").start()
else:
    logger.info("Monitor de depositos DESABILITADO (MONITOR_ENABLED=false) — fase 1")

if __name__ == "__main__":
    logger.info("Iniciando LWK DePix Wallet API v7 multi-tenant (dev server)...")
    app.run(host="0.0.0.0", port=5000, debug=False)
