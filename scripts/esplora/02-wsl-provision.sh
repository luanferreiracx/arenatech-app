#!/usr/bin/env bash
# Provisiona a Esplora Liquid (elementsd + waterfalls) dentro do WSL2.
#
# Rode DEPOIS do 01-windows-bootstrap.ps1, como root no WSL2:
#   wsl.exe -d Ubuntu -u root -- bash /mnt/c/tmp/02-wsl-provision.sh
#
# IDEMPOTENTE: rodar de novo reconfigura sem destruir dados da chain.
#
# ── Por que cada ajuste existe (aprendido no IBD de 2026-07) ──────────────────
#
# trim_headers=1  — SEM ISTO O NÓ ENTRA EM LOOP DE OOM. O elementsd carrega os
#   ~4M headers da Liquid "fully in-memory" (~4GB RSS) e o cgroup mata o processo;
#   na primeira montagem foram 40 restarts até descobrir. Com trim_headers a RSS
#   caiu de 3,98GB para 1,66GB e o IBD ficou ~3x mais rápido.
#
# dbcache        — o gargalo do IBD aqui é I/O de disco, não CPU. Cache grande é o
#   que mais acelera; por isso escala com a RAM disponível em vez de ser fixo.
#
# par            — usa os cores de verdade (o default é conservador).
#
# validatepegin=0 — não exige um nó Bitcoin junto. Trade-off aceito e registrado
#   na ADR 0059: não validamos peg-in de BTC, o que não afeta saldo/UTXO de DePix.
#
# O nó é WATCH-ONLY, sem carteira e sem chaves privadas. O rpcpassword dá acesso a
# consulta de chain e broadcast de tx já assinada — nunca a fundos.
set -euo pipefail

STACK_DIR=/opt/waterfalls
CF_TOKEN="${CF_TOKEN:-}"   # token do túnel Cloudflare (opcional nesta etapa)

log() { printf '\n== %s ==\n' "$*"; }

log "1/6 Pacotes base"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg jq >/dev/null

log "2/6 Docker Engine"
# Docker Engine (não Docker Desktop): headless, sobe por systemd, sem depender de
# sessão gráfica do Windows.
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null
fi
systemctl enable --now docker >/dev/null 2>&1 || true
docker version --format '  engine {{.Server.Version}}' || { echo "Docker não subiu — systemd ativo no WSL2?"; exit 1; }

log "3/6 Tuning a partir do hardware"
RAM_MB=$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo)
CORES=$(nproc)
# Os limites dos DOIS containers têm de caber na RAM real. `mem_limit` é teto, não
# reserva, mas somar elements+waterfalls acima do total é convite a OOM.
WATERFALLS_MEM=$(( RAM_MB / 5 )); [ "$WATERFALLS_MEM" -lt 768 ] && WATERFALLS_MEM=768; [ "$WATERFALLS_MEM" -gt 1536 ] && WATERFALLS_MEM=1536
ELEMENTS_MEM=$(( RAM_MB - WATERFALLS_MEM - 550 )); [ "$ELEMENTS_MEM" -lt 2048 ] && ELEMENTS_MEM=2048

# dbcache dimensionado pelo PIOR momento, que é o DESLIGAMENTO — não o regime
# normal. Medido nesta máquina em 2026-07-30: com dbcache=961 e teto de 3467MiB,
# o regime estável ficava em ~3,3GiB (base ~1,7GiB + cache + ~0,65GiB de
# overhead) e o cgroup matou o nó justamente durante o flush do shutdown
# (`oomkilled=true`), zerando o chainstate e ~12h de validação.
#
# Daí a conta: teto − base − overhead − FOLGA DE FLUSH. Cache menor também
# significa flush mais FREQUENTE, ou seja, menos trabalho a perder num crash —
# o que vale mais que velocidade num nó que já perdeu o progresso duas vezes.
BASE_MB=1700; OVERHEAD_MB=650; FLUSH_HEADROOM_MB=1000
DBCACHE=$(( ELEMENTS_MEM - BASE_MB - OVERHEAD_MB - FLUSH_HEADROOM_MB ))
[ "$DBCACHE" -lt 300 ] && DBCACHE=300; [ "$DBCACHE" -gt 4000 ] && DBCACHE=4000

# Deixa um núcleo livre: o congelamento do WSL (`Wsl/Service/0x8007274c`), que
# nos cegou por horas, apareceu com os 4 núcleos saturados pelo nó.
PAR=$(( CORES > 1 ? CORES - 1 : 1 )); [ "$PAR" -gt 8 ] && PAR=8
echo "  RAM ${RAM_MB}MiB / ${CORES} vCPU -> dbcache=${DBCACHE}MiB par=${PAR} mem_limit=${ELEMENTS_MEM}MiB"

log "4/6 Stack em $STACK_DIR"
mkdir -p "$STACK_DIR"
cd "$STACK_DIR"

# Senha de RPC: gerada localmente, nunca versionada. Preserva a existente para não
# invalidar o db do waterfalls num re-provisionamento.
if [ ! -f elements_rpc.secret ]; then
  printf 'waterfalls:%s' "$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 32)" > elements_rpc.secret
  chmod 600 elements_rpc.secret
fi
RPC_PASS=$(cut -d: -f2- elements_rpc.secret)

cat > elements.conf <<EOF
chain=liquidv1

server=1
rest=1
txindex=1
validatepegin=0

rpcuser=waterfalls
rpcpassword=${RPC_PASS}

rpcbind=0.0.0.0
rpcallowip=172.16.0.0/12
rpcallowip=10.0.0.0/8
rpcallowip=192.168.0.0/16
rpcport=7041

zmqpubrawtx=tcp://0.0.0.0:5555

# Ver cabeçalho do script: trim_headers evita o OOM-loop; o resto é tuning de IBD.
trim_headers=1
dbcache=${DBCACHE}
par=${PAR}
maxmempool=64
maxconnections=12
EOF
chmod 600 elements.conf

cat > compose.yaml <<EOF
# Esplora Liquid própria (ADR 0059). Roda no PC dedicado, exposta ao mundo só pelo
# Cloudflare Tunnel — nenhuma porta aberta no roteador.
services:
  elements:
    image: blockstream/elementsd:23.3.3@sha256:1abe3ae514662492279c9ba8adc94fea46a0fa60efdd62f4eb93d3e803adff37
    container_name: elements
    restart: unless-stopped
    command: ["elementsd", "-datadir=/data", "-conf=/etc/elements/elements.conf"]
    volumes:
      - ./elements.conf:/etc/elements/elements.conf:ro
      - elements_data:/data
    networks: [esplora]
    stop_grace_period: 3m
    mem_limit: ${ELEMENTS_MEM}m
    cpus: ${PAR}.0
    healthcheck:
      test: ["CMD", "elements-cli", "-datadir=/data", "-conf=/etc/elements/elements.conf", "getblockchaininfo"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 5m

  waterfalls:
    image: blockstream/waterfalls@sha256:4d0117f7615b1de0139d61b4715cf3143a6d29cc1e45acd9d15e64039094ee3a
    container_name: waterfalls
    restart: unless-stopped
    depends_on:
      elements:
        condition: service_healthy
    command:
      - "--network=liquid"
      - "--node-url=http://elements:7041"
      - "--rpc-user-password-file=/run/secrets/elements_rpc"
      - "--db-dir=/db"
      - "--listen=0.0.0.0:3100"
      - "--zmq-endpoint=tcp://elements:5555"
    volumes:
      - waterfalls_db:/db
      - ./elements_rpc.secret:/run/secrets/elements_rpc:ro
    # Publicado só em loopback: quem alcança de fora é o cloudflared, que roda
    # nesta mesma máquina. Nada exposto na LAN.
    ports:
      - "127.0.0.1:3100:3100"
    networks: [esplora]
    ulimits:
      nofile: { soft: 65536, hard: 65536 }
    mem_limit: ${WATERFALLS_MEM}m
    cpus: 2.0

volumes:
  elements_data:
  waterfalls_db:

networks:
  esplora:
EOF

docker compose up -d
echo "  stack no ar"

log "5/6 cloudflared"
if ! command -v cloudflared >/dev/null 2>&1; then
  arch=$(dpkg --print-architecture)
  curl -fsSL -o /tmp/cloudflared.deb \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}.deb"
  dpkg -i /tmp/cloudflared.deb >/dev/null
fi
if [ -n "$CF_TOKEN" ]; then
  cloudflared service install "$CF_TOKEN" >/dev/null 2>&1 || true
  systemctl enable --now cloudflared >/dev/null 2>&1 || true
  echo "  túnel instalado como serviço"
else
  echo "  CF_TOKEN não informado — instale depois com:"
  echo "    cloudflared service install <TOKEN> && systemctl enable --now cloudflared"
fi

log "6/6 Estado"
docker compose ps
echo
echo "Acompanhe o IBD (o número AUTORITATIVO é o do elements, não o do waterfalls):"
echo "  docker exec elements elements-cli -datadir=/data -conf=/etc/elements/elements.conf getblockchaininfo | jq '{blocks,headers,verificationprogress,initialblockdownload}'"
