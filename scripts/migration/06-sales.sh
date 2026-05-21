#!/bin/bash
# Fase 6: pdv_vendas -> sales + sale_items
set -euo pipefail

TENANT_ID="dd308431-0525-417a-97c5-459e4b6cf45a"
PG="docker exec -i arenatech-postgres-prod psql -U arenatech arenatech"
MYSQL="mysql arena_dev --batch --raw"

$PG > /dev/null <<EOF
DROP TABLE IF EXISTS _map_sales CASCADE;
CREATE TABLE _map_sales (old_id BIGINT PRIMARY KEY, new_id UUID NOT NULL);
TRUNCATE TABLE sales CASCADE;

-- Produto placeholder para sale_items sem produto (descricao_avulsa)
INSERT INTO products (id, tenant_id, name, cost_price, sale_price, active, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', '${TENANT_ID}', '[Item avulso]', 0, 0, false, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
EOF

echo "=> Sales..."
cat > /tmp/_sales_q.sql <<'SQL'
SELECT id, numero_venda,
       IFNULL(cliente_id, 0) AS cliente,
       IFNULL(vendedor_id, 5) AS vendedor,
       IFNULL(ordem_servico_origem_id, 0) AS os_id,
       IFNULL(subtotal, 0) AS sub,
       IFNULL(desconto, 0) AS desc_v,
       IFNULL(desconto_tipo, '') AS desc_tipo,
       IFNULL(REPLACE(REPLACE(desconto_motivo, '\r', ' '), '\n', ' '), '') AS desc_motivo,
       IFNULL(valor_total, 0) AS total,
       IFNULL(forma_pagamento, '') AS fp,
       IFNULL(valor_pago, 0) AS pago,
       IFNULL(troco, 0) AS troco,
       IFNULL(pagamento_detalhes, '') AS pgto_det,
       status,
       IFNULL(REPLACE(REPLACE(observacoes, '\r', ' '), '\n', ' '), '') AS obs,
       IFNULL(data_venda, NOW()) AS data_v,
       IFNULL(data_cancelamento, '') AS data_canc,
       IFNULL(REPLACE(REPLACE(motivo_cancelamento, '\r', ' '), '\n', ' '), '') AS motivo_canc,
       IFNULL(usuario_cancelamento_id, 0) AS user_canc,
       IFNULL(link_publico, CONCAT('legacy-sale-', id)) AS pub,
       IFNULL(criado_em, NOW()) AS criado
FROM pdv_vendas ORDER BY id;
SQL
$MYSQL < /tmp/_sales_q.sql 2>/dev/null | tail -n +2 > /tmp/_sales.tsv
echo "   -> $(wc -l < /tmp/_sales.tsv) vendas"

awk -F'\t' -v TENANT="$TENANT_ID" '
function q(s) { gsub("'\''", "'\'''\''", s); return s == "" ? "NULL" : "'\''" s "'\''" }
function ts(s) { return s == "" ? "NULL" : "'\''" s "'\''" }
BEGIN { print "BEGIN;" }
{
  id=$1; numero=$2; cliente=$3; vendedor=$4; os_id=$5;
  sub_v=$6; desc_v=$7; desc_tipo=$8; desc_motivo=$9; total=$10;
  fp=$11; pago=$12; troco=$13; pgto_det=$14;
  status=$15; obs=$16; data_v=$17; data_canc=$18; motivo_canc=$19;
  user_canc=$20; pub=$21; criado=$22;

  pg_status = "COMPLETED";
  if (status == "finalizada") pg_status = "COMPLETED";
  else if (status == "cancelada") pg_status = "CANCELLED";
  else if (status == "estornada") pg_status = "REFUNDED";
  else if (status == "estornada_parcial") pg_status = "PARTIALLY_REFUNDED";
  else if (status == "rascunho") pg_status = "DRAFT";

  cust_sql = (cliente != "0") ? "(SELECT new_id FROM _map_customers WHERE old_id = " cliente ")" : "NULL";
  seller_sql = "COALESCE((SELECT new_id FROM _map_users WHERE old_id = " vendedor "), '\''64472a4d-3063-495e-94ea-294e419e1e2d'\'')";
  os_sql = (os_id != "0") ? "(SELECT new_id FROM _map_service_orders WHERE old_id = " os_id ")" : "NULL";
  is_os = (os_id != "0") ? "true" : "false";
  canc_user_sql = (user_canc != "0") ? "(SELECT new_id FROM _map_users WHERE old_id = " user_canc ")" : "NULL";

  # desc_tipo Laravel: percentual|valor -> Postgres text: PERCENT|FIXED|null
  pg_desc_type = "NULL";
  if (desc_tipo == "percentual") pg_desc_type = "'\''PERCENT'\''";
  else if (desc_tipo == "valor") pg_desc_type = "'\''FIXED'\''";

  # payment_details: tentar como JSON; se nao for JSON, NULL
  if (pgto_det == "" || pgto_det == "null") pgto_det_sql = "NULL";
  else { gsub("'\''", "'\'''\''", pgto_det); pgto_det_sql = "'\''" pgto_det "'\''::jsonb" }

  print "WITH ns AS (";
  print "  INSERT INTO sales (id, tenant_id, number, customer_id, seller_id, service_order_id, is_os_payment, status,";
  print "    subtotal, discount_type, discount_value, discount_amount, discount_reason, total_amount,";
  print "    paid_amount, change_amount, payment_details, observations,";
  print "    sale_date, cancelled_at, cancelled_by_id, cancellation_reason, public_link,";
  print "    created_at, updated_at)";
  print "  VALUES (gen_random_uuid(), '\''" TENANT "'\'', " q(numero) ", " cust_sql ", " seller_sql ", " os_sql ", " is_os ", '\''" pg_status "'\''::\"SaleStatus\",";
  print "    " sub_v ", " pg_desc_type ", " desc_v ", " desc_v ", " q(desc_motivo) ", " total ",";
  print "    " pago ", " troco ", " pgto_det_sql ", " q(obs) ",";
  print "    '\''" data_v "'\'', " ts(data_canc) ", " canc_user_sql ", " q(motivo_canc) ", " q(pub) ",";
  print "    '\''" criado "'\'', NOW())";
  print "  RETURNING id";
  print ")";
  print "INSERT INTO _map_sales (old_id, new_id) SELECT " id ", id FROM ns;";
}
END { print "COMMIT;" }
' /tmp/_sales.tsv > /tmp/_sales.sql

$PG -v ON_ERROR_STOP=1 -q < /tmp/_sales.sql > /tmp/_sales_err.log 2>&1 || { echo "FALHA sales"; tail -20 /tmp/_sales_err.log; exit 1; }

# ----- Sale items -----
echo "=> Sale items..."
cat > /tmp/_sale_items_q.sql <<'SQL'
SELECT id, venda_id, IFNULL(produto_id, 0) AS prod,
       IFNULL(REPLACE(REPLACE(descricao_avulsa, '\r', ' '), '\n', ' '), '') AS desc_avulsa,
       IFNULL(quantidade, 1) AS qty,
       IFNULL(preco_unitario, 0) AS preco,
       IFNULL(preco_custo_unitario, 0) AS custo,
       IFNULL(desconto_item, 0) AS desc_item,
       IFNULL(subtotal, 0) AS sub,
       IFNULL(criado_em, NOW()) AS criado
FROM pdv_venda_itens ORDER BY id;
SQL
$MYSQL < /tmp/_sale_items_q.sql 2>/dev/null | tail -n +2 > /tmp/_sale_items.tsv
echo "   -> $(wc -l < /tmp/_sale_items.tsv) itens"

awk -F'\t' -v TENANT="$TENANT_ID" '
function q(s) { gsub("'\''", "'\'''\''", s); return s == "" ? "NULL" : "'\''" s "'\''" }
BEGIN { print "BEGIN;" }
{
  id=$1; venda_id=$2; prod=$3; desc_avulsa=$4; qty=$5; preco=$6; custo=$7; desc_item=$8; subtotal=$9; criado=$10;
  # Se produto nao existe, usar placeholder
  prod_sql = (prod != "0") ? "COALESCE((SELECT new_id FROM _map_products WHERE old_id = " prod "), '\''00000000-0000-0000-0000-000000000001'\'')" : "'\''00000000-0000-0000-0000-000000000001'\''";
  description = (desc_avulsa != "") ? desc_avulsa : "Item migrado";
  print "INSERT INTO sale_items (id, tenant_id, sale_id, product_id, description, quantity, unit_price, cost_price, discount, total, created_at) VALUES (gen_random_uuid(), '\''" TENANT "'\'', (SELECT new_id FROM _map_sales WHERE old_id = " venda_id "), " prod_sql ", " q(description) ", " qty ", " preco ", " custo ", " desc_item ", " subtotal ", '\''" criado "'\'');";
}
END { print "COMMIT;" }
' /tmp/_sale_items.tsv > /tmp/_sale_items.sql

$PG -v ON_ERROR_STOP=1 -q < /tmp/_sale_items.sql > /tmp/_sale_items_err.log 2>&1 || { echo "FALHA sale items"; tail -15 /tmp/_sale_items_err.log; exit 1; }

echo "=> Resumo Fase 6:"
$PG -c "
  SELECT 'sales' tbl, COUNT(*) FROM sales
  UNION ALL SELECT 'sale_items', COUNT(*) FROM sale_items
  ORDER BY tbl;
"
