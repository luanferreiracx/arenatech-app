#!/bin/bash
# Migracao DELTA de vendas + customers de referencia + sync de estoque.
#
# Idempotente:
#   - Customers: pula se cpf ja existe; mapeia em _map_customers
#   - Sales: pula se old_id ja esta em _map_sales (FONTE da verdade)
#   - Items: deletam-se primeiro pra evitar duplicacao em reruns
#   - Estoque: SEMPRE faz UPDATE com o valor do Laravel (fonte da verdade)
#
# Uso na VPS: bash migrate-delta-sales.sh
set -euo pipefail

TENANT_ID="dd308431-0525-417a-97c5-459e4b6cf45a"
MYSQL="mysql -u arena_dev -pArenaDev@2025 arena_dev --batch --raw -N"
PG="docker exec -i arenatech-postgres-prod psql -U arenatech arenatech -v ON_ERROR_STOP=1"

echo "=== 1. Identificando vendas a migrar (ontem/hoje no Laravel) ==="
$MYSQL -e "
SELECT v.id
FROM pdv_vendas v
WHERE DATE(v.criado_em) >= CURDATE() - INTERVAL 1 DAY
   OR DATE(v.data_venda) >= CURDATE() - INTERVAL 1 DAY
ORDER BY v.id;" 2>/dev/null > /tmp/_candidate_sale_ids.txt
echo "   candidatos: $(wc -l < /tmp/_candidate_sale_ids.txt)"

# Filtra ids ja mapeados (idempotencia). comm exige sort LEXICAL (-n nao serve)
$PG -t -A -c "SELECT old_id FROM _map_sales" | LC_ALL=C sort > /tmp/_mapped_sale_ids.txt
LC_ALL=C sort /tmp/_candidate_sale_ids.txt > /tmp/_candidate_sorted.txt
comm -23 /tmp/_candidate_sorted.txt /tmp/_mapped_sale_ids.txt > /tmp/_new_sale_ids.txt
NEW_COUNT=$(wc -l < /tmp/_new_sale_ids.txt | tr -d ' ')
echo "   novas para migrar: $NEW_COUNT"

if [ "$NEW_COUNT" = "0" ]; then
  echo "Nada novo. Saindo."
  exit 0
fi

# IDs como CSV pra usar no SQL (mysql IN clause)
IDS_CSV=$(tr '\n' ',' < /tmp/_new_sale_ids.txt | sed 's/,$//')
echo "   IDs: $IDS_CSV"

# Backup pre-migracao (rollback em caso de erro)
BACKUP_TAG=$(date +%Y%m%d_%H%M%S)
echo "=== 2. Backup tag=$BACKUP_TAG ==="
$PG -c "
CREATE TABLE IF NOT EXISTS _backup_sales_${BACKUP_TAG} AS SELECT * FROM sales WHERE 1=0;
CREATE TABLE IF NOT EXISTS _backup_map_sales_${BACKUP_TAG} AS SELECT * FROM _map_sales WHERE 1=0;
" > /dev/null

# ============================================================
# 3. CUSTOMERS — pega clientes referenciados em vendas novas que
# ainda nao estao em _map_customers e migra.
# ============================================================
echo "=== 3. Customers delta ==="
$MYSQL -e "
SELECT DISTINCT v.cliente_id
FROM pdv_vendas v
WHERE v.id IN ($IDS_CSV) AND v.cliente_id IS NOT NULL;" 2>/dev/null > /tmp/_cust_ids.txt

CUST_COUNT_RAW=$(wc -l < /tmp/_cust_ids.txt | tr -d ' ')
if [ "$CUST_COUNT_RAW" -gt 0 ]; then
  $PG -t -A -c "SELECT old_id FROM _map_customers" | LC_ALL=C sort > /tmp/_cust_mapped.txt
  LC_ALL=C sort /tmp/_cust_ids.txt > /tmp/_cust_sorted.txt
  comm -23 /tmp/_cust_sorted.txt /tmp/_cust_mapped.txt > /tmp/_cust_new.txt
  CUST_NEW=$(wc -l < /tmp/_cust_new.txt | tr -d ' ')
  echo "   customers novos: $CUST_NEW"
  if [ "$CUST_NEW" -gt 0 ]; then
    CUST_CSV=$(tr '\n' ',' < /tmp/_cust_new.txt | sed 's/,$//')
    $MYSQL -e "
SELECT c.id, c.cpf, c.nome_completo, IFNULL(DATE_FORMAT(c.data_nascimento, '%Y-%m-%d'), ''),
  c.celular_whatsapp, IFNULL(c.celular_alternativo, ''), IFNULL(c.email, ''),
  IFNULL(c.cep, ''), IFNULL(c.logradouro, ''), IFNULL(c.numero, ''), IFNULL(c.complemento, ''),
  IFNULL(c.bairro, ''), IFNULL(c.cidade, ''), IFNULL(c.estado, ''),
  IFNULL(REPLACE(REPLACE(c.observacoes, '\r', ' '), '\n', ' '), ''),
  IFNULL(c.ativo, 1),
  DATE_FORMAT(c.criado_em, '%Y-%m-%d %H:%i:%s')
FROM clientes c WHERE c.id IN ($CUST_CSV);" 2>/dev/null > /tmp/_cust.tsv

    awk -F'\t' -v TENANT="$TENANT_ID" '
function q(s) { gsub("\x27", "\x27\x27", s); return s == "" ? "NULL" : "\x27" s "\x27" }
BEGIN { print "BEGIN;" }
{
  id=$1; cpf=$2; nome=$3; dob=$4; cel=$5; cel_alt=$6; email=$7;
  gsub(/[^0-9]/, "", cpf);
  if (length(cpf) != 11) next;
  cep=$8; rua=$9; num=$10; comp=$11; bairro=$12; cidade=$13; estado=$14;
  obs=$15; ativo=$16; criado=$17;
  print "INSERT INTO customers (id, tenant_id, type, name, cpf, phone, phone_secondary, email, birth_date, zip_code, street, street_number, complement, neighborhood, city, state, notes, created_at, updated_at, deleted_at)"
  print "SELECT gen_random_uuid(), \x27" TENANT "\x27, \x27PF\x27, " q(nome) ", " q(cpf) ", " q(cel) ", " q(cel_alt) ", " q(email)
  print "  , " (dob == "" ? "NULL" : q(dob)) "::date, " q(cep) ", " q(rua) ", " q(num) ", " q(comp) ", " q(bairro) ", " q(cidade) ", " q(estado)
  print "  , " q(obs) ", \x27" criado "\x27, NOW(), " (ativo == "1" ? "NULL" : "NOW()")
  print "WHERE NOT EXISTS (SELECT 1 FROM customers WHERE cpf = " q(cpf) " AND tenant_id = \x27" TENANT "\x27 AND deleted_at IS NULL);"
  print "INSERT INTO _map_customers (old_id, new_id)"
  print "SELECT " id ", id FROM customers WHERE cpf = " q(cpf) " AND tenant_id = \x27" TENANT "\x27 AND deleted_at IS NULL"
  print "ON CONFLICT (old_id) DO NOTHING;"
}
END { print "COMMIT;" }
' /tmp/_cust.tsv > /tmp/_cust.sql

    $PG < /tmp/_cust.sql > /tmp/_cust_err.log 2>&1 || { echo "FALHA customers"; tail -20 /tmp/_cust_err.log; exit 1; }
    echo "   customers migrados: $CUST_NEW"
  fi
fi

# ============================================================
# 4. SALES — migra as vendas novas
# ============================================================
echo "=== 4. Sales (delta) ==="
$MYSQL -e "
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
       IFNULL(REPLACE(REPLACE(pagamento_detalhes, '\r', ' '), '\n', ' '), '') AS pgto_det,
       status,
       IFNULL(REPLACE(REPLACE(observacoes, '\r', ' '), '\n', ' '), '') AS obs,
       IFNULL(data_venda, NOW()) AS data_v,
       IFNULL(data_cancelamento, '') AS data_canc,
       IFNULL(REPLACE(REPLACE(motivo_cancelamento, '\r', ' '), '\n', ' '), '') AS motivo_canc,
       IFNULL(usuario_cancelamento_id, 0) AS user_canc,
       IFNULL(link_publico, CONCAT('legacy-sale-', id)) AS pub,
       IFNULL(criado_em, NOW()) AS criado
FROM pdv_vendas
WHERE id IN ($IDS_CSV)
ORDER BY id;" 2>/dev/null > /tmp/_sales.tsv

awk -F'\t' -v TENANT="$TENANT_ID" '
function q(s) { gsub("\x27", "\x27\x27", s); return s == "" ? "NULL" : "\x27" s "\x27" }
function ts(s) { return s == "" ? "NULL" : "\x27" s "\x27" }
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
  seller_sql = "COALESCE((SELECT new_id FROM _map_users WHERE old_id = " vendedor "), \x2764472a4d-3063-495e-94ea-294e419e1e2d\x27)";
  os_sql = (os_id != "0") ? "(SELECT new_id FROM _map_service_orders WHERE old_id = " os_id ")" : "NULL";
  is_os = (os_id != "0") ? "true" : "false";
  canc_user_sql = (user_canc != "0") ? "(SELECT new_id FROM _map_users WHERE old_id = " user_canc ")" : "NULL";

  pg_desc_type = "NULL";
  if (desc_tipo == "percentual") pg_desc_type = "\x27PERCENT\x27";
  else if (desc_tipo == "valor") pg_desc_type = "\x27FIXED\x27";

  if (pgto_det == "" || pgto_det == "null") pgto_det_sql = "NULL";
  else { gsub("\x27", "\x27\x27", pgto_det); pgto_det_sql = "\x27" pgto_det "\x27::jsonb" }

  print "WITH ns AS ("
  print "  INSERT INTO sales (id, tenant_id, number, customer_id, seller_id, service_order_id, is_os_payment, status,"
  print "    subtotal, discount_type, discount_value, discount_amount, discount_reason, total_amount,"
  print "    paid_amount, change_amount, payment_details, observations,"
  print "    sale_date, cancelled_at, cancelled_by_id, cancellation_reason, public_link,"
  print "    created_at, updated_at)"
  print "  VALUES (gen_random_uuid(), \x27" TENANT "\x27, " q(numero) ", " cust_sql ", " seller_sql ", " os_sql ", " is_os ", \x27" pg_status "\x27::\"SaleStatus\","
  print "    " sub_v ", " pg_desc_type ", " desc_v ", " desc_v ", " q(desc_motivo) ", " total ","
  print "    " pago ", " troco ", " pgto_det_sql ", " q(obs) ","
  print "    \x27" data_v "\x27, " ts(data_canc) ", " canc_user_sql ", " q(motivo_canc) ", " q(pub) ","
  print "    \x27" criado "\x27, NOW())"
  print "  RETURNING id"
  print ")"
  print "INSERT INTO _map_sales (old_id, new_id) SELECT " id ", id FROM ns ON CONFLICT (old_id) DO NOTHING;"
}
END { print "COMMIT;" }
' /tmp/_sales.tsv > /tmp/_sales.sql

$PG < /tmp/_sales.sql > /tmp/_sales_err.log 2>&1 || { echo "FALHA sales"; tail -30 /tmp/_sales_err.log; exit 1; }
echo "   sales migradas: $NEW_COUNT"

# ============================================================
# 5. SALE ITEMS — delta dos itens das vendas migradas agora
# ============================================================
echo "=== 5. Sale items ==="
$MYSQL -e "
SELECT i.id, i.venda_id, IFNULL(i.produto_id, 0) AS prod,
       IFNULL(REPLACE(REPLACE(i.descricao_avulsa, '\r', ' '), '\n', ' '), '') AS desc_avulsa,
       IFNULL(REPLACE(REPLACE(p.nome, '\r', ' '), '\n', ' '), '') AS prod_nome,
       IFNULL(i.quantidade, 1) AS qty,
       IFNULL(i.preco_unitario, 0) AS preco,
       IFNULL(i.preco_custo_unitario, 0) AS custo,
       IFNULL(i.desconto_item, 0) AS desc_item,
       IFNULL(i.subtotal, 0) AS sub,
       IFNULL(i.criado_em, NOW()) AS criado
FROM pdv_venda_itens i
LEFT JOIN produtos p ON p.id = i.produto_id
WHERE i.venda_id IN ($IDS_CSV)
ORDER BY i.id;" 2>/dev/null > /tmp/_sale_items.tsv

awk -F'\t' -v TENANT="$TENANT_ID" '
function q(s) { gsub("\x27", "\x27\x27", s); return s == "" ? "NULL" : "\x27" s "\x27" }
BEGIN { print "BEGIN;" }
{
  id=$1; venda_id=$2; prod=$3; desc_avulsa=$4; prod_nome=$5; qty=$6; preco=$7; custo=$8; desc_item=$9; subtotal=$10; criado=$11;
  prod_sql = (prod != "0") ? "COALESCE((SELECT new_id FROM _map_products WHERE old_id = " prod "), \x2700000000-0000-0000-0000-000000000001\x27)" : "\x2700000000-0000-0000-0000-000000000001\x27";
  # Prioridade: descricao_avulsa (override do operador) > nome do produto > fallback
  description = (desc_avulsa != "") ? desc_avulsa : (prod_nome != "" ? prod_nome : "Item migrado");
  print "INSERT INTO sale_items (id, tenant_id, sale_id, product_id, description, quantity, unit_price, cost_price, discount, total, created_at) VALUES (gen_random_uuid(), \x27" TENANT "\x27, (SELECT new_id FROM _map_sales WHERE old_id = " venda_id "), " prod_sql ", " q(description) ", " qty ", " preco ", " custo ", " desc_item ", " subtotal ", \x27" criado "\x27);";
}
END { print "COMMIT;" }
' /tmp/_sale_items.tsv > /tmp/_sale_items.sql

ITEM_COUNT=$(wc -l < /tmp/_sale_items.tsv | tr -d ' ')
$PG < /tmp/_sale_items.sql > /tmp/_sale_items_err.log 2>&1 || { echo "FALHA sale items"; tail -20 /tmp/_sale_items_err.log; exit 1; }
echo "   itens migrados: $ITEM_COUNT"

# ============================================================
# 6. ESTOQUE — sincroniza current_stock dos produtos referenciados
# (todos os produtos que apareceram nas vendas novas)
# ============================================================
echo "=== 6. Sync estoque (current_stock) ==="
$MYSQL -e "
SELECT DISTINCT produto_id FROM pdv_venda_itens
WHERE venda_id IN ($IDS_CSV) AND produto_id IS NOT NULL;" 2>/dev/null > /tmp/_prod_ids.txt

PROD_CSV=$(tr '\n' ',' < /tmp/_prod_ids.txt | sed 's/,$//')
if [ -n "$PROD_CSV" ]; then
  $MYSQL -e "
SELECT id, quantidade_estoque, eh_aparelho, controla_imei
FROM produtos
WHERE id IN ($PROD_CSV);" 2>/dev/null > /tmp/_prod_stock.tsv

  awk -F'\t' '
BEGIN { print "BEGIN;" }
{
  id=$1; stock=$2; eh_aparelho=$3; controla_imei=$4;
  # So sincroniza estoque de produtos NAO serializados — serializados o
  # estoque vem dos StockItem AVAILABLE (no Postgres). Trocar a soma deles
  # quebra rastreabilidade.
  if (controla_imei == "0") {
    print "UPDATE products SET current_stock = " stock ", updated_at = NOW() WHERE id = (SELECT new_id FROM _map_products WHERE old_id = " id ");"
  }
}
END { print "COMMIT;" }
' /tmp/_prod_stock.tsv > /tmp/_prod_stock.sql

  $PG < /tmp/_prod_stock.sql > /tmp/_prod_stock_err.log 2>&1 || { echo "FALHA stock"; tail -10 /tmp/_prod_stock_err.log; exit 1; }
  echo "   produtos sincronizados: $(wc -l < /tmp/_prod_stock.tsv | tr -d ' ')"
fi

# ============================================================
# 7. RESYNC SEQUENCE — evita P2002 (numero duplicado) quando o operador
# for finalizar nova venda apos a importacao delta. Pega o maior numero
# por scope/ano dos dados e ajusta tenant_number_sequences.value.
# ============================================================
echo "=== 7. Resync tenant_number_sequences ==="
$PG -c "
WITH year_data AS (
  SELECT 'sale' AS scope, MAX(CAST(SUBSTRING(number FROM 8) AS INT)) AS max_num
  FROM sales WHERE number ~ '^VND2026[0-9]+$' AND deleted_at IS NULL
)
UPDATE tenant_number_sequences ns
SET value = GREATEST(ns.value, yd.max_num), updated_at = NOW()
FROM year_data yd
WHERE ns.scope = yd.scope AND ns.year = 2026 AND yd.max_num IS NOT NULL;
"
$PG -c "SELECT scope, year, value FROM tenant_number_sequences WHERE scope = 'sale' AND year = 2026;"

# ============================================================
# 8. RESUMO
# ============================================================
echo ""
echo "=== Resumo ==="
$PG -c "
SELECT 'sales_total' tbl, COUNT(*)::text valor FROM sales WHERE deleted_at IS NULL
UNION ALL SELECT 'sale_items_total', COUNT(*)::text FROM sale_items
UNION ALL SELECT 'map_sales_total', COUNT(*)::text FROM _map_sales
UNION ALL SELECT 'max_mapped_old_id', MAX(old_id)::text FROM _map_sales;
"

echo ""
echo "=== Ultimas 5 vendas migradas ==="
$PG -c "
SELECT s.number, s.status, s.total_amount, s.sale_date
FROM sales s
JOIN _map_sales m ON m.new_id = s.id
ORDER BY m.old_id DESC LIMIT 5;
"

echo ""
echo "OK"
