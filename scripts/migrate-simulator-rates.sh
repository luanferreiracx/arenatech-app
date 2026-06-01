#!/bin/bash
# =============================================================================
# Migracao das TAXAS DO SIMULADOR: configuracoes_parcelamento (MySQL arena_dev)
# -> simulator_rate_configs + simulator_installment_tiers (PostgreSQL)
#
# Contexto: as taxas EXIBIDAS AO CLIENTE no simulador (com margem) vivem em
# `configuracoes_parcelamento` no Laravel. O seed do Next cria com defaults
# genericos (0% / max 12) — divergente das taxas reais da loja. Este script
# traz os valores reais.
#
# NAO confundir com as taxas do PDV/financeiro (PaymentMethod/PaymentMethodRate)
# — sistema propositalmente separado.
#
# Uso: ./scripts/migrate-simulator-rates.sh
# Idempotente: ON CONFLICT no config + DELETE/INSERT nos tiers.
# Migra apenas o tenant arena-tech (singleton no Laravel). Outros tenants
# usam os defaults ate terem config propria.
# =============================================================================

set -euo pipefail

VPS="contabo"
TENANT_ID="dd308431-0525-417a-97c5-459e4b6cf45a"

echo "============================================="
echo "  Simulador: taxas reais MySQL -> PostgreSQL"
echo "============================================="

ssh "$VPS" "TENANT_ID='$TENANT_ID' bash -s" << 'REMOTE_SCRIPT'
set -euo pipefail
MYSQL="mysql arena_dev --batch --raw -N"
PG="docker exec -i arenatech-postgres-prod psql -U arenatech -d arenatech"

# Le a linha unica de configuracoes_parcelamento (pipe-separada).
ROW=$($MYSQL -e "SELECT CONCAT_WS('|',
  taxa_credito_avista, taxa_debito, max_parcelas,
  juros_2x,juros_3x,juros_4x,juros_5x,juros_6x,juros_7x,juros_8x,juros_9x,juros_10x,
  juros_11x,juros_12x,juros_13x,juros_14x,juros_15x,juros_16x,juros_17x,juros_18x,
  juros_19x,juros_20x,juros_21x,juros_22x,juros_23x,juros_24x,juros_25x,juros_26x,
  juros_27x,juros_28x,juros_29x,juros_30x,juros_31x,juros_32x,juros_33x,juros_34x,
  juros_35x,juros_36x)
  FROM configuracoes_parcelamento LIMIT 1")

if [ -z "$ROW" ]; then
  echo "[ERRO] configuracoes_parcelamento vazia no MySQL. Abortando."
  exit 1
fi

IFS='|' read -r CRED DEB MAXP J2 J3 J4 J5 J6 J7 J8 J9 J10 J11 J12 J13 J14 J15 J16 \
  J17 J18 J19 J20 J21 J22 J23 J24 J25 J26 J27 J28 J29 J30 J31 J32 J33 J34 J35 J36 <<< "$ROW"

echo "[INFO] Laravel: credito_avista=$CRED% debito=$DEB% max=$MAXP (2x=$J2% ... 12x=$J12%)"

# Monta o SQL transacional.
SQL="BEGIN;
INSERT INTO simulator_rate_configs (id, tenant_id, credit_avista_fee_percent, debit_fee_percent, max_installments, created_at, updated_at)
VALUES (gen_random_uuid(), '$TENANT_ID', $CRED, $DEB, $MAXP, NOW(), NOW())
ON CONFLICT (tenant_id) DO UPDATE SET
  credit_avista_fee_percent = EXCLUDED.credit_avista_fee_percent,
  debit_fee_percent = EXCLUDED.debit_fee_percent,
  max_installments = EXCLUDED.max_installments,
  updated_at = NOW();
DELETE FROM simulator_installment_tiers
  WHERE config_id = (SELECT id FROM simulator_rate_configs WHERE tenant_id='$TENANT_ID');"

N=2
for J in $J2 $J3 $J4 $J5 $J6 $J7 $J8 $J9 $J10 $J11 $J12 $J13 $J14 $J15 $J16 $J17 $J18 \
  $J19 $J20 $J21 $J22 $J23 $J24 $J25 $J26 $J27 $J28 $J29 $J30 $J31 $J32 $J33 $J34 $J35 $J36; do
  SQL="$SQL
INSERT INTO simulator_installment_tiers (id, tenant_id, config_id, installments, fee_percent)
VALUES (gen_random_uuid(), '$TENANT_ID',
  (SELECT id FROM simulator_rate_configs WHERE tenant_id='$TENANT_ID'), $N, $J);"
  N=$((N+1))
done
SQL="$SQL
COMMIT;"

echo "$SQL" | $PG

echo "[OK] Verificacao pos-migracao:"
$PG -c "SELECT credit_avista_fee_percent AS credito, debit_fee_percent AS debito, max_installments AS max
        FROM simulator_rate_configs WHERE tenant_id='$TENANT_ID';"
$PG -c "SELECT COUNT(*) AS tiers FROM simulator_installment_tiers WHERE tenant_id='$TENANT_ID';"
REMOTE_SCRIPT

echo "============================================="
echo "  Concluido."
echo "============================================="
