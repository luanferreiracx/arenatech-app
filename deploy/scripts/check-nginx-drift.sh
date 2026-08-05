#!/usr/bin/env bash
# Compara os vhosts nginx versionados em deploy/nginx/ com o que roda na VPS.
#
# Por que existe (auditoria 2026-08-05): o PR #76 (12/06) versionou
# `pdvdepix.app.conf` e resolveu HSTS + headers duplicados. Em 05/08 a auditoria
# encontrou o domínio principal **sem HSTS** — a produção tinha divergido do
# repo em algum momento (certbot reescrevendo, edição manual), e nada detectava.
# Medido no mesmo dia: 2 dos 3 vhosts versionados divergiam.
#
# É a mesma classe do cron de backup que o RUNBOOK documentava e que nunca foi
# instalado: **arquivo versionado não prova o que está rodando.**
#
# Uso:
#   bash deploy/scripts/check-nginx-drift.sh            # compara
#   bash deploy/scripts/check-nginx-drift.sh --pull     # traz a prod pro repo
#
# Sai 1 se houver divergência — serve para rodar à mão antes de mexer em nginx,
# ou num cron de operação.
set -euo pipefail

SSH_HOST="${NGINX_DRIFT_SSH_HOST:-contabo}"
REMOTE_DIR="${NGINX_DRIFT_REMOTE_DIR:-/etc/nginx/sites-enabled}"
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../nginx" && pwd)"
PULL=0
[ "${1:-}" = "--pull" ] && PULL=1

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

divergentes=0
ausentes=0

for local_file in "$LOCAL_DIR"/*.conf; do
  name="$(basename "$local_file")"

  if ! ssh "$SSH_HOST" "test -f $REMOTE_DIR/$name" 2>/dev/null; then
    echo "AUSENTE na VPS: $name"
    ausentes=$((ausentes + 1))
    continue
  fi

  ssh "$SSH_HOST" "cat $REMOTE_DIR/$name" > "$TMP/$name" 2>/dev/null

  if diff -q "$local_file" "$TMP/$name" >/dev/null 2>&1; then
    echo "ok        $name"
  else
    echo "DIVERGE   $name"
    diff "$local_file" "$TMP/$name" | head -20 | sed 's/^/          /'
    divergentes=$((divergentes + 1))
    if [ "$PULL" -eq 1 ]; then
      cp "$TMP/$name" "$local_file"
      echo "          -> puxado da VPS para o repo"
    fi
  fi
done

echo
if [ "$divergentes" -eq 0 ] && [ "$ausentes" -eq 0 ]; then
  echo "Sem drift: repo e produção batem."
  exit 0
fi

echo "$divergentes divergente(s), $ausentes ausente(s)."
if [ "$PULL" -eq 1 ]; then
  echo "Rode 'git diff deploy/nginx/' para revisar o que veio da VPS."
  exit 0
fi
echo "Rode com --pull para trazer a versão da VPS, ou copie o repo para lá se o certo for o repo."
exit 1
