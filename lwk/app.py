"""
LWK Liquid Wallet API - Depix Wallet v5
- Labels por usuario
- Webhook para qualquer ativo recebido (nao so Depix)
- Webhook imediato (pending) + confirmado (2 confirmacoes)
- Fee em satoshis no retorno da transferencia
- Log limpo: sync silencioso, log so em movimentacoes
"""

import os
import json
import time
import uuid
import logging
import threading
import requests
from datetime import datetime, timezone
from flask import Flask, request, jsonify
from flask_cors import CORS
import lwk

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Configuracoes
WALLET_DATA_DIR        = os.environ.get("WALLET_DATA_DIR", "/app/wallet_data")
NETWORK_NAME           = os.environ.get("NETWORK", "mainnet")
ESPLORA_URL            = os.environ.get("ESPLORA_URL", "https://liquid.network/api")
API_KEY                = os.environ.get("API_KEY", "")
DEPIX_ASSET_ID         = os.environ.get("DEPIX_ASSET_ID", "02f22f8d9c76ab41661a2729e4752e2c5d1a263012141b86ea98af5472df5189")
WEBHOOK_URL            = os.environ.get("WEBHOOK_URL", "")
WEBHOOK_SECRET         = os.environ.get("WEBHOOK_SECRET", "")
MONITOR_INTERVAL       = int(os.environ.get("MONITOR_INTERVAL", "120"))
CONFIRMATIONS_REQUIRED = int(os.environ.get("CONFIRMATIONS_REQUIRED", "2"))

os.makedirs(WALLET_DATA_DIR, exist_ok=True)
DESCRIPTOR_FILE  = os.path.join(WALLET_DATA_DIR, "descriptor.txt")
MNEMONIC_FILE    = os.path.join(WALLET_DATA_DIR, "mnemonic.txt")
SEEN_TXS_FILE    = os.path.join(WALLET_DATA_DIR, "seen_txids.json")
LABELS_FILE      = os.path.join(WALLET_DATA_DIR, "labels.json")
PENDING_TXS_FILE = os.path.join(WALLET_DATA_DIR, "pending_txids.json")

ESPLORA_URLS = [
    "https://liquid.network/api",
    "https://esplora.blockstream.com/liquid/api",
]


# ── Rede ──────────────────────────────────────────────────────────────────────

def get_network():
    if NETWORK_NAME == "testnet":
        return lwk.Network.testnet()
    return lwk.Network.mainnet()


# ── Auth ──────────────────────────────────────────────────────────────────────

def auth_required():
    if not API_KEY:
        return None
    if request.headers.get("X-API-Key", "") != API_KEY:
        return jsonify({"error": "Unauthorized"}), 401
    return None


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
        with open(MNEMONIC_FILE, "w") as f:
            f.write(mnemonic_str)
        with open(DESCRIPTOR_FILE, "w") as f:
            f.write(descriptor_str)
        wollet = lwk.Wollet(network, descriptor, WALLET_DATA_DIR)
        logger.info("Nova carteira criada.")
        return wollet, signer, descriptor_str, mnemonic_str


def get_tip_height():
    for url in ESPLORA_URLS:
        try:
            return lwk.EsploraClient(url, get_network()).tip().height()
        except Exception:
            pass
    return None


def sync_wallet(wollet, silent=False):
    """Sincroniza carteira. silent=True suprime log de sucesso."""
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


def sync_wallet_async(wollet, silent=False):
    t = threading.Thread(target=sync_wallet, args=(wollet, silent), daemon=True)
    t.start()
    t.join(timeout=15)


# ── Labels ────────────────────────────────────────────────────────────────────

def load_labels():
    if os.path.exists(LABELS_FILE):
        with open(LABELS_FILE) as f:
            return json.load(f)
    return {"by_label": {}, "by_address": {}}


def save_labels(data):
    with open(LABELS_FILE, "w") as f:
        json.dump(data, f, indent=2)


def create_label(user):
    safe = "".join(c for c in user.lower() if c.isalnum() or c == "_")[:30] or "user"
    return f"{safe}_{uuid.uuid4().hex[:8]}"


def find_label_by_address(address):
    data = load_labels()
    lid  = data["by_address"].get(address)
    return data["by_label"].get(lid) if lid else None


# ── Pending ───────────────────────────────────────────────────────────────────

def load_pending():
    if os.path.exists(PENDING_TXS_FILE):
        with open(PENDING_TXS_FILE) as f:
            return json.load(f)
    return {}


def save_pending(data):
    with open(PENDING_TXS_FILE, "w") as f:
        json.dump(data, f, indent=2)


def load_seen_txids():
    if os.path.exists(SEEN_TXS_FILE):
        with open(SEEN_TXS_FILE) as f:
            return set(json.load(f))
    return set()


def save_seen_txids(seen):
    with open(SEEN_TXS_FILE, "w") as f:
        json.dump(list(seen), f)


# ── Webhook ───────────────────────────────────────────────────────────────────

def send_webhook(payload):
    if not WEBHOOK_URL:
        return
    headers = {"Content-Type": "application/json"}
    if WEBHOOK_SECRET:
        headers["X-Webhook-Secret"] = WEBHOOK_SECRET
    try:
        resp = requests.post(WEBHOOK_URL, json=payload, headers=headers, timeout=10)
        logger.info(f"Webhook [{payload.get('status')}] -> {resp.status_code} | txid={payload.get('txid')}")
    except Exception as e:
        logger.error(f"Erro webhook: {e}")


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
            amount_decimal = amount / 100_000_000
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
            wollet, _, _, _ = load_or_create_wallet()
            sync_wallet(wollet, silent=True)   # silencioso — so loga em movimentacao
            tip_height = get_tip_height()
            txs        = wollet.transactions()
            new_seen   = set(seen_txids)
            pending    = load_pending()

            for tx in txs:
                txid                              = str(tx.txid())
                depix_received, all_assets, any_received = get_tx_assets(tx)

                # Ignora TXs sem nenhum ativo recebido
                if not any_received:
                    new_seen.add(txid)
                    continue

                tx_height     = tx.height() if tx.height() else 0
                confirmations = max(0, tip_height - tx_height + 1) if (tx_height and tx_height > 0 and tip_height) else 0
                is_confirmed  = confirmations >= CONFIRMATIONS_REQUIRED
                label_info    = extract_label_from_tx(tx)

                assets_log = ", ".join(
                    f"{v['amount']} {'Depix' if k == DEPIX_ASSET_ID else k[:8]+'...'}"
                    for k, v in all_assets.items() if v["satoshis"] > 0
                )

                if txid not in seen_txids:
                    new_seen.add(txid)

                    if is_confirmed:
                        logger.info(f"DEPOSITO confirmado: {assets_log} | txid={txid} | conf={confirmations}")
                        send_webhook(build_payload(txid, tx, depix_received, all_assets, label_info, "confirmed", tip_height))
                    else:
                        logger.info(f"DEPOSITO pendente: {assets_log} | txid={txid} | conf={confirmations}/{CONFIRMATIONS_REQUIRED}")
                        send_webhook(build_payload(txid, tx, depix_received, all_assets, label_info, "pending", tip_height))
                        pending[txid] = {
                            "depix_amount": depix_received,
                            "all_assets":   all_assets,
                            "label_info":   label_info,
                            "first_seen":   datetime.now(timezone.utc).isoformat(),
                        }

                elif txid in pending:
                    if is_confirmed:
                        logger.info(f"DEPOSITO confirmado: {assets_log} | txid={txid} | conf={confirmations}")
                        p = pending[txid]
                        send_webhook(build_payload(txid, tx, p["depix_amount"], p["all_assets"], p["label_info"], "confirmed", tip_height))
                        del pending[txid]
                    else:
                        logger.info(f"Aguardando confirmacoes: txid={txid} | conf={confirmations}/{CONFIRMATIONS_REQUIRED}")

            seen_txids = new_seen
            save_seen_txids(seen_txids)
            save_pending(pending)

        except Exception as e:
            logger.error(f"Erro no monitor: {e}")

        time.sleep(MONITOR_INTERVAL)


# ── Rotas ─────────────────────────────────────────────────────────────────────

@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "service": "LWK Depix Wallet API",
        "version": "5.0.0",
        "network": NETWORK_NAME,
        "monitor": {
            "interval_seconds":       MONITOR_INTERVAL,
            "confirmations_required": CONFIRMATIONS_REQUIRED,
            "webhook_configured":     bool(WEBHOOK_URL),
        },
        "endpoints": [
            "GET  /status",
            "POST /address/new    body: {user, index?}",
            "GET  /address/list   ?user=filtro",
            "GET  /balance",
            "POST /transfer       body: {to, amount, fee_rate?, asset_id?}",
            "GET  /transactions   ?limit=20",
            "POST /webhook/test",
            "GET  /wallet/info",
        ]
    })


@app.route("/status", methods=["GET"])
def status():
    err = auth_required()
    if err:
        return err
    try:
        wollet, _, descriptor_str, _ = load_or_create_wallet()
        tip     = get_tip_height()
        pending = load_pending()
        return jsonify({
            "status":                 "ok",
            "network":                NETWORK_NAME,
            "descriptor":             descriptor_str,
            "esplora":                ESPLORA_URL,
            "depix_asset_id":         DEPIX_ASSET_ID,
            "webhook_configured":     bool(WEBHOOK_URL),
            "monitor_interval_s":     MONITOR_INTERVAL,
            "confirmations_required": CONFIRMATIONS_REQUIRED,
            "current_block_height":   tip,
            "pending_deposits":       len(pending),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/address/new", methods=["POST"])
def new_address():
    err = auth_required()
    if err:
        return err
    try:
        data  = request.get_json(silent=True) or {}
        user  = data.get("user", "user")
        index = data.get("index", None)

        wollet, _, _, _ = load_or_create_wallet()
        sync_wallet_async(wollet, silent=True)

        addr_info  = wollet.address(index)
        address    = str(addr_info.address())
        idx        = addr_info.index()
        label      = create_label(user)
        label_id   = uuid.uuid4().hex
        created_at = datetime.now(timezone.utc).isoformat()

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

        logger.info(f"Endereco gerado: label={label} user={user} index={idx}")
        return jsonify({
            "address":    address,
            "label":      label,
            "user":       user,
            "index":      idx,
            "network":    NETWORK_NAME,
            "created_at": created_at,
        })
    except Exception as e:
        logger.error(f"Erro ao gerar endereco: {e}")
        return jsonify({"error": str(e)}), 500


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
        return jsonify({"error": str(e)}), 500


@app.route("/balance", methods=["GET"])
def balance():
    err = auth_required()
    if err:
        return err
    try:
        wollet, _, _, _ = load_or_create_wallet()
        if request.args.get("sync", "true").lower() != "false":
            sync_wallet_async(wollet, silent=True)
        bal           = wollet.balance()
        assets        = {}
        depix_balance = 0
        for asset_id, amount in bal.items():
            aid = str(asset_id)
            amt = amount / 100_000_000
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
        logger.error(f"Erro ao consultar saldo: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/transfer", methods=["POST"])
def transfer():
    err = auth_required()
    if err:
        return err
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Body JSON obrigatorio"}), 400

        to_address = data.get("to")
        amount_brl = data.get("amount")
        asset_id   = data.get("asset_id", DEPIX_ASSET_ID)
        fee_rate   = data.get("fee_rate", 0.1)

        if not to_address:
            return jsonify({"error": "Campo 'to' obrigatorio"}), 400
        if amount_brl is None or float(amount_brl) <= 0:
            return jsonify({"error": "Campo 'amount' invalido"}), 400

        amount_sat           = int(float(amount_brl) * 100_000_000)
        wollet, signer, _, _ = load_or_create_wallet()
        sync_wallet_async(wollet, silent=True)

        address = lwk.Address(to_address)
        builder = lwk.TxBuilder(get_network())
        builder.add_recipient(address, amount_sat, asset_id)
        if fee_rate:
            builder.fee_rate(float(fee_rate) * 1000)

        pset = builder.finish(wollet)
        pset = signer.sign(pset)

        # Fee ANTES do finalize
        fee_sat = None
        try:
            fee_sat = wollet.pset_details(pset).balance().fee()
        except Exception as e:
            logger.warning(f"Nao conseguiu ler fee: {e}")

        pset = wollet.finalize(pset)
        tx   = pset.extract_tx()

        client = lwk.EsploraClient(ESPLORA_URLS[0], get_network())
        txid   = client.broadcast(tx)

        logger.info(f"Transacao enviada: txid={txid} | fee={fee_sat} sat | valor={amount_brl} BRL")
        return jsonify({
            "success":         True,
            "txid":            str(txid),
            "to":              to_address,
            "amount_brl":      float(amount_brl),
            "amount_satoshis": amount_sat,
            "asset_id":        asset_id,
            "fee_satoshis":    fee_sat,
            "explorer_url":    f"https://blockstream.info/liquid/tx/{txid}",
        })
    except Exception as e:
        logger.error(f"Erro na transferencia: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/transactions", methods=["GET"])
def transactions():
    err = auth_required()
    if err:
        return err
    try:
        limit      = int(request.args.get("limit", 20))
        wollet, _, _, _ = load_or_create_wallet()
        sync_wallet_async(wollet, silent=True)
        tip_height = get_tip_height()
        txs        = wollet.transactions()
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
                        "amount":   amount / 100_000_000,
                        "is_depix": aid == DEPIX_ASSET_ID,
                    }
                tx_data["balance"] = balances
            except Exception:
                pass
            result.append(tx_data)

        return jsonify({"count": len(result), "transactions": result})
    except Exception as e:
        logger.error(f"Erro ao listar transacoes: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/wallet/info", methods=["GET"])
def wallet_info():
    err = auth_required()
    if err:
        return err
    try:
        wollet, _, descriptor_str, _ = load_or_create_wallet()
        return jsonify({
            "descriptor":     descriptor_str,
            "network":        NETWORK_NAME,
            "esplora":        ESPLORA_URL,
            "depix_asset_id": DEPIX_ASSET_ID,
            "warning":        "NUNCA compartilhe o arquivo mnemonic.txt",
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/webhook/test", methods=["POST"])
def webhook_test():
    err = auth_required()
    if err:
        return err
    if not WEBHOOK_URL:
        return jsonify({"error": "WEBHOOK_URL nao configurada"}), 400

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

    send_webhook(pending)
    send_webhook(confirmed)
    return jsonify({"sent": True, "webhook_url": WEBHOOK_URL})


# ── Start ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logger.info("Iniciando LWK Depix Wallet API v5...")
    threading.Thread(target=monitor_loop, daemon=True, name="DepositMonitor").start()
    app.run(host="0.0.0.0", port=5000, debug=False)
