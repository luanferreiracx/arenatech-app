#!/usr/bin/env bash
# Restaura uma cópia LOCAL do banco de produção para a auditoria de finalização.
#
# Por que existe: a passada de frontend precisa navegar o sistema com dados
# reais (docs/FINALIZACAO/00_INDICE.md). Tela vazia não revela bug de uso.
#
# O dump é transmitido por stdout do pg_dump direto para cá — NADA é escrito no
# disco da VPS. O arquivo local contém PII de clientes reais: não commite, não
# suba para lugar nenhum.
#
# Uso:  bash scripts/audit/restore-prod-copy.sh
set -euo pipefail

SSH_HOST="${AUDIT_SSH_HOST:-contabo}"
PG_CONTAINER="${AUDIT_PG_CONTAINER:-arenatech-postgres-prod}"
LOCAL_CONTAINER="${AUDIT_LOCAL_CONTAINER:-arenatech-postgres}"
LOCAL_DB="${AUDIT_LOCAL_DB:-arenatech_prod}"
LOCAL_USER="${AUDIT_LOCAL_USER:-arenatech}"
OUT_DIR="${AUDIT_DUMP_DIR:-/tmp/arena-audit}"
DUMP="$OUT_DIR/prod_$(date +%Y%m%d_%H%M%S).sql.gz"

mkdir -p "$OUT_DIR"

echo "==> Baixando dump de produção (stream, sem escrever na VPS)"
ssh "$SSH_HOST" "docker exec $PG_CONTAINER pg_dump -U arenatech --no-owner --no-acl arenatech" \
  | gzip > "$DUMP"
echo "    $DUMP ($(du -h "$DUMP" | cut -f1))"

echo "==> Recriando banco local $LOCAL_DB"
docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_USER" -d postgres -q \
  -c "DROP DATABASE IF EXISTS $LOCAL_DB;" \
  -c "CREATE DATABASE $LOCAL_DB OWNER $LOCAL_USER;"

echo "==> Restaurando"
gunzip -c "$DUMP" | docker exec -i "$LOCAL_CONTAINER" psql -U "$LOCAL_USER" -d "$LOCAL_DB" -q

# O dump sai com --no-acl (para não arrastar os roles da VPS), então os GRANTs
# se perdem. Sem isto o app loga e toma "permission denied for table users":
# `withTenant` faz SET ROLE app_user, e app_user fica sem privilégio nenhum.
echo "==> Re-aplicando GRANTs de app_user/app_admin"
docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_USER" -d "$LOCAL_DB" -q \
  -c "GRANT USAGE ON SCHEMA public TO app_user, app_admin;" \
  -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user, app_admin;" \
  -c "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user, app_admin;" \
  -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user, app_admin;"

echo "==> Criando usuários de auditoria (admin + operador)"
DATABASE_URL="postgresql://$LOCAL_USER:arenatech_local@localhost:5432/$LOCAL_DB?schema=public" \
  pnpm tsx scripts/audit/prepare-audit-db.ts

cat <<EOF

Pronto. Para subir o app contra a cópia:

  DATABASE_URL="postgresql://$LOCAL_USER:arenatech_local@localhost:5432/$LOCAL_DB?schema=public" \\
  DATABASE_MIGRATE_URL="postgresql://$LOCAL_USER:arenatech_local@localhost:5432/$LOCAL_DB?schema=public" \\
  DATABASE_OWNER_URL="postgresql://$LOCAL_USER:arenatech_local@localhost:5432/$LOCAL_DB?schema=public" \\
  pnpm dev

E para varrer um módulo no navegador:

  DATABASE_URL="postgresql://$LOCAL_USER:arenatech_local@localhost:5432/$LOCAL_DB?schema=public" \\
  pnpm tsx scripts/audit/crawl-module.ts caixa
EOF
