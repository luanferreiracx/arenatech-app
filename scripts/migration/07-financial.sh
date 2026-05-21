#!/bin/bash
# Fase 7: contas_pagar + contas_receber -> financial_transactions + installments
set -euo pipefail

TENANT_ID="dd308431-0525-417a-97c5-459e4b6cf45a"
PG="docker exec -i arenatech-postgres-prod psql -U arenatech arenatech"
MYSQL="mysql arena_dev --batch --raw"

$PG > /dev/null <<EOF
DROP TABLE IF EXISTS _map_financial_receivable CASCADE;
DROP TABLE IF EXISTS _map_financial_payable CASCADE;
CREATE TABLE _map_financial_receivable (old_id BIGINT PRIMARY KEY, new_id UUID NOT NULL);
CREATE TABLE _map_financial_payable    (old_id BIGINT PRIMARY KEY, new_id UUID NOT NULL);
TRUNCATE TABLE financial_transactions CASCADE;
EOF

mapstatus_awk='
function mapstatus(s) {
  if (s == "pendente") return "PENDING";
  if (s == "paga") return "PAID";
  if (s == "vencida") return "OVERDUE";
  if (s == "cancelada") return "CANCELLED";
  if (s == "parcial") return "PARTIALLY_PAID";
  if (s == "estornada") return "ESTORNADA";
  return "PENDING";
}
'

# ----- Contas a Receber -----
echo "=> Contas a receber..."
cat > /tmp/_cr_q.sql <<'SQL'
SELECT id,
       IFNULL(REPLACE(REPLACE(descricao, '\r', ' '), '\n', ' '), '') AS desc_v,
       IFNULL(origem_tipo,'') AS otipo,
       IFNULL(origem_id, 0) AS oid,
       IFNULL(cliente_id, 0) AS cliente,
       IFNULL(cliente_nome,'') AS cliente_nome,
       IFNULL(valor_total, 0) AS total,
       IFNULL(valor_pago, 0) AS pago,
       IFNULL(forma_pagamento,'') AS fp,
       IFNULL(num_parcelas, 1) AS num_p,
       status,
       IFNULL(REPLACE(REPLACE(observacoes, '\r', ' '), '\n', ' '), '') AS obs,
       IFNULL(data_emissao, CURDATE()) AS de,
       IFNULL(data_vencimento, CURDATE()) AS dv,
       IFNULL(usuario_id, 5) AS uid,
       IFNULL(criado_em, NOW()) AS criado
FROM contas_receber ORDER BY id;
SQL
$MYSQL < /tmp/_cr_q.sql 2>/dev/null | tail -n +2 > /tmp/_cr.tsv
echo "   -> $(wc -l < /tmp/_cr.tsv) contas a receber"

awk -F'\t' -v TENANT="$TENANT_ID" "$mapstatus_awk
function q(s) { gsub(\"'\", \"''\", s); return s == \"\" ? \"NULL\" : \"'\" s \"'\" }
BEGIN { print \"BEGIN;\" }
{
  id=\$1; desc_v=\$2; otipo=\$3; oid=\$4; cliente=\$5; cliente_nome=\$6;
  total=\$7; pago=\$8; fp=\$9; num_p=\$10;
  status=\$11; obs=\$12; de=\$13; dv=\$14; uid=\$15; criado=\$16;

  pg_status = mapstatus(status);
  cust_sql = (cliente != \"0\") ? \"(SELECT new_id FROM _map_customers WHERE old_id = \" cliente \")\" : \"NULL\";

  # Reference: origem PDV ou OS
  ref_id_sql = \"NULL\"; ref_type_sql = \"NULL\"; sale_sql = \"NULL\"; os_sql = \"NULL\";
  if (otipo == \"pdv_venda\" || otipo == \"venda\") {
    sale_sql = (oid != \"0\") ? \"(SELECT new_id FROM _map_sales WHERE old_id = \" oid \")\" : \"NULL\";
    ref_id_sql = sale_sql; ref_type_sql = \"'sale'\";
  } else if (otipo == \"ordem_servico\" || otipo == \"os\") {
    os_sql = (oid != \"0\") ? \"(SELECT new_id FROM _map_service_orders WHERE old_id = \" oid \")\" : \"NULL\";
    ref_id_sql = os_sql; ref_type_sql = \"'service_order'\";
  }

  created_by = \"COALESCE((SELECT new_id FROM _map_users WHERE old_id = \" uid \"), '64472a4d-3063-495e-94ea-294e419e1e2d')\";

  if (desc_v == \"\") desc_v = \"Conta a Receber #\" id;

  print \"WITH nft AS (\";
  print \"  INSERT INTO financial_transactions (id, tenant_id, type, status, description,\";
  print \"    customer_id, customer_name, total_amount, paid_amount, installments_total,\";
  print \"    payment_method, due_date, emission_date,\";
  print \"    reference_id, reference_type, sale_id, service_order_id,\";
  print \"    notes, is_manual, created_by_user_id, created_at, updated_at)\";
  print \"  VALUES (gen_random_uuid(), '\" TENANT \"', 'RECEIVABLE'::\\\"TransactionType\\\", '\" pg_status \"'::\\\"TransactionStatus\\\", \" q(desc_v) \",\";
  print \"    \" cust_sql \", \" q(cliente_nome) \", \" total \", \" pago \", \" num_p \",\";
  print \"    \" q(fp) \", '\" dv \"', '\" de \"',\";
  print \"    \" ref_id_sql \", \" ref_type_sql \", \" sale_sql \", \" os_sql \",\";
  print \"    \" q(obs) \", false, \" created_by \", '\" criado \"', NOW())\";
  print \"  RETURNING id\";
  print \")\";
  print \"INSERT INTO _map_financial_receivable (old_id, new_id) SELECT \" id \", id FROM nft;\";
}
END { print \"COMMIT;\" }
" /tmp/_cr.tsv > /tmp/_cr.sql

$PG -v ON_ERROR_STOP=1 -q < /tmp/_cr.sql > /tmp/_cr_err.log 2>&1 || { echo "FALHA contas_receber"; tail -20 /tmp/_cr_err.log; exit 1; }

# ----- Contas a Pagar -----
echo "=> Contas a pagar..."
cat > /tmp/_cp_q.sql <<'SQL'
SELECT id,
       IFNULL(REPLACE(REPLACE(descricao, '\r', ' '), '\n', ' '), '') AS desc_v,
       IFNULL(REPLACE(REPLACE(fornecedor, '\r', ' '), '\n', ' '), '') AS fornecedor,
       IFNULL(valor_total, 0) AS total,
       IFNULL(valor_pago, 0) AS pago,
       IFNULL(num_parcelas, 1) AS num_p,
       status,
       IFNULL(REPLACE(REPLACE(observacoes, '\r', ' '), '\n', ' '), '') AS obs,
       IFNULL(data_emissao, CURDATE()) AS de,
       IFNULL(data_vencimento, CURDATE()) AS dv,
       IFNULL(usuario_id, 5) AS uid,
       IFNULL(criado_em, NOW()) AS criado
FROM contas_pagar ORDER BY id;
SQL
$MYSQL < /tmp/_cp_q.sql 2>/dev/null | tail -n +2 > /tmp/_cp.tsv
echo "   -> $(wc -l < /tmp/_cp.tsv) contas a pagar"

awk -F'\t' -v TENANT="$TENANT_ID" "$mapstatus_awk
function q(s) { gsub(\"'\", \"''\", s); return s == \"\" ? \"NULL\" : \"'\" s \"'\" }
BEGIN { print \"BEGIN;\" }
{
  id=\$1; desc_v=\$2; fornecedor=\$3; total=\$4; pago=\$5; num_p=\$6;
  status=\$7; obs=\$8; de=\$9; dv=\$10; uid=\$11; criado=\$12;

  pg_status = mapstatus(status);
  created_by = \"COALESCE((SELECT new_id FROM _map_users WHERE old_id = \" uid \"), '64472a4d-3063-495e-94ea-294e419e1e2d')\";

  if (desc_v == \"\") desc_v = \"Conta a Pagar #\" id;

  print \"WITH nft AS (\";
  print \"  INSERT INTO financial_transactions (id, tenant_id, type, status, description,\";
  print \"    supplier, total_amount, paid_amount, installments_total,\";
  print \"    due_date, emission_date, notes, is_manual,\";
  print \"    created_by_user_id, created_at, updated_at)\";
  print \"  VALUES (gen_random_uuid(), '\" TENANT \"', 'PAYABLE'::\\\"TransactionType\\\", '\" pg_status \"'::\\\"TransactionStatus\\\", \" q(desc_v) \",\";
  print \"    \" q(fornecedor) \", \" total \", \" pago \", \" num_p \",\";
  print \"    '\" dv \"', '\" de \"', \" q(obs) \", true,\";
  print \"    \" created_by \", '\" criado \"', NOW())\";
  print \"  RETURNING id\";
  print \")\";
  print \"INSERT INTO _map_financial_payable (old_id, new_id) SELECT \" id \", id FROM nft;\";
}
END { print \"COMMIT;\" }
" /tmp/_cp.tsv > /tmp/_cp.sql

$PG -v ON_ERROR_STOP=1 -q < /tmp/_cp.sql > /tmp/_cp_err.log 2>&1 || { echo "FALHA contas_pagar"; tail -20 /tmp/_cp_err.log; exit 1; }

# ----- Installments (CR + CP) -----
echo "=> Installments (CR)..."
cat > /tmp/_cr_inst_q.sql <<'SQL'
SELECT id, conta_receber_id, numero,
       IFNULL(valor, 0) AS v, IFNULL(valor_pago, 0) AS vp,
       IFNULL(data_vencimento, CURDATE()) AS dv,
       IFNULL(data_pagamento, '') AS dp,
       IFNULL(forma_pagamento_efetiva, '') AS fp,
       status,
       IFNULL(REPLACE(REPLACE(observacoes, '\r', ' '), '\n', ' '), '') AS obs,
       IFNULL(criado_em, NOW()) AS criado
FROM contas_receber_parcelas ORDER BY id;
SQL
$MYSQL < /tmp/_cr_inst_q.sql 2>/dev/null | tail -n +2 > /tmp/_cr_inst.tsv

awk -F'\t' -v TENANT="$TENANT_ID" "$mapstatus_awk
function q(s) { gsub(\"'\", \"''\", s); return s == \"\" ? \"NULL\" : \"'\" s \"'\" }
function ts(s) { return s == \"\" ? \"NULL\" : \"'\" s \"'\" }
BEGIN { print \"BEGIN;\" }
{
  id=\$1; cr_id=\$2; numero=\$3; v=\$4; vp=\$5; dv=\$6; dp=\$7; fp=\$8; status=\$9; obs=\$10; criado=\$11;
  pg_status = mapstatus(status);
  print \"INSERT INTO installments (id, tenant_id, transaction_id, number, amount, paid_amount, due_date, paid_at, payment_method, status, notes, created_at, updated_at) VALUES (gen_random_uuid(), '\" TENANT \"', (SELECT new_id FROM _map_financial_receivable WHERE old_id = \" cr_id \"), \" numero \", \" v \", \" vp \", '\" dv \"', \" ts(dp) \", \" q(fp) \", '\" pg_status \"'::\\\"TransactionStatus\\\", \" q(obs) \", '\" criado \"', NOW());\";
}
END { print \"COMMIT;\" }
" /tmp/_cr_inst.tsv > /tmp/_cr_inst.sql
$PG -v ON_ERROR_STOP=1 -q < /tmp/_cr_inst.sql > /tmp/_cr_inst_err.log 2>&1 || { echo "FALHA cr installments"; tail -15 /tmp/_cr_inst_err.log; exit 1; }

echo "=> Installments (CP)..."
cat > /tmp/_cp_inst_q.sql <<'SQL'
SELECT id, conta_pagar_id, numero,
       IFNULL(valor, 0) AS v, IFNULL(valor_pago, 0) AS vp,
       IFNULL(data_vencimento, CURDATE()) AS dv,
       IFNULL(data_pagamento, '') AS dp,
       IFNULL(forma_pagamento, '') AS fp,
       status,
       IFNULL(REPLACE(REPLACE(observacoes, '\r', ' '), '\n', ' '), '') AS obs,
       IFNULL(criado_em, NOW()) AS criado
FROM contas_pagar_parcelas ORDER BY id;
SQL
$MYSQL < /tmp/_cp_inst_q.sql 2>/dev/null | tail -n +2 > /tmp/_cp_inst.tsv

awk -F'\t' -v TENANT="$TENANT_ID" "$mapstatus_awk
function q(s) { gsub(\"'\", \"''\", s); return s == \"\" ? \"NULL\" : \"'\" s \"'\" }
function ts(s) { return s == \"\" ? \"NULL\" : \"'\" s \"'\" }
BEGIN { print \"BEGIN;\" }
{
  id=\$1; cp_id=\$2; numero=\$3; v=\$4; vp=\$5; dv=\$6; dp=\$7; fp=\$8; status=\$9; obs=\$10; criado=\$11;
  pg_status = mapstatus(status);
  print \"INSERT INTO installments (id, tenant_id, transaction_id, number, amount, paid_amount, due_date, paid_at, payment_method, status, notes, created_at, updated_at) VALUES (gen_random_uuid(), '\" TENANT \"', (SELECT new_id FROM _map_financial_payable WHERE old_id = \" cp_id \"), \" numero \", \" v \", \" vp \", '\" dv \"', \" ts(dp) \", \" q(fp) \", '\" pg_status \"'::\\\"TransactionStatus\\\", \" q(obs) \", '\" criado \"', NOW());\";
}
END { print \"COMMIT;\" }
" /tmp/_cp_inst.tsv > /tmp/_cp_inst.sql
$PG -v ON_ERROR_STOP=1 -q < /tmp/_cp_inst.sql > /tmp/_cp_inst_err.log 2>&1 || { echo "FALHA cp installments"; tail -15 /tmp/_cp_inst_err.log; exit 1; }

echo "=> Resumo Fase 7:"
$PG -c "
  SELECT type, status, COUNT(*)
  FROM financial_transactions
  GROUP BY type, status
  ORDER BY type, status;
"
$PG -c "
  SELECT 'financial_transactions' tbl, COUNT(*) FROM financial_transactions
  UNION ALL SELECT 'installments', COUNT(*) FROM installments
  ORDER BY tbl;
"
