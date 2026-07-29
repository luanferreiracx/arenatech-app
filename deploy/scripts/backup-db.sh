#!/usr/bin/env bash
# Backup diário do Postgres de produção.
#
# Contexto: até 2026-07-29 produção não tinha backup nenhum. O RUNBOOK
# documentava um `pg_dump` em cron que NUNCA foi instalado — não havia cron,
# timer nem um único dump em disco. O banco guarda caixa, financeiro, fiscal e
# saldos DePix.
#
# Este script é metade da solução: grava a cópia na própria VPS. A outra metade
# é o PULL de fora (docs/operations/backup.md) — cópia local só protege contra
# perda de DADOS, não contra perda do SERVIDOR.
#
# Instalado como arenatech-backup-db.service/.timer.
set -euo pipefail

CONTAINER="${BACKUP_PG_CONTAINER:-arenatech-postgres-prod}"
DB_NAME="${BACKUP_DB_NAME:-arenatech}"
DB_USER="${BACKUP_DB_USER:-arenatech}"
OUT_DIR="${BACKUP_OUT_DIR:-/home/deployer/backups/db}"
KEEP="${BACKUP_KEEP:-14}"
# Piso de sanidade: o dump comprimido tinha 11 MB em 2026-07-29. Qualquer coisa
# abaixo disto é dump truncado, e dump truncado é pior que dump nenhum — ele
# passa a impressão de que existe backup.
MIN_BYTES="${BACKUP_MIN_BYTES:-5000000}"

STAMP="$(date +%Y%m%d_%H%M%S)"
TARGET="$OUT_DIR/${DB_NAME}_${STAMP}.sql.gz"
TMP="$TARGET.partial"

mkdir -p "$OUT_DIR"

# Escreve em .partial e só renomeia no fim: o pull de fora nunca vê arquivo
# incompleto com nome de arquivo pronto.
docker exec "$CONTAINER" pg_dump -U "$DB_USER" --no-owner --no-acl "$DB_NAME" | gzip > "$TMP"

SIZE="$(stat -c %s "$TMP")"
if [ "$SIZE" -lt "$MIN_BYTES" ]; then
  rm -f "$TMP"
  echo "FALHA: dump com $SIZE bytes, abaixo do piso de $MIN_BYTES. Nada foi gravado." >&2
  exit 1
fi

# gzip -t lê o arquivo inteiro: pega truncamento e corrupção que o tamanho não pega.
if ! gzip -t "$TMP"; then
  rm -f "$TMP"
  echo "FALHA: gzip corrompido. Nada foi gravado." >&2
  exit 1
fi

mv "$TMP" "$TARGET"
chmod 600 "$TARGET"

# Retenção: mantém os $KEEP mais recentes. `ls -t` ordena por mtime.
cd "$OUT_DIR"
ls -t "${DB_NAME}"_*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "OK: $TARGET ($(numfmt --to=iec "$SIZE")) — $(ls -1 "${DB_NAME}"_*.sql.gz | wc -l) cópias retidas"
