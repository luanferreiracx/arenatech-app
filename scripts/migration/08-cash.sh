#!/bin/bash
# Fase 8: caixa_aberturas -> cash_registers; caixa_movimentacoes -> cash_movements
set -euo pipefail

TENANT_ID="dd308431-0525-417a-97c5-459e4b6cf45a"
PG="docker exec -i arenatech-postgres-prod psql -U arenatech arenatech"
MYSQL="mysql arena_dev --batch --raw"

$PG > /dev/null <<EOF
DROP TABLE IF EXISTS _map_cash_sessions CASCADE;
CREATE TABLE _map_cash_sessions (old_id BIGINT PRIMARY KEY, new_id UUID NOT NULL);
TRUNCATE TABLE cash_registers CASCADE;
EOF

echo "=> Cash sessions (aberturas)..."
cat > /tmp/_cash_q.sql <<'SQL'
SELECT id, usuario_id,
       IFNULL(saldo_inicial, 0) AS si,
       IFNULL(REPLACE(REPLACE(observacao_abertura, '\r', ' '), '\n', ' '), '') AS oa,
       status,
       IFNULL(saldo_sistema, 0) AS ss,
       IFNULL(saldo_informado, 0) AS sinf,
       IFNULL(diferenca, 0) AS diff,
       IFNULL(REPLACE(REPLACE(observacao_fechamento, '\r', ' '), '\n', ' '), '') AS obs_close,
       IFNULL(aberto_em, NOW()) AS ae,
       IFNULL(fechado_em, '') AS fe
FROM caixa_aberturas ORDER BY id;
SQL
$MYSQL < /tmp/_cash_q.sql 2>/dev/null | tail -n +2 > /tmp/_cash.tsv
echo "   -> $(wc -l < /tmp/_cash.tsv) sessoes"

awk -F'\t' -v TENANT="$TENANT_ID" '
function q(s) { gsub("'\''", "'\'''\''", s); return s == "" ? "NULL" : "'\''" s "'\''" }
function ts(s) { return s == "" ? "NULL" : "'\''" s "'\''" }
BEGIN { print "BEGIN;" }
{
  id=$1; uid=$2; si=$3; oa=$4; status=$5; ss=$6; sinf=$7; diff=$8; of=$9; ae=$10; fe=$11;
  pg_status = (status == "aberto") ? "OPEN" : "CLOSED";
  user_sql = "COALESCE((SELECT new_id FROM _map_users WHERE old_id = " uid "), '\''64472a4d-3063-495e-94ea-294e419e1e2d'\'')";
  closing_sql = (status == "aberto") ? "NULL" : sinf;
  expected_sql = (status == "aberto") ? "NULL" : ss;
  diff_sql = (status == "aberto") ? "NULL" : diff;
  print "WITH ncs AS (";
  print "  INSERT INTO cash_registers (id, tenant_id, user_id, status, opening_balance, opening_notes,";
  print "    closing_balance, expected_balance, difference, notes,";
  print "    opened_at, closed_at, created_at, updated_at)";
  print "  VALUES (gen_random_uuid(), '\''" TENANT "'\'', " user_sql ", '\''" pg_status "'\''::\"CashRegisterStatus\",";
  print "    " si ", " q(oa) ",";
  print "    " closing_sql ", " expected_sql ", " diff_sql ", " q(of) ",";
  print "    '\''" ae "'\'', " ts(fe) ", '\''" ae "'\'', NOW())";
  print "  RETURNING id";
  print ")";
  print "INSERT INTO _map_cash_sessions (old_id, new_id) SELECT " id ", id FROM ncs;";
}
END { print "COMMIT;" }
' /tmp/_cash.tsv > /tmp/_cash.sql

$PG -v ON_ERROR_STOP=1 -q < /tmp/_cash.sql > /tmp/_cash_err.log 2>&1 || { echo "FALHA cash_registers"; tail -15 /tmp/_cash_err.log; exit 1; }

# ----- Movements -----
echo "=> Cash movements..."
cat > /tmp/_cm_q.sql <<'SQL'
SELECT id, abertura_id, usuario_id, tipo, IFNULL(valor, 0) AS v, natureza,
       IFNULL(forma_pagamento, '') AS fp,
       IFNULL(referencia_tipo, '') AS rt,
       IFNULL(referencia_id, 0) AS ri,
       IFNULL(REPLACE(REPLACE(descricao, '\r', ' '), '\n', ' '), '') AS d,
       IFNULL(REPLACE(REPLACE(observacao, '\r', ' '), '\n', ' '), '') AS obs,
       IFNULL(saldo_anterior, 0) AS sant,
       IFNULL(saldo_atual, 0) AS satu,
       IFNULL(criado_em, NOW()) AS criado
FROM caixa_movimentacoes ORDER BY id;
SQL
$MYSQL < /tmp/_cm_q.sql 2>/dev/null | tail -n +2 > /tmp/_cm.tsv
echo "   -> $(wc -l < /tmp/_cm.tsv) movimentacoes"

awk -F'\t' -v TENANT="$TENANT_ID" '
function q(s) { gsub("'\''", "'\'''\''", s); return s == "" ? "NULL" : "'\''" s "'\''" }
BEGIN { print "BEGIN;" }
{
  id=$1; aid=$2; uid=$3; tipo=$4; v=$5; nat=$6;
  fp=$7; rt=$8; ri=$9; d=$10; obs=$11; sant=$12; satu=$13; criado=$14;

  # Mapeia tipo Laravel -> CashMovementType
  pg_type = "ADJUSTMENT";
  if (tipo == "venda") pg_type = "SALE";
  else if (tipo == "estorno") pg_type = "REFUND";
  else if (tipo == "abertura") pg_type = "OPENING";
  else if (tipo == "fechamento") pg_type = "CLOSING";
  else if (tipo == "sangria") pg_type = "WITHDRAWAL";
  else if (tipo == "suprimento") pg_type = "DEPOSIT";
  else if (tipo == "despesa") pg_type = "EXPENSE";

  # natureza: entrada->INCOME, saida->OUTCOME (text livre)
  pg_nat = (nat == "entrada") ? "INCOME" : "OUTCOME";

  user_sql = "COALESCE((SELECT new_id FROM _map_users WHERE old_id = " uid "), '\''64472a4d-3063-495e-94ea-294e419e1e2d'\'')";

  description = (d != "") ? d : (obs != "" ? obs : pg_type);

  print "INSERT INTO cash_movements (id, tenant_id, cash_register_id, user_id, type, nature, amount, payment_method, description, reference_type, reference_id, previous_balance, current_balance, created_at) VALUES (gen_random_uuid(), '\''" TENANT "'\'', (SELECT new_id FROM _map_cash_sessions WHERE old_id = " aid "), " user_sql ", '\''" pg_type "'\''::\"CashMovementType\", '\''" pg_nat "'\'', " v ", " q(fp) ", " q(description) ", " q(rt) ", NULL, " sant ", " satu ", '\''" criado "'\'');";
}
END { print "COMMIT;" }
' /tmp/_cm.tsv > /tmp/_cm.sql

$PG -v ON_ERROR_STOP=1 -q < /tmp/_cm.sql > /tmp/_cm_err.log 2>&1 || { echo "FALHA cash_movements"; tail -15 /tmp/_cm_err.log; exit 1; }

echo "=> Resumo Fase 8:"
$PG -c "
  SELECT 'cash_registers' tbl, COUNT(*) FROM cash_registers
  UNION ALL SELECT 'cash_movements', COUNT(*) FROM cash_movements
  ORDER BY tbl;
"
