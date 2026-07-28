#!/usr/bin/env bash
# Auto-reparo do cache do LWK da carteira CENTRAL.
#
# Por que existe: o `full_scan` do LWK é incremental e NUNCA purga UTXO gasto do
# cache. Quando a Esplora degrada durante gastos, o cache prende UTXOs que já
# foram gastos on-chain e o saldo infla. Saldo inflado passa pelo gate de saque e
# a transação só quebra no broadcast (`bad-txns-inputs-missingorspent`), deixando
# um payout órfão no provedor (incidentes TXW20260719-00001 e TXW20260727-00002).
#
# INSTALAÇÃO: este arquivo é a fonte de verdade. Copie para a VPS em
# /opt/depix-cache-autorepair.sh (ver docs/operations/cron-setup.md). Ele roda via
# depix-cache-autorepair.timer.
#
# ── Correções do incidente 2026-07-28 ──
# A versão anterior tinha duas falhas que a deixaram inútil por ~7h:
#
# 1. MORRIA JUSTO QUANDO ERA NECESSÁRIA. Ela abria o cache VIVO para comparar com
#    o scan fresco. Quando a corrupção é severa, o próprio construtor do Wollet
#    lança (`UpdateOnDifferentStatus`) — então o script quebrava antes de reparar,
#    exatamente no caso em que o reparo é obrigatório. Agora um cache que não abre
#    é tratado como CORRUPÇÃO CONFIRMADA e reparado a partir do scan fresco.
# 2. FALHAVA EM SILÊNCIO. `set -e` + exit 1 só apareciam no journal; ninguém olha.
#    Agora toda falha emite um alerta explícito no log de alerta.
#
# ── Invariantes de segurança (NÃO afrouxe) ──
# - Só substitui o cache por um scan fresco cujos UTXOs foram TODOS verificados
#   como não-gastos on-chain. Nunca instala um scan com fantasma.
# - Exige que a fonte devolva o MESMO resultado em duas passadas. Esploras servem
#   dados PARCIAIS sem erro (blockstream devolveu R$3.294 num cache real de
#   R$9.698); um scan truncado instalado como verdade DESTRUIRIA saldo visível.
# - Nunca toca em descriptor.txt / mnemonic — só no diretório de cache `liquid/`.
# - Sempre faz backup antes de trocar.
set -uo pipefail

LWK=arenatech-lwk-wallet
CENTRAL=dd308431-0525-417a-97c5-459e4b6cf45a
BASE=/var/lib/docker/volumes/lwk-wallet_lwk_wallet_data/_data
TEN=$BASE/$CENTRAL
LOG=/var/log/depix-cache-autorepair.log
ts() { date "+%Y-%m-%d %H:%M:%S"; }
log() { echo "$(ts) $*" >>"$LOG"; }

# Alerta que alguém realmente vê. Falha silenciosa foi o que deixou o incidente
# de 2026-07-28 sangrar a noite toda.
alert() {
  log "ALERTA: $*"
  logger -t depix-cache-autorepair -p daemon.err "$*" 2>/dev/null || true
}

DECISION=$(docker exec -i "$LWK" python3 - <<PY 2>>"$LOG"
import os, lwk, shutil, urllib.request, json, time

DATA = os.environ["WALLET_DATA_DIR"]
C = "$CENTRAL"
DEPIX = "02f22f8d9c76ab41661a2729e4752e2c5d1a263012141b86ea98af5472df5189"
net = lwk.Network.mainnet()

# waterfalls primeiro: é a primária da ADR 0059 e a única que completou o
# full_scan de forma estável durante o incidente de 2026-07-28.
BASES = [
    "https://waterfalls.liquidwebwallet.org/liquid/api",
    "https://liquid.network/api",
    "https://blockstream.info/liquid/api",
]

src = os.path.join(DATA, C)
desc = open(os.path.join(src, "descriptor.txt")).read().strip()


def depix_ops(w):
    """Outpoints de DePix -> {outpoint: valor_sats}."""
    out = {}
    for x in w.utxos():
        try:
            u = x.unblinded()
            if str(u.asset()) == DEPIX:
                out[str(x.outpoint()).replace("[elements]", "")] = u.value()
        except Exception:
            pass
    return out


def scan(base, path):
    shutil.rmtree(path, ignore_errors=True)
    os.makedirs(path)
    w = lwk.Wollet(net, lwk.WolletDescriptor(desc), path)
    c = lwk.EsploraClient.from_builder(
        lwk.EsploraClientBuilder(base_url=base, network=net, concurrency=1, timeout=45)
    )
    up = c.full_scan(w)
    if up:
        w.apply_update(up)
    return depix_ops(w)


def spent(op):
    """True/False/None (None = nenhuma fonte respondeu)."""
    t, v = op.split(":")
    for b in BASES:
        try:
            r = urllib.request.urlopen(f"{b}/tx/{t}/outspend/{v}", timeout=10)
            return bool(json.loads(r.read()).get("spent"))
        except Exception:
            continue
    return None


# ── 1. O cache vivo abre? Não abrir JÁ É corrupção confirmada. ──
cache = None
try:
    wc = lwk.Wollet(net, lwk.WolletDescriptor(desc), src)
    cache = depix_ops(wc)
except Exception as e:
    print(f"NOTE cache_ilegivel={str(e)[:90]}")

# ── 2. Scan fresco, exigindo estabilidade (duas passadas iguais). ──
HEAL = os.path.join(DATA, "_heal_central")
fresh = None
for b in BASES:
    try:
        a = scan(b, HEAL)
        bb = scan(b, HEAL)
        if a != bb:
            print(f"NOTE instavel={b}")
            continue
        # reconstrói (o segundo scan já deixou HEAL válido)
        fresh = bb
        break
    except Exception as e:
        print(f"NOTE falhou={b} {str(e)[:60]}")
        continue

if fresh is None:
    shutil.rmtree(HEAL, ignore_errors=True)
    print("SKIP_SEM_FONTE")
    raise SystemExit

# ── 3. O scan fresco não pode conter NENHUM UTXO gasto. ──
bad = 0
unknown = 0
for op in fresh:
    s = spent(op)
    if s is None:
        unknown += 1
    elif s:
        bad += 1
    time.sleep(0.15)

if bad or unknown:
    shutil.rmtree(HEAL, ignore_errors=True)
    print(f"SKIP_FRESCO_SUJO gastos={bad} desconhecidos={unknown}")
    raise SystemExit

fresh_brl = sum(fresh.values()) / 1e8

# ── 4. Decide. ──
if cache is None:
    # Cache ilegível: qualquer coisa é melhor que um cache que nem abre, desde
    # que o substituto esteja verificado (passos 2 e 3 acima).
    print(f"REPAIR_ILEGIVEL fresco={fresh_brl:.2f} utxos={len(fresh)}")
    raise SystemExit

cache_brl = sum(cache.values()) / 1e8
removed = set(cache) - set(fresh)
if not removed or cache_brl - fresh_brl < 0.5:
    shutil.rmtree(HEAL, ignore_errors=True)
    print(f"CLEAN cache={cache_brl:.2f} fresco={fresh_brl:.2f}")
    raise SystemExit

# Todo UTXO que sumiu do cache precisa estar comprovadamente GASTO. Se algum não
# estiver, o scan fresco é que está incompleto — não repare.
for op in removed:
    if spent(op) is not True:
        shutil.rmtree(HEAL, ignore_errors=True)
        print(f"SKIP_REMOVIDO_VIVO {op}")
        raise SystemExit
    time.sleep(0.15)

print(f"REPAIR fantasma={cache_brl - fresh_brl:.2f} real={fresh_brl:.2f}")
PY
)
RC=$?
DECISION_LINE=$(echo "$DECISION" | grep -E "^(REPAIR|REPAIR_ILEGIVEL|CLEAN|SKIP)" | head -1)
log "rc=$RC decision=${DECISION_LINE:-<vazio>} raw=$(echo "$DECISION" | tr '\n' ' ')"

if [ $RC -ne 0 ] || [ -z "$DECISION_LINE" ]; then
  alert "auto-reparo do cache LWK FALHOU (rc=$RC). Cache central pode estar corrompido e o saldo inflado — reparar à mão."
  exit 1
fi

case "$DECISION_LINE" in
  REPAIR*) ;;
  *) exit 0 ;;
esac

if [ ! -d "$BASE/_heal_central/liquid" ]; then
  alert "decisão=$DECISION_LINE mas o cache reparado não existe — abortado sem tocar no cache vivo."
  exit 1
fi

TS=$(date +%Y%m%d-%H%M%S)
OWNER=$(stat -c "%u:%g" "$TEN/liquid" 2>/dev/null || echo "10001:10001")
docker stop "$LWK" >/dev/null
mv "$TEN/liquid" "$TEN/liquid.bak-$TS"
mv "$BASE/_heal_central/liquid" "$TEN/liquid"
chown -R "$OWNER" "$TEN/liquid"
rmdir "$BASE/_heal_central" 2>/dev/null || true
# Mantém os 3 backups mais recentes.
ls -dt "$TEN"/liquid.bak-* 2>/dev/null | tail -n +4 | xargs -r rm -rf
docker start "$LWK" >/dev/null
log "REPARADO ($DECISION_LINE, backup liquid.bak-$TS)"
alert "cache do LWK central foi reparado automaticamente ($DECISION_LINE). Confira o saldo."
