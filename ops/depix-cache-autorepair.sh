#!/usr/bin/env bash
# Auto-reparo do cache do LWK — de TODAS as carteiras, não só a central.
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
# ── Por que deixou de ser só a central (2026-08-02) ──
# Nasceu com o UUID da central hardcoded, porque só existia uma carteira em uso.
# Medido em produção antes desta mudança: a carteira espelho do tenant NO-KYC,
# que compartilha descriptor com a central, acusava R$ 11.993,93 contra
# R$ 14.356,37 da central — a MESMA carteira on-chain, R$ 2.362,44 de divergência,
# porque reparar uma não repara a outra e ninguém reparava a segunda. Cadastrar
# cliente é multiplicar carteiras.
#
# Cada rodada trata no máximo MAX_WALLETS_PER_RUN carteiras e avança um CURSOR:
# duas passadas de full_scan por carteira contra Esplora pública é caro, e a
# Esplora sobrecarregada é justamente o que causa a corrupção que estamos
# consertando. O cursor garante que a carteira que não coube hoje é a primeira da
# próxima rodada — teto sem cursor deixaria as últimas carteiras eternamente sem
# reparo, que é o bug que estamos corrigindo, só que em escala maior.
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
#   Isso também torna o script seguro para carteiras non-custodial e watch-only:
#   ele não precisa da seed para nada.
# - Sempre faz backup antes de trocar.
set -uo pipefail

LWK=arenatech-lwk-wallet
BASE=/var/lib/docker/volumes/lwk-wallet_lwk_wallet_data/_data
LOG=/var/log/depix-cache-autorepair.log
CURSOR_DIR=/var/lib/depix-cache-autorepair
CURSOR=$CURSOR_DIR/cursor
MAX_WALLETS_PER_RUN=${MAX_WALLETS_PER_RUN:-3}

ts() { date "+%Y-%m-%d %H:%M:%S"; }
log() { echo "$(ts) $*" >>"$LOG"; }

# Alerta que alguém realmente vê. Falha silenciosa foi o que deixou o incidente
# de 2026-07-28 sangrar a noite toda.
alert() {
  log "ALERTA: $*"
  logger -t depix-cache-autorepair -p daemon.err "$*" 2>/dev/null || true
}

# ── Carteiras a tratar nesta rodada ────────────────────────────────────────────
# Uma carteira é um diretório de tenant com descriptor.txt. Tenants no modo
# `external` não têm diretório nenhum, então saem da lista sozinhos. Ordem
# estável (sort) porque o cursor depende de a posição não mudar entre rodadas.
mapfile -t WALLETS < <(
  find "$BASE" -mindepth 2 -maxdepth 2 -name descriptor.txt -printf '%h\n' 2>/dev/null |
    xargs -r -n1 basename | sort
)

if [ ${#WALLETS[@]} -eq 0 ]; then
  alert "nenhuma carteira encontrada em $BASE — o volume do LWK mudou de lugar?"
  exit 1
fi

mkdir -p "$CURSOR_DIR"
POS=$(cat "$CURSOR" 2>/dev/null || echo 0)
case "$POS" in ''|*[!0-9]*) POS=0 ;; esac
POS=$((POS % ${#WALLETS[@]}))

TARGETS=()
TAKE=$((MAX_WALLETS_PER_RUN < ${#WALLETS[@]} ? MAX_WALLETS_PER_RUN : ${#WALLETS[@]}))
for ((i = 0; i < TAKE; i++)); do
  TARGETS+=("${WALLETS[$(((POS + i) % ${#WALLETS[@]}))]}")
done
echo $(((POS + TAKE) % ${#WALLETS[@]})) >"$CURSOR"

TARGETS_CSV=$(
  IFS=,
  echo "${TARGETS[*]}"
)
log "rodada: ${#TARGETS[@]} de ${#WALLETS[@]} carteiras (cursor->$(cat "$CURSOR")): $TARGETS_CSV"

# ── Avaliação (uma decisão por carteira) ───────────────────────────────────────
# A lista vai por ENV, não interpolada no heredoc: heredoc com expansão de shell
# em script que manipula dinheiro é superfície de injeção desnecessária.
DECISIONS=$(docker exec -i -e TARGETS="$TARGETS_CSV" "$LWK" python3 - <<'PY' 2>>"$LOG"
import os, lwk, shutil, urllib.request, json, time

DATA = os.environ["WALLET_DATA_DIR"]
TARGETS = [t for t in os.environ.get("TARGETS", "").split(",") if t]
DEPIX = "02f22f8d9c76ab41661a2729e4752e2c5d1a263012141b86ea98af5472df5189"
net = lwk.Network.mainnet()

# waterfalls primeiro: é a primária da ADR 0059 e a única que completou o
# full_scan de forma estável durante o incidente de 2026-07-28.
BASES = [
    "https://waterfalls.liquidwebwallet.org/liquid/api",
    "https://liquid.network/api",
    "https://blockstream.info/liquid/api",
]


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


def scan(base, path, desc):
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


def evaluate(C):
    """Decide o que fazer com UMA carteira. Deixa _heal_<C>/liquid pronto quando
    a decisão é REPAIR; limpa o diretório em qualquer outro desfecho."""
    src = os.path.join(DATA, C)
    HEAL = os.path.join(DATA, f"_heal_{C}")
    try:
        desc = open(os.path.join(src, "descriptor.txt")).read().strip()
    except Exception as e:
        return f"SKIP_SEM_DESCRIPTOR {str(e)[:60]}"

    # ── 1. O cache vivo abre? Não abrir JÁ É corrupção confirmada. ──
    cache = None
    try:
        wc = lwk.Wollet(net, lwk.WolletDescriptor(desc), src)
        cache = depix_ops(wc)
    except Exception as e:
        print(f"NOTE {C} cache_ilegivel={str(e)[:90]}")

    # ── 2. Scan fresco, exigindo estabilidade (duas passadas iguais). ──
    fresh = None
    for b in BASES:
        try:
            a = scan(b, HEAL, desc)
            bb = scan(b, HEAL, desc)
            if a != bb:
                print(f"NOTE {C} instavel={b}")
                continue
            # reconstrói (o segundo scan já deixou HEAL válido)
            fresh = bb
            break
        except Exception as e:
            print(f"NOTE {C} falhou={b} {str(e)[:60]}")
            continue

    if fresh is None:
        shutil.rmtree(HEAL, ignore_errors=True)
        return "SKIP_SEM_FONTE"

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
        return f"SKIP_FRESCO_SUJO gastos={bad} desconhecidos={unknown}"

    fresh_brl = sum(fresh.values()) / 1e8

    # ── 4. Decide. ──
    if cache is None:
        # Cache ilegível: qualquer coisa é melhor que um cache que nem abre, desde
        # que o substituto esteja verificado (passos 2 e 3 acima).
        return f"REPAIR_ILEGIVEL fresco={fresh_brl:.2f} utxos={len(fresh)}"

    cache_brl = sum(cache.values()) / 1e8
    removed = set(cache) - set(fresh)
    if not removed or cache_brl - fresh_brl < 0.5:
        shutil.rmtree(HEAL, ignore_errors=True)
        return f"CLEAN cache={cache_brl:.2f} fresco={fresh_brl:.2f}"

    # Todo UTXO que sumiu do cache precisa estar comprovadamente GASTO. Se algum
    # não estiver, o scan fresco é que está incompleto — não repare.
    for op in removed:
        if spent(op) is not True:
            shutil.rmtree(HEAL, ignore_errors=True)
            return f"SKIP_REMOVIDO_VIVO {op}"
        time.sleep(0.15)

    return f"REPAIR fantasma={cache_brl - fresh_brl:.2f} real={fresh_brl:.2f}"


for C in TARGETS:
    try:
        print(f"DECISION {C} {evaluate(C)}")
    except Exception as e:
        # Uma carteira que explode não pode levar as outras junto.
        shutil.rmtree(os.path.join(DATA, f"_heal_{C}"), ignore_errors=True)
        print(f"DECISION {C} ERRO {str(e)[:90]}")
PY
)
RC=$?
log "rc=$RC raw=$(echo "$DECISIONS" | tr '\n' ' ')"

if [ $RC -ne 0 ]; then
  alert "auto-reparo do cache LWK FALHOU (rc=$RC). Caches podem estar corrompidos e o saldo inflado — reparar à mão."
  exit 1
fi

# Toda carteira pedida precisa ter voltado com uma decisão. Sumiço silencioso de
# uma delas é a falha que já custou 7h de incidente.
for C in "${TARGETS[@]}"; do
  if ! echo "$DECISIONS" | grep -q "^DECISION $C "; then
    alert "carteira $C nao devolveu decisao do auto-reparo — verificar a mao."
  fi
done

# ── Troca (um único stop/start para todas as carteiras a reparar) ──────────────
mapfile -t TO_REPAIR < <(echo "$DECISIONS" | grep -E "^DECISION [^ ]+ REPAIR" | awk '{print $2}')
if [ ${#TO_REPAIR[@]} -eq 0 ]; then
  exit 0
fi

READY=()
for C in "${TO_REPAIR[@]}"; do
  if [ -d "$BASE/_heal_$C/liquid" ]; then
    READY+=("$C")
  else
    alert "carteira $C decidiu reparo mas o cache reparado nao existe — pulada sem tocar no cache vivo."
  fi
done
if [ ${#READY[@]} -eq 0 ]; then
  exit 1
fi

TS=$(date +%Y%m%d-%H%M%S)
docker stop "$LWK" >/dev/null
# O container precisa voltar mesmo se um mv falhar no meio: LWK parado é saque
# parado e saldo indisponível para todos os tenants.
trap 'docker start "$LWK" >/dev/null' EXIT

for C in "${READY[@]}"; do
  TEN=$BASE/$C
  OWNER=$(stat -c "%u:%g" "$TEN/liquid" 2>/dev/null || echo "10001:10001")
  if mv "$TEN/liquid" "$TEN/liquid.bak-$TS" && mv "$BASE/_heal_$C/liquid" "$TEN/liquid"; then
    chown -R "$OWNER" "$TEN/liquid"
    rmdir "$BASE/_heal_$C" 2>/dev/null || true
    # Mantém os 3 backups mais recentes.
    ls -dt "$TEN"/liquid.bak-* 2>/dev/null | tail -n +4 | xargs -r rm -rf
    log "REPARADO $C (backup liquid.bak-$TS)"
    alert "cache do LWK da carteira $C foi reparado automaticamente. Confira o saldo."
  else
    alert "falha ao trocar o cache da carteira $C — conferir o estado do diretorio a mao."
  fi
done
