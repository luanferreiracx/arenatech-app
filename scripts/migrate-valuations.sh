#!/bin/bash
# =============================================================================
# Migracao das AVALIACOES de aparelhos: avaliacoes (MySQL arena_dev)
# -> device_valuations (PostgreSQL)
#
# Contexto: a tabela de precos de compra de usados (modelo x armazenamento x
# saude_bateria -> valor) nunca foi migrada para o Postgres. O modulo estava
# VAZIO em prod. Este script traz os registros reais, normalizando:
#   - HTML entities no Laravel (ex: "&gt; 90%" -> "> 90%")
#   - valor string "R$ 1.500,00" -> decimal 1500.00
#   - validade_dias (default 7 se nulo)
#
# Uso: ./scripts/migrate-valuations.sh
# Idempotente: DELETE dos registros do tenant + reinsert.
# Migra apenas o tenant arena-tech.
# =============================================================================

set -euo pipefail

VPS="contabo"
TENANT_ID="dd308431-0525-417a-97c5-459e4b6cf45a"

echo "============================================="
echo "  Avaliacoes: MySQL -> PostgreSQL"
echo "============================================="

ssh "$VPS" "TENANT_ID='$TENANT_ID' bash -s" << 'REMOTE_SCRIPT'
set -euo pipefail
PG="docker exec -i arenatech-postgres-prod psql -U arenatech -d arenatech"

mysql arena_dev --batch --raw -N \
  -e "SELECT modelo, armazenamento, saude_bateria, valor, validade_dias FROM avaliacoes" \
| TENANT="$TENANT_ID" python3 -c '
import sys, os, html, re
def pv(s):
    s = html.unescape(s).strip()
    s = re.sub(r"[^\d,.-]", "", s)
    s = s.replace(".", "").replace(",", ".")
    return float(s)
def esc(s):
    return s.replace("\x27", "\x27\x27")
tenant = os.environ["TENANT"]
print("BEGIN;")
print(f"DELETE FROM device_valuations WHERE tenant_id=\x27{tenant}\x27;")
n = 0
for line in sys.stdin:
    p = line.rstrip("\n").split("\t")
    if len(p) < 5:
        continue
    mod, arm, bat, val, vd = p
    mod = esc(html.unescape(mod).strip())
    arm = esc(html.unescape(arm).strip())
    bat = esc(html.unescape(bat).strip())
    v = pv(val)
    vd = int(vd) if vd and vd.strip().isdigit() else 7
    print(
        "INSERT INTO device_valuations "
        "(id,tenant_id,modelo,armazenamento,saude_bateria,valor,validade_dias,created_at,updated_at) "
        f"VALUES (gen_random_uuid(),\x27{tenant}\x27,\x27{mod}\x27,\x27{arm}\x27,\x27{bat}\x27,{v},{vd},NOW(),NOW());"
    )
    n += 1
print("COMMIT;")
sys.stderr.write(f"[INFO] {n} avaliacoes preparadas\n")
' | $PG

echo "[OK] Verificacao pos-migracao:"
$PG -c "SELECT COUNT(*) AS total, COUNT(DISTINCT modelo) AS modelos
        FROM device_valuations WHERE tenant_id='$TENANT_ID' AND deleted_at IS NULL;"
REMOTE_SCRIPT

echo "============================================="
echo "  Concluido."
echo "============================================="
