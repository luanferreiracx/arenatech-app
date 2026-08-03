#!/usr/bin/env bash
# Religa a Esplora depois de uma parada segura.
#
#   wsl.exe -d Ubuntu -u root -- bash /opt/waterfalls/safe-start.sh
#
# Contrapartida do safe-stop: sobe a stack e SÓ ENTÃO tira o modo manutenção,
# para o watchdog não julgar um serviço que ainda está subindo.
set -uo pipefail

STACK=/opt/waterfalls
cd "$STACK" || exit 1

echo "== subindo a stack =="
docker compose up -d

echo "== aguardando o elements ficar healthy =="
for _ in $(seq 1 60); do
  st=$(docker inspect elements --format '{{.State.Health.Status}}' 2>/dev/null)
  [ "$st" = "healthy" ] && break
  sleep 10
done
echo "   elements=$st"

# Só agora o watchdog volta a agir: antes disso ele veria um serviço em
# inicialização e o "consertaria" sem necessidade.
rm -f "$STACK/MAINTENANCE"
echo "== modo manutenção desligado — watchdog ativo =="

docker exec elements elements-cli -datadir=/data -conf=/etc/elements/elements.conf \
  getblockchaininfo 2>/dev/null | grep -E '"blocks"|"verificationprogress"|"initialblockdownload"'
