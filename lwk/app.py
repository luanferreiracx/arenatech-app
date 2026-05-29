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
import json
import time
import uuid
import hmac
import hashlib
import logging
import threading
import requests
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from datetime import datetime, timezone
from flask import Flask, request, jsonify
from flask_cors import CORS
import lwk

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
# CORS restrito: CSV de origens permitidas (default: so localhost do dashboard)
CORS_ORIGINS           = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5000").split(",") if o.strip()]
# Teto de seguranca pro fee_rate (sat/vB) — evita queimar fundos em fee absurda
FEE_RATE_MAX           = float(os.environ.get("FEE_RATE_MAX", "1.0"))

CORS(app, origins=CORS_ORIGINS)

SAT_PER_COIN = Decimal("100000000")  # 1e8 — precision 8

os.makedirs(WALLET_DATA_DIR, exist_ok=True)
DESCRIPTOR_FILE  = os.path.join(WALLET_DATA_DIR, "descriptor.txt")
MNEMONIC_FILE    = os.path.join(WALLET_DATA_DIR, "mnemonic.txt")
SEEN_TXS_FILE    = os.path.join(WALLET_DATA_DIR, "seen_txids.json")
LABELS_FILE      = os.path.join(WALLET_DATA_DIR, "labels.json")
PENDING_TXS_FILE = os.path.join(WALLET_DATA_DIR, "pending_txids.json")
IDEMPOTENCY_FILE = os.path.join(WALLET_DATA_DIR, "idempotency.json")

# Esploras pra broadcast/sync — primeiro env ESPLORA_URL (se setado), depois defaults.
ESPLORA_URLS = [u for u in [ESPLORA_URL.rstrip("/") if ESPLORA_URL else None,
                            "https://liquid.network/api",
                            "https://esplora.blockstream.com/liquid/api"] if u]
# dedup preservando ordem
ESPLORA_URLS = list(dict.fromkeys(ESPLORA_URLS))

# Lock global: serializa acesso a carteira (build/sign/broadcast) e ao cache
# em disco do lwk. Sem isso, /transfer concorrentes podem gastar o mesmo UTXO
# (double-spend) e o monitor pode corromper o cache lendo durante escrita.
WALLET_LOCK = threading.Lock()
# Lock separado pros arquivos JSON de estado (labels/seen/pending/idempotency).
STATE_LOCK = threading.Lock()


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

def load_or_create_wallet():
    network = get_network()
    if os.path.exists(DESCRIPTOR_FILE) and os.path.exists(MNEMONIC_FILE):
        with open(DESCRIPTOR_FILE) as f:
            descriptor_str = f.read().strip()
        with open(MNEMONIC_FILE) as f:
            mnemonic_str = f.read().strip()
        signer = lwk.Signer(lwk.Mnemonic(mnemonic_str), network)
        wollet = lwk.Wollet(network, lwk.WolletDescriptor(descriptor_str), WALLET_DATA_DIR)
        return wollet, signer, descriptor_str, mnemonic_str
    else:
        mnemonic     = lwk.Mnemonic.from_random(24)
        mnemonic_str = str(mnemonic)
        signer       = lwk.Signer(mnemonic, network)
        descriptor   = signer.wpkh_slip77_descriptor()
        descriptor_str = str(descriptor)
        # Grava secrets com permissao restrita (0600) ANTES de escrever conteudo.
        _write_secret(MNEMONIC_FILE, mnemonic_str)
        _write_secret(DESCRIPTOR_FILE, descriptor_str)
        wollet = lwk.Wollet(network, descriptor, WALLET_DATA_DIR)
        logger.info("Nova carteira criada.")
        return wollet, signer, descriptor_str, mnemonic_str


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


def get_tip_height():
    for url in ESPLORA_URLS:
        try:
            return lwk.EsploraClient(url, get_network()).tip().height()
        except Exception:
            pass
    return None


def sync_wallet(wollet, silent=False):
    """Sincroniza carteira. Retorna True se algum Esplora respondeu."""
    for url in ESPLORA_URLS:
        try:
            client = lwk.EsploraClient(url, get_network())
            update = client.full_scan(wollet)
            if update:
                wollet.apply_update(update)
            if not silent:
                logger.info(f"Carteira sincronizada via {url}")
            return True
        except Exception as e:
            logger.warning(f"Sync falhou [{url}]: {e}")
    logger.error("Todos os servidores Esplora falharam.")
    return False


# ── Labels ────────────────────────────────────────────────────────────────────

def load_labels():
    return _load_json(LABELS_FILE, {"by_label": {}, "by_address": {}})


def save_labels(data):
    _atomic_write_json(LABELS_FILE, data)


def create_label(user):
    safe = "".join(c for c in user.lower() if c.isalnum() or c == "_")[:30] or "user"
    return f"{safe}_{uuid.uuid4().hex[:8]}"


def find_label_by_address(address):
    data = load_labels()
    lid  = data["by_address"].get(address)
    return data["by_label"].get(lid) if lid else None


# ── Pending / seen ──────────────────────────────────────────────────────────

def load_pending():
    return _load_json(PENDING_TXS_FILE, {})


def save_pending(data):
    _atomic_write_json(PENDING_TXS_FILE, data)


def load_seen_txids():
    return set(_load_json(SEEN_TXS_FILE, []))


def save_seen_txids(seen):
    _atomic_write_json(SEEN_TXS_FILE, list(seen))


# ── Idempotencia ──────────────────────────────────────────────────────────────

def _load_idempotency():
    return _load_json(IDEMPOTENCY_FILE, {})


def _save_idempotency(data):
    _atomic_write_json(IDEMPOTENCY_FILE, data)


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
        # Bearer estatico (compat) + assinatura do corpo (integridade/origem).
        headers["X-Webhook-Secret"] = WEBHOOK_SECRET
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


def build_payload(txid, tx, depix_amount, all_assets, label_info, status, tip_height=None):
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


def extract_label_from_tx(tx):
    try:
        for out in (tx.outputs() or []):
            if out is None:
                continue
            try:
                found = find_label_by_address(str(out.address()))
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

def monitor_loop():
    logger.info(
        f"Monitor iniciado - intervalo: {MONITOR_INTERVAL}s | "
        f"confirmacoes: {CONFIRMATIONS_REQUIRED} | "
        f"webhook: {WEBHOOK_URL or 'NAO CONFIGURADO'}"
    )
    time.sleep(10)
    seen_txids = load_seen_txids()

    while True:
        try:
            with WALLET_LOCK:
                wollet, _, _, _ = load_or_create_wallet()
                sync_wallet(wollet, silent=True)
                tip_height = get_tip_height()
                txs        = wollet.transactions()

            pending = load_pending()

            for tx in txs:
                txid = str(tx.txid())
                depix_received, all_assets, any_received = get_tx_assets(tx)

                # So nos interessa DEPOSITO de DePix. Tx que so envia (balance
                # negativo) ou recebe outro asset nao dispara webhook falso.
                if depix_received <= 0:
                    if txid not in seen_txids:
                        seen_txids.add(txid)
                        save_seen_txids(seen_txids)
                    continue

                tx_height     = tx.height() if tx.height() else 0
                confirmations = max(0, tip_height - tx_height + 1) if (tx_height and tx_height > 0 and tip_height) else 0
                is_confirmed  = confirmations >= CONFIRMATIONS_REQUIRED
                label_info    = extract_label_from_tx(tx)

                assets_log = ", ".join(
                    f"{v['amount']} {'DePix' if k == DEPIX_ASSET_ID else k[:8]+'...'}"
                    for k, v in all_assets.items() if v["satoshis"] > 0
                )

                if txid not in seen_txids:
                    if is_confirmed:
                        ok = send_webhook(build_payload(txid, tx, depix_received, all_assets, label_info, "confirmed", tip_height))
                        if ok:
                            logger.info(f"DEPOSITO confirmado: {assets_log} | txid={txid} | conf={confirmations}")
                            seen_txids.add(txid)
                            save_seen_txids(seen_txids)
                        # se webhook falhou: NAO marca seen — retenta no proximo ciclo
                    else:
                        ok = send_webhook(build_payload(txid, tx, depix_received, all_assets, label_info, "pending", tip_height))
                        # pending sempre entra em seen+pending pra confirmar depois,
                        # mesmo se o webhook pending falhar (o confirmed e o que importa).
                        seen_txids.add(txid)
                        save_seen_txids(seen_txids)
                        pending[txid] = {
                            "depix_amount": depix_received,
                            "all_assets":   all_assets,
                            "label_info":   label_info,
                            "first_seen":   datetime.now(timezone.utc).isoformat(),
                            "confirmed_sent": False,
                        }
                        save_pending(pending)
                        if ok:
                            logger.info(f"DEPOSITO pendente: {assets_log} | txid={txid} | conf={confirmations}/{CONFIRMATIONS_REQUIRED}")

                elif txid in pending and not pending[txid].get("confirmed_sent"):
                    if is_confirmed:
                        p  = pending[txid]
                        ok = send_webhook(build_payload(txid, tx, p["depix_amount"], p["all_assets"], p["label_info"], "confirmed", tip_height))
                        if ok:
                            logger.info(f"DEPOSITO confirmado: {assets_log} | txid={txid} | conf={confirmations}")
                            p["confirmed_sent"] = True
                            pending[txid] = p
                            save_pending(pending)
                        # se falhou: mantem em pending, retenta proximo ciclo
                    else:
                        logger.info(f"Aguardando confirmacoes: txid={txid} | conf={confirmations}/{CONFIRMATIONS_REQUIRED}")

            # Limpa pending ja confirmados E em seen (evita crescer infinito)
            pending = {k: v for k, v in pending.items() if not v.get("confirmed_sent")}
            save_pending(pending)

        except Exception as e:
            logger.error(f"Erro no monitor: {e}")

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

@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "service": "LWK DePix Wallet API",
        "version": "6.0.0",
        "network": NETWORK_NAME,
        "monitor": {
            "interval_seconds":       MONITOR_INTERVAL,
            "confirmations_required": CONFIRMATIONS_REQUIRED,
            "webhook_configured":     bool(WEBHOOK_URL),
        },
        "endpoints": [
            "GET  /health",
            "GET  /status",
            "POST /address/new    body: {user, index?}",
            "GET  /address/list   ?user=filtro",
            "GET  /balance",
            "POST /transfer       body: {to, amount, fee_rate?, asset_id?}  header: Idempotency-Key",
            "GET  /transactions   ?limit=20",
            "POST /webhook/test",
            "GET  /wallet/info",
        ]
    })


@app.route("/health", methods=["GET"])
def health():
    """Probe sem auth: 200 so se carteira carrega e algum Esplora responde."""
    try:
        tip = get_tip_height()
        if tip is None:
            return jsonify({"status": "degraded", "reason": "esplora_unreachable"}), 503
        with WALLET_LOCK:
            load_or_create_wallet()
        return jsonify({"status": "ok", "tip_height": tip, "network": NETWORK_NAME})
    except Exception as e:
        logger.error(f"Health check falhou: {e}")
        return jsonify({"status": "down"}), 503


@app.route("/status", methods=["GET"])
def status():
    err = auth_required()
    if err:
        return err
    try:
        with WALLET_LOCK:
            wollet, _, descriptor_str, _ = load_or_create_wallet()
        tip     = get_tip_height()
        pending = load_pending()
        return jsonify({
            "status":                 "ok",
            "network":                NETWORK_NAME,
            "esplora_urls":           ESPLORA_URLS,
            "depix_asset_id":         DEPIX_ASSET_ID,
            "webhook_configured":     bool(WEBHOOK_URL),
            "monitor_interval_s":     MONITOR_INTERVAL,
            "confirmations_required": CONFIRMATIONS_REQUIRED,
            "current_block_height":   tip,
            "pending_deposits":       len(pending),
        })
    except Exception as e:
        return fail("internal_error", 500, log_detail=str(e))


@app.route("/address/new", methods=["POST"])
def new_address():
    err = auth_required()
    if err:
        return err
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

        with WALLET_LOCK:
            wollet, _, _, _ = load_or_create_wallet()
            sync_wallet(wollet, silent=True)
            addr_info = wollet.address(index)

        address    = str(addr_info.address())
        idx        = addr_info.index()
        label      = create_label(user)
        label_id   = uuid.uuid4().hex
        created_at = datetime.now(timezone.utc).isoformat()

        with STATE_LOCK:
            labels_data = load_labels()
            labels_data["by_label"][label_id] = {
                "label":      label,
                "user":       user,
                "address":    address,
                "index":      idx,
                "created_at": created_at,
            }
            labels_data["by_address"][address] = label_id
            save_labels(labels_data)

        logger.info(f"Endereco gerado: label={label} index={idx}")
        return jsonify({
            "address":    address,
            "label":      label,
            "user":       user,
            "index":      idx,
            "network":    NETWORK_NAME,
            "created_at": created_at,
        })
    except Exception as e:
        return fail("internal_error", 500, log_detail=f"new_address: {e}")


@app.route("/address/list", methods=["GET"])
def address_list():
    err = auth_required()
    if err:
        return err
    try:
        labels_data = load_labels()
        items       = list(labels_data["by_label"].values())
        user_filter = request.args.get("user")
        if user_filter:
            items = [i for i in items if i.get("user") == user_filter]
        return jsonify({"count": len(items), "addresses": items})
    except Exception as e:
        return fail("internal_error", 500, log_detail=str(e))


@app.route("/balance", methods=["GET"])
def balance():
    err = auth_required()
    if err:
        return err
    try:
        with WALLET_LOCK:
            wollet, _, _, _ = load_or_create_wallet()
            if request.args.get("sync", "true").lower() != "false":
                sync_wallet(wollet, silent=True)
            bal = wollet.balance()
        assets        = {}
        depix_balance = 0.0
        for asset_id, amount in bal.items():
            aid = str(asset_id)
            amt = satoshis_to_brl(amount)
            assets[aid] = {"satoshis": amount, "amount": amt, "is_depix": aid == DEPIX_ASSET_ID}
            if aid == DEPIX_ASSET_ID:
                depix_balance = amt
        return jsonify({
            "depix_balance":  depix_balance,
            "depix_asset_id": DEPIX_ASSET_ID,
            "all_assets":     assets,
            "network":        NETWORK_NAME,
        })
    except Exception as e:
        return fail("internal_error", 500, log_detail=f"balance: {e}")


@app.route("/transfer", methods=["POST"])
def transfer():
    err = auth_required()
    if err:
        return err

    data = request.get_json(silent=True)
    if not data:
        return fail("body JSON obrigatorio")

    to_address = data.get("to")
    asset_id   = data.get("asset_id", DEPIX_ASSET_ID)
    fee_rate   = data.get("fee_rate", 0.1)

    if not to_address or not isinstance(to_address, str):
        return fail("campo 'to' obrigatorio")
    # asset_id deve ser 64-hex
    if not isinstance(asset_id, str) or len(asset_id) != 64 or not all(c in "0123456789abcdef" for c in asset_id.lower()):
        return fail("asset_id invalido")
    # fee_rate: rejeita <=0 e acima do teto (evita queimar fundos)
    try:
        fee_rate = float(fee_rate)
    except (ValueError, TypeError):
        return fail("fee_rate invalido")
    if not (0 < fee_rate <= FEE_RATE_MAX):
        return fail(f"fee_rate fora da faixa (0, {FEE_RATE_MAX}]")
    # amount -> satoshis com Decimal
    try:
        amount_sat = brl_to_satoshis(data.get("amount"))
    except ValueError as e:
        return fail(str(e))
    # valida endereco antes de qualquer operacao cara
    try:
        address = lwk.Address(to_address)
    except Exception:
        return fail("endereco invalido")

    # Idempotencia: mesma key -> mesmo txid, nunca transfere 2x.
    idem_key = request.headers.get("Idempotency-Key")
    if idem_key:
        with STATE_LOCK:
            store = _load_idempotency()
            if idem_key in store:
                cached = store[idem_key]
                logger.info(f"Transfer idempotente (replay): key={idem_key} txid={cached.get('txid')}")
                return jsonify({**cached, "idempotent_replay": True})

    # Serializa TODO o fluxo critico: sync + build + sign + broadcast.
    with WALLET_LOCK:
        try:
            wollet, signer, _, _ = load_or_create_wallet()
            # Sync SINCRONO — aborta se nenhum Esplora respondeu (nao envia
            # sobre estado velho que poderia gastar UTXO ja gasto).
            if not sync_wallet(wollet, silent=True):
                return fail("carteira indisponivel: sync falhou", 503)

            builder = lwk.TxBuilder(get_network())
            builder.add_recipient(address, amount_sat, asset_id)
            builder.fee_rate(fee_rate * 1000)

            pset = builder.finish(wollet)
            pset = signer.sign(pset)

            fee_sat = None
            try:
                fee_sat = wollet.pset_details(pset).balance().fee()
            except Exception as e:
                logger.warning(f"Nao conseguiu ler fee: {e}")

            pset = wollet.finalize(pset)
            tx   = pset.extract_tx()

            txid, used_url = broadcast_with_fallback(tx)
        except Exception as e:
            return fail("falha ao transferir", 500, log_detail=f"transfer: {e}")

    # Verifica aceitacao fora do lock (read-only).
    accepted = verify_in_mempool(txid)

    result = {
        "success":         True,
        "txid":            txid,
        "to":              to_address,
        "amount_brl":      satoshis_to_brl(amount_sat),
        "amount_satoshis": amount_sat,
        "asset_id":        asset_id,
        "fee_satoshis":    fee_sat,
        "accepted":        accepted,
        "broadcast_via":   used_url,
        "explorer_url":    f"https://blockstream.info/liquid/tx/{txid}",
    }

    if idem_key:
        with STATE_LOCK:
            store = _load_idempotency()
            store[idem_key] = result
            _save_idempotency(store)

    logger.info(f"Transacao enviada: txid={txid} | fee={fee_sat} sat | sat={amount_sat} | accepted={accepted}")
    return jsonify(result)


@app.route("/transactions", methods=["GET"])
def transactions():
    err = auth_required()
    if err:
        return err
    try:
        try:
            limit = int(request.args.get("limit", 20))
        except (ValueError, TypeError):
            return fail("limit invalido")
        limit = max(1, min(limit, 100))  # clamp 1..100

        with WALLET_LOCK:
            wollet, _, _, _ = load_or_create_wallet()
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

        return jsonify({"count": len(result), "transactions": result})
    except Exception as e:
        return fail("internal_error", 500, log_detail=f"transactions: {e}")


@app.route("/wallet/info", methods=["GET"])
def wallet_info():
    err = auth_required()
    if err:
        return err
    # Nao expoe mais o descriptor (permite derivar enderecos/historico — privacidade).
    return jsonify({
        "network":        NETWORK_NAME,
        "depix_asset_id": DEPIX_ASSET_ID,
        "warning":        "mnemonic/descriptor nunca sao expostos via API",
    })


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
threading.Thread(target=monitor_loop, daemon=True, name="DepositMonitor").start()

if __name__ == "__main__":
    logger.info("Iniciando LWK DePix Wallet API v6 (dev server)...")
    app.run(host="0.0.0.0", port=5000, debug=False)
