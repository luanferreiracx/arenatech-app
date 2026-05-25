#!/bin/bash
# Sincroniza dados da forma de pagamento base (PaymentMethod) com o
# Laravel formas_pagamento. As taxas por parcela (payment_method_rates)
# ja foram migradas — falta atualizar os campos accepts_installments,
# installments_min/max, settlement_days que ficaram nos defaults.
#
# Tambem normaliza fee_percent/fee_fixed do PaymentMethod baseado na
# rate de 1x NAO_APARELHO (fallback usado quando rate especifica
# nao bate). Isso evita "Forma de pagamento nao encontrada" no finalize.
#
# Idempotente: SEMPRE atualiza com o estado atual do Laravel.
set -euo pipefail

PG="docker exec -i arenatech-postgres-prod psql -U arenatech arenatech -v ON_ERROR_STOP=1"
MYSQL="mysql -u arena_dev -pArenaDev@2025 arena_dev --batch --raw -N"

echo "=== 1. Sincronizando PaymentMethod (base config) ==="

$MYSQL -e "
SELECT codigo,
       aceita_parcelas,
       parcelas_min,
       parcelas_max,
       IFNULL(prazo_recebimento_dias, 0) AS prazo,
       ativo
FROM formas_pagamento;" 2>/dev/null > /tmp/_pm_base.tsv

python3 <<'PYEOF' > /tmp/_pm_base.sql
import sys
print("BEGIN;")
with open("/tmp/_pm_base.tsv") as f:
    for line in f:
        parts = line.rstrip("\n").split("\t")
        if len(parts) < 6:
            continue
        code, aceita, pmin, pmax, prazo, ativo = parts[:6]
        accepts = "true" if aceita == "1" else "false"
        active = "true" if ativo == "1" else "false"
        print(f"UPDATE payment_methods SET accepts_installments = {accepts}, installments_min = {int(pmin)}, installments_max = {int(pmax)}, settlement_days = {int(prazo)}, active = {active}, updated_at = NOW() WHERE code = '{code}';")
print("COMMIT;")
PYEOF

$PG < /tmp/_pm_base.sql > /tmp/_pm_base_err.log 2>&1 || { echo "FALHA pm base"; tail -15 /tmp/_pm_base_err.log; exit 1; }
echo "   $(wc -l < /tmp/_pm_base.tsv | tr -d ' ') metodos atualizados"

echo ""
echo "=== 2. Sincronizando fee_percent/fee_fixed base (rate de 1x NAO_APARELHO) ==="

# fee_percent/fee_fixed do PaymentMethod sao usados como FALLBACK pelo
# calculator quando nao acha rate especifica. Sincroniza com a rate
# de 1x NAO_APARELHO (politica LOJA_ABSORVE, taxa "padrao" da forma).
$PG -c "
UPDATE payment_methods pm
SET
  fee_percent = COALESCE(r.fee_percent, 0),
  fee_fixed = COALESCE(r.fee_fixed, 0),
  updated_at = NOW()
FROM (
  SELECT DISTINCT ON (payment_method_id)
    payment_method_id, fee_percent, fee_fixed
  FROM payment_method_rates
  WHERE installments = 1 AND applies_to = 'NAO_APARELHO' AND active = true
  ORDER BY payment_method_id
) r
WHERE pm.id = r.payment_method_id;
"

echo ""
echo "=== 3. Resultado ==="

$PG -c "
SELECT code, name, accepts_installments AS aceita, installments_min AS pmin, installments_max AS pmax,
       fee_percent || '%' AS taxa_base,
       settlement_days AS prazo,
       (SELECT COUNT(*) FROM payment_method_rates r WHERE r.payment_method_id = pm.id AND r.active = true) AS rates_ativas
FROM payment_methods pm
ORDER BY code;
"

echo ""
echo "OK"
