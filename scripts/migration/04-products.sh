#!/bin/bash
# Fase 4: produtos + variacoes + estoque
set -euo pipefail

TENANT_ID="dd308431-0525-417a-97c5-459e4b6cf45a"
PG="docker exec -i arenatech-postgres-prod psql -U arenatech arenatech"
MYSQL="mysql arena_dev"

$PG > /dev/null <<EOF
DROP TABLE IF EXISTS _map_products CASCADE;
DROP TABLE IF EXISTS _map_product_variations CASCADE;
DROP TABLE IF EXISTS _map_stock_items CASCADE;
CREATE TABLE _map_products (old_id BIGINT PRIMARY KEY, new_id UUID NOT NULL);
CREATE TABLE _map_product_variations (old_id BIGINT PRIMARY KEY, new_id UUID NOT NULL);
CREATE TABLE _map_stock_items (old_id BIGINT PRIMARY KEY, new_id UUID NOT NULL);
TRUNCATE TABLE products CASCADE;
EOF

# ---------- products ----------
echo "=> Products..."
$MYSQL -e "
  SELECT id,
         IFNULL(categoria_id, 0) AS cat_id,
         IFNULL(codigo_interno,'') AS sku,
         IFNULL(codigo_barras,'') AS barcode,
         nome AS name,
         IFNULL(descricao,'') AS descricao,
         IFNULL(marca,'') AS marca,
         eh_aparelho,
         eh_premium,
         IFNULL(aliquota_icms_diferencial, 0) AS icms_dif,
         IFNULL(ncm,'') AS ncm,
         IFNULL(cest,'') AS cest,
         IFNULL(imagem_url,'') AS image_url,
         controla_imei,
         usa_variacoes,
         IFNULL(preco_custo, 0) AS cost,
         IFNULL(preco_venda, 0) AS sale,
         IFNULL(preco_promocional, 0) AS promo,
         IFNULL(margem_lucro_padrao, 0) AS margin,
         IFNULL(estoque_minimo, 0) AS min_stk,
         IFNULL(quantidade_estoque, 0) AS curr_stk,
         ativo,
         IFNULL(criado_em, NOW()) AS criado
  FROM produtos
  ORDER BY id;
" --batch --raw 2>/dev/null | tail -n +2 > /tmp/_products.tsv

awk -F'\t' -v TENANT="$TENANT_ID" '
function q(s) { gsub("'\''", "'\'''\''", s); return s == "" ? "NULL" : "'\''" s "'\''" }
BEGIN { print "BEGIN;" }
{
  id=$1; cat_id=$2; sku=$3; barcode=$4; name=$5; descricao=$6; marca=$7;
  eh_aparelho=$8; eh_premium=$9; icms_dif=$10; ncm=$11; cest=$12; image_url=$13;
  controla_imei=$14; usa_variacoes=$15;
  cost=$16; sale=$17; promo=$18; margin=$19; min_stk=$20; curr_stk=$21;
  ativo=$22; criado=$23;

  active = (ativo == "1") ? "true" : "false";
  is_serialized = (controla_imei == "1") ? "true" : "false";
  is_premium = (eh_premium == "1") ? "true" : "false";
  has_variations = (usa_variacoes == "1") ? "true" : "false";
  promo_sql = (promo == "0" || promo == "0.00") ? "NULL" : promo;
  margin_sql = (margin == "0" || margin == "0.00") ? "NULL" : margin;
  icms_sql = (icms_dif == "0" || icms_dif == "0.00") ? "NULL" : icms_dif;
  gsub("'\''", "'\'''\''", name);
  deleted_sql = (ativo == "1") ? "NULL" : "NOW()";

  # FK categoria: lookup _map_categories
  if (cat_id != "0" && cat_id != "") {
    cat_sql = "(SELECT new_id FROM _map_categories WHERE old_id = " cat_id ")";
  } else {
    cat_sql = "NULL";
  }

  print "WITH np AS (";
  print "  INSERT INTO products (id, tenant_id, category_id, sku, barcode, name, description, brand,";
  print "    cost_price, sale_price, promotional_price, default_margin, ncm, cest, image_url, current_stock, min_stock,";
  print "    is_serialized, is_premium, has_variations, icms_differential_rate,";
  print "    active, deleted_at, created_at, updated_at)";
  print "  VALUES (gen_random_uuid(), '\''" TENANT "'\'', " cat_sql ", " q(sku) ", " q(barcode) ", '\''" name "'\'', " q(descricao) ", " q(marca) ",";
  print "    " cost ", " sale ", " promo_sql ", " margin_sql ", " q(ncm) ", " q(cest) ", " q(image_url) ", " curr_stk ", " min_stk ",";
  print "    " is_serialized ", " is_premium ", " has_variations ", " icms_sql ",";
  print "    " active ", " deleted_sql ", '\''" criado "'\'', NOW())";
  print "  RETURNING id";
  print ")";
  print "INSERT INTO _map_products (old_id, new_id) SELECT " id ", id FROM np;";
}
END { print "COMMIT;" }
' /tmp/_products.tsv > /tmp/_products.sql

$PG -v ON_ERROR_STOP=1 -q < /tmp/_products.sql > /tmp/_products_err.log 2>&1 || { echo "FALHA products"; tail -15 /tmp/_products_err.log; exit 1; }

# ---------- product_variations ----------
echo "=> Variations..."
$MYSQL -e "
  SELECT id, produto_id, IFNULL(sku,''), IFNULL(codigo_barras,''),
         IFNULL(preco_custo, 0), IFNULL(preco_venda, 0), IFNULL(preco_promocional, 0),
         IFNULL(estoque_minimo, 0), IFNULL(imagem_url, ''), ativo,
         IFNULL(criado_em, NOW())
  FROM produto_variacoes ORDER BY id;
" --batch --raw 2>/dev/null | tail -n +2 > /tmp/_variations.tsv

awk -F'\t' -v TENANT="$TENANT_ID" '
function q(s) { gsub("'\''", "'\'''\''", s); return s == "" ? "NULL" : "'\''" s "'\''" }
BEGIN { print "BEGIN;" }
{
  id=$1; prod_id=$2; sku=$3; barcode=$4; cost=$5; sale=$6; promo=$7;
  min_stk=$8; image_url=$9; ativo=$10; criado=$11;
  active = (ativo == "1") ? "true" : "false";
  promo_sql = (promo == "0" || promo == "0.00") ? "NULL" : promo;
  print "WITH nv AS (";
  print "  INSERT INTO product_variations (id, tenant_id, product_id, sku, barcode, cost_price, sale_price, promotional_price, min_stock, image_url, active, created_at, updated_at)";
  print "  VALUES (gen_random_uuid(), '\''" TENANT "'\'',";
  print "    (SELECT new_id FROM _map_products WHERE old_id = " prod_id "),";
  print "    " q(sku) ", " q(barcode) ", " cost ", " sale ", " promo_sql ", " min_stk ", " q(image_url) ", " active ", '\''" criado "'\'', NOW())";
  print "  RETURNING id";
  print ")";
  print "INSERT INTO _map_product_variations (old_id, new_id) SELECT " id ", id FROM nv;";
}
END { print "COMMIT;" }
' /tmp/_variations.tsv > /tmp/_variations.sql

$PG -v ON_ERROR_STOP=1 -q < /tmp/_variations.sql > /tmp/_variations_err.log 2>&1 || { echo "FALHA variations"; tail -15 /tmp/_variations_err.log; exit 1; }

# ---------- stock_items ----------
echo "=> Stock items..."
$MYSQL -e "
  SELECT id, produto_id, IFNULL(variacao_id, 0), IFNULL(imei, ''), IFNULL(numero_serie, ''),
         IFNULL(codigo_barras, ''), IFNULL(fornecedor_id, 0), IFNULL(nota_fiscal_entrada, ''),
         IFNULL(data_entrada, CURDATE()), IFNULL(preco_custo_unitario, 0), IFNULL(preco_venda_unitario, 0),
         IFNULL(condicao, 'novo'), IFNULL(grau_conservacao, ''), IFNULL(bateria_saude, 0), IFNULL(garantia_meses, 0),
         IFNULL(observacoes, ''), IFNULL(status, 'disponivel'),
         IFNULL(criado_em, NOW())
  FROM estoque_itens ORDER BY id;
" --batch --raw 2>/dev/null | tail -n +2 > /tmp/_stock.tsv

awk -F'\t' -v TENANT="$TENANT_ID" '
function q(s) { gsub("'\''", "'\'''\''", s); return s == "" ? "NULL" : "'\''" s "'\''" }
BEGIN { print "BEGIN;" }
{
  id=$1; prod_id=$2; var_id=$3; imei=$4; serial=$5; barcode=$6;
  sup_id=$7; nfe=$8; entry=$9; cost=$10; suggested=$11;
  cond=$12; grade=$13; battery=$14; warranty=$15; notes=$16; status=$17; criado=$18;

  # Map condicao
  pg_cond = "NEW";
  if (cond == "novo") pg_cond = "NEW";
  else if (cond == "seminovo") pg_cond = "USED";
  else if (cond == "usado") pg_cond = "USED";
  else if (cond == "defeito") pg_cond = "DEFECTIVE";

  # Map status
  pg_status = "AVAILABLE";
  if (status == "vendido") pg_status = "SOLD";
  else if (status == "reservado") pg_status = "RESERVED";
  else if (status == "defeito") pg_status = "DEFECTIVE";
  else if (status == "indisponivel") pg_status = "UNAVAILABLE";

  var_sql = (var_id != "0" && var_id != "") ? "(SELECT new_id FROM _map_product_variations WHERE old_id = " var_id ")" : "NULL";
  sup_sql = (sup_id != "0" && sup_id != "") ? "(SELECT new_id FROM _map_suppliers WHERE old_id = " sup_id ")" : "NULL";
  battery_sql = (battery == "0") ? "NULL" : battery;
  warranty_sql = (warranty == "0") ? "NULL" : warranty;
  suggested_sql = (suggested == "0" || suggested == "0.00") ? "NULL" : suggested;

  print "WITH ns AS (";
  print "  INSERT INTO stock_items (id, tenant_id, product_id, variation_id, supplier_id,";
  print "    imei, serial_number, barcode, condition, conservation_grade, battery_health, warranty_months,";
  print "    cost_price, suggested_sale_price, invoice_number, entry_date, status, notes,";
  print "    created_at, updated_at)";
  print "  VALUES (gen_random_uuid(), '\''" TENANT "'\'',";
  print "    (SELECT new_id FROM _map_products WHERE old_id = " prod_id "),";
  print "    " var_sql ", " sup_sql ", " q(imei) ", " q(serial) ", " q(barcode) ",";
  print "    '\''" pg_cond "'\''::\"StockItemCondition\", " q(grade) ", " battery_sql ", " warranty_sql ",";
  print "    " cost ", " suggested_sql ", " q(nfe) ", '\''" entry "'\'', '\''" pg_status "'\''::\"StockItemStatus\", " q(notes) ",";
  print "    '\''" criado "'\'', NOW())";
  print "  RETURNING id";
  print ")";
  print "INSERT INTO _map_stock_items (old_id, new_id) SELECT " id ", id FROM ns;";
}
END { print "COMMIT;" }
' /tmp/_stock.tsv > /tmp/_stock.sql

$PG -v ON_ERROR_STOP=1 -q < /tmp/_stock.sql > /tmp/_stock_err.log 2>&1 || { echo "FALHA stock_items"; tail -15 /tmp/_stock_err.log; exit 1; }

echo "=> Resumo Fase 4:"
$PG -c "
  SELECT 'products' tbl, COUNT(*) FROM products
  UNION ALL SELECT 'product_variations', COUNT(*) FROM product_variations
  UNION ALL SELECT 'stock_items', COUNT(*) FROM stock_items
  ORDER BY tbl;
"
