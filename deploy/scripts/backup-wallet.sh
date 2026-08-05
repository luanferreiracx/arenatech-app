#!/usr/bin/env bash
# Backup diário da carteira LWK de produção.
#
# Contexto (auditoria 2026-08-05, P0-A1): o backup de 2026-07-29 resolveu o
# BANCO e não foi propagado para a CARTEIRA. Até esta data o único backup do
# volume era um tar MANUAL de 15/06 — e três carteiras criadas depois dele
# (28/07 e 04/08) estavam sem nenhum ponto de restauração.
#
# É a mesma classe do achado que motivou o backup do banco: a correção fechou a
# instância, não a classe.
#
# O que se perde sem isto:
#   - `descriptor.txt`  — reconstrói a carteira. Sem ele, não há watch-only.
#   - `idempotency.json` — a FONTE DE VERDADE sobre quais saques foram
#     transmitidos. Foi o que resolveu o pagamento duplicado TXW20260727-00002:
#     o banco dizia FAILED e a transação estava na rede.
#
# NÃO faz backup de `liquid/` nem dos `liquid.bak-*`: é cache de UTXO do LWK,
# reconstruível por rescan, responde por quase todo o tamanho do volume, e já
# causou incidente de saldo inflado justamente por ficar velho. Restaurar cache
# antigo seria pior que não ter cópia.
#
# Instalado como arenatech-backup-wallet.service/.timer.
set -euo pipefail

VOLUME="${WALLET_BACKUP_VOLUME:-lwk-wallet_lwk_wallet_data}"
OUT_DIR="${WALLET_BACKUP_OUT_DIR:-/home/deployer/backups/wallet}"
KEEP="${WALLET_BACKUP_KEEP:-30}"
# Piso de sanidade. Em 2026-08-05 o conteúdo sem o cache dava ~200 KB (8
# carteiras). Um tar menor que isto significa volume vazio ou não montado —
# tar de carteira vazia é exatamente o backup que parece existir e não presta.
MIN_BYTES="${WALLET_BACKUP_MIN_BYTES:-20000}"

SRC="/var/lib/docker/volumes/${VOLUME}/_data"
STAMP="$(date +%Y%m%d_%H%M%S)"
TARGET="$OUT_DIR/lwk_wallet_${STAMP}.tar.gz"
TMP="$TARGET.partial"

if [ ! -d "$SRC" ]; then
  echo "FALHA: volume $SRC não existe. Nada foi gravado." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# Escreve em .partial e só renomeia no fim: o pull de fora nunca vê arquivo
# incompleto com nome de arquivo pronto (mesmo padrão do backup do banco).
#
# Sem parar o container: os arquivos que importam (descriptor/idempotency/labels)
# são escritos por rewrite atômico, e parar o LWK derrubaria saque e depósito
# todo dia às 02:40. O cache, que é o que está sempre em escrita, é excluído.
tar -czf "$TMP" \
  --exclude='liquid' \
  --exclude='liquid.bak-*' \
  --exclude='enc_cache' \
  -C "$SRC" .

SIZE="$(stat -c %s "$TMP")"
if [ "$SIZE" -lt "$MIN_BYTES" ]; then
  rm -f "$TMP"
  echo "FALHA: tar com $SIZE bytes, abaixo do piso de $MIN_BYTES. Nada foi gravado." >&2
  exit 1
fi

# gzip -t lê o arquivo inteiro: pega truncamento e corrupção que o tamanho não pega.
if ! gzip -t "$TMP"; then
  rm -f "$TMP"
  echo "FALHA: gzip corrompido. Nada foi gravado." >&2
  exit 1
fi

# Guarda específica da carteira: um tar sem NENHUM descriptor.txt é inútil para
# restaurar, por mais que passe no piso de tamanho e no gzip -t.
DESCRIPTORS="$(tar -tzf "$TMP" | grep -c 'descriptor\.txt$' || true)"
if [ "$DESCRIPTORS" -lt 1 ]; then
  rm -f "$TMP"
  echo "FALHA: nenhum descriptor.txt no tar — backup não restauraria. Nada foi gravado." >&2
  exit 1
fi

mv "$TMP" "$TARGET"
chmod 600 "$TARGET"

# Retenção: mantém os $KEEP mais recentes. `ls -t` ordena por mtime.
cd "$OUT_DIR"
ls -t lwk_wallet_*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "OK: $TARGET ($(numfmt --to=iec "$SIZE")) — $DESCRIPTORS carteira(s), $(ls -1 lwk_wallet_*.tar.gz | wc -l) cópias retidas"
