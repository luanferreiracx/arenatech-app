#!/bin/bash
# Migracao incremental Laravel arena_dev → Postgres prod.
# Adiciona o que faltou na migracao anterior:
#   - product_attributes + values + configs
#   - product_photos
#   - product_category_pivots
#   - product_variation_attributes
#   - stock_movements historicos
#   - device_purchases
#   - sale_upgrades
#   - financial_categories
# Idempotente (ON CONFLICT DO NOTHING). Roda inteiro via SSH.
set -euo pipefail

VPS="contabo"
TENANT_ID="dd308431-0525-417a-97c5-459e4b6cf45a"

echo "=== Sending migration script to VPS ==="
ssh "$VPS" "TENANT_ID=$TENANT_ID bash -s" << 'REMOTE'
set -euo pipefail
MYSQL="mysql -u arena_dev -pArenaDev@2025 arena_dev --batch --raw -N"
PG="docker exec -i arenatech-postgres-prod psql -U arenatech arenatech -v ON_ERROR_STOP=1"

# Cria mapping tables novas (atributos)
echo "=> Criando _map_attributes / _map_attribute_values..."
$PG <<'SQL' > /dev/null
DROP TABLE IF EXISTS _map_attributes CASCADE;
DROP TABLE IF EXISTS _map_attribute_values CASCADE;
CREATE TABLE _map_attributes (old_id BIGINT PRIMARY KEY, new_id UUID NOT NULL);
CREATE TABLE _map_attribute_values (old_id BIGINT PRIMARY KEY, new_id UUID NOT NULL);
SQL

# -------------------- 1. product_attributes --------------------
echo "=> Migrando product_attributes..."
$MYSQL -e "SELECT id, nome, slug, ordem, ativo FROM produto_atributos ORDER BY id;" 2>/dev/null > /tmp/_attrs.tsv

awk -F'\t' -v TENANT="$TENANT_ID" '
function q(s) { gsub("\x27", "\x27\x27", s); return s == "" ? "NULL" : "\x27" s "\x27" }
BEGIN { print "BEGIN;" }
{
  id=$1; nome=$2; slug=$3; ordem=$4; ativo=$5;
  active = (ativo == "1") ? "true" : "false";
  print "WITH na AS ("
  print "  INSERT INTO product_attributes (id, tenant_id, name, slug, \"order\", active, created_at, updated_at)"
  print "  VALUES (gen_random_uuid(), \x27" TENANT "\x27, " q(nome) ", " q(slug) ", " ordem ", " active ", NOW(), NOW())"
  print "  ON CONFLICT (tenant_id, slug) DO UPDATE SET name = EXCLUDED.name"
  print "  RETURNING id"
  print ")"
  print "INSERT INTO _map_attributes (old_id, new_id) SELECT " id ", id FROM na;"
}
END { print "COMMIT;" }
' /tmp/_attrs.tsv > /tmp/_attrs.sql
$PG < /tmp/_attrs.sql > /dev/null
echo "   $(wc -l < /tmp/_attrs.tsv) attrs mapeados"

# -------------------- 2. product_attribute_values (idempotente) --------------------
echo "=> Migrando product_attribute_values..."
$MYSQL -e "SELECT id, atributo_id, valor, IFNULL(valor_exibicao, ''), IFNULL(codigo, ''), ordem, ativo FROM produto_atributo_valores ORDER BY id;" 2>/dev/null > /tmp/_avals.tsv

awk -F'\t' -v TENANT="$TENANT_ID" '
function q(s) { gsub("\x27", "\x27\x27", s); return s == "" ? "NULL" : "\x27" s "\x27" }
BEGIN { print "BEGIN;" }
{
  id=$1; attr_id=$2; valor=$3; valor_exib=$4; codigo=$5; ordem=$6; ativo=$7;
  active = (ativo == "1") ? "true" : "false";
  # Cria (no-op se ja existe)
  print "INSERT INTO product_attribute_values (id, tenant_id, attribute_id, value, display_value, code, \"order\", active, created_at, updated_at)"
  print "VALUES (gen_random_uuid(), \x27" TENANT "\x27,"
  print "  (SELECT new_id FROM _map_attributes WHERE old_id = " attr_id "),"
  print "  " q(valor) ", " q(valor_exib) ", " q(codigo) ", " ordem ", " active ", NOW(), NOW())"
  print "ON CONFLICT (attribute_id, value) DO NOTHING;"
  # Re-popula mapping pelo (attr, value)
  print "INSERT INTO _map_attribute_values (old_id, new_id)"
  print "SELECT " id ", pav.id FROM product_attribute_values pav"
  print "  JOIN _map_attributes ma ON ma.new_id = pav.attribute_id"
  print "WHERE ma.old_id = " attr_id " AND pav.value = " q(valor)
  print "ON CONFLICT (old_id) DO NOTHING;"
}
END { print "COMMIT;" }
' /tmp/_avals.tsv > /tmp/_avals.sql
$PG < /tmp/_avals.sql > /dev/null
echo "   $(wc -l < /tmp/_avals.tsv) values"

# -------------------- 3. product_attribute_configs --------------------
echo "=> Migrando product_attribute_configs..."
$MYSQL -e "SELECT produto_id, atributo_id, ordem FROM produto_atributos_config ORDER BY id;" 2>/dev/null > /tmp/_acfg.tsv

awk -F'\t' '
BEGIN { print "BEGIN;" }
{
  prod=$1; attr=$2; ord=$3;
  print "INSERT INTO product_attribute_configs (id, product_id, attribute_id, \"order\")"
  print "SELECT gen_random_uuid(),"
  print "  (SELECT new_id FROM _map_products WHERE old_id = " prod "),"
  print "  (SELECT new_id FROM _map_attributes WHERE old_id = " attr "),"
  print "  " ord
  print "WHERE EXISTS (SELECT 1 FROM _map_products WHERE old_id = " prod ")"
  print "  AND EXISTS (SELECT 1 FROM _map_attributes WHERE old_id = " attr ")"
  print "ON CONFLICT (product_id, attribute_id) DO NOTHING;"
}
END { print "COMMIT;" }
' /tmp/_acfg.tsv > /tmp/_acfg.sql
$PG < /tmp/_acfg.sql > /dev/null
echo "   $(wc -l < /tmp/_acfg.tsv) configs"

# -------------------- 4. product_photos --------------------
echo "=> Migrando product_photos..."
$MYSQL -e "SELECT produto_id, imagem_url, IFNULL(imagem_public_id, ''), ordem, eh_principal FROM produto_fotos ORDER BY id;" 2>/dev/null > /tmp/_photos.tsv

awk -F'\t' -v TENANT="$TENANT_ID" '
function q(s) { gsub("\x27", "\x27\x27", s); return s == "" ? "NULL" : "\x27" s "\x27" }
BEGIN { print "BEGIN;" }
{
  prod=$1; url=$2; pub_id=$3; ord=$4; principal=$5;
  is_primary = (principal == "1") ? "true" : "false";
  # Idempotente: so insere se nao existe foto desse produto com a mesma url
  print "INSERT INTO product_photos (id, tenant_id, product_id, url, \"order\", is_primary, created_at, updated_at)"
  print "SELECT gen_random_uuid(), \x27" TENANT "\x27,"
  print "  (SELECT new_id FROM _map_products WHERE old_id = " prod "),"
  print "  " q(url) ", " ord ", " is_primary ", NOW(), NOW()"
  print "WHERE EXISTS (SELECT 1 FROM _map_products WHERE old_id = " prod ")"
  print "  AND NOT EXISTS ("
  print "    SELECT 1 FROM product_photos pp"
  print "    JOIN _map_products mp ON mp.new_id = pp.product_id"
  print "    WHERE mp.old_id = " prod " AND pp.url = " q(url)
  print "  );"
}
END { print "COMMIT;" }
' /tmp/_photos.tsv > /tmp/_photos.sql
$PG < /tmp/_photos.sql > /dev/null
echo "   $(wc -l < /tmp/_photos.tsv) fotos"

# -------------------- 5. product_category_pivots --------------------
echo "=> Migrando product_category_pivots..."
$MYSQL -e "SELECT produto_id, categoria_id, IFNULL(principal, 0) FROM produto_categorias_pivot ORDER BY id;" 2>/dev/null > /tmp/_pivots.tsv

awk -F'\t' -v TENANT="$TENANT_ID" '
BEGIN { print "BEGIN;" }
{
  prod=$1; cat=$2; principal=$3;
  is_primary = (principal == "1") ? "true" : "false";
  print "INSERT INTO product_category_pivots (id, tenant_id, product_id, category_id, is_primary)"
  print "SELECT gen_random_uuid(), \x27" TENANT "\x27,"
  print "  (SELECT new_id FROM _map_products WHERE old_id = " prod "),"
  print "  (SELECT new_id FROM _map_categories WHERE old_id = " cat "),"
  print "  " is_primary
  print "WHERE EXISTS (SELECT 1 FROM _map_products WHERE old_id = " prod ")"
  print "  AND EXISTS (SELECT 1 FROM _map_categories WHERE old_id = " cat ")"
  print "ON CONFLICT DO NOTHING;"
}
END { print "COMMIT;" }
' /tmp/_pivots.tsv > /tmp/_pivots.sql
$PG < /tmp/_pivots.sql > /dev/null
echo "   $(wc -l < /tmp/_pivots.tsv) pivots"

# -------------------- 6. product_variation_attributes --------------------
echo "=> Migrando product_variation_attributes..."
$MYSQL -e "SELECT variacao_id, atributo_valor_id FROM produto_variacao_atributos ORDER BY id;" 2>/dev/null > /tmp/_vattrs.tsv

awk -F'\t' '
BEGIN { print "BEGIN;" }
{
  var=$1; av=$2;
  print "INSERT INTO product_variation_attributes (id, variation_id, attribute_value_id)"
  print "SELECT gen_random_uuid(),"
  print "  (SELECT new_id FROM _map_product_variations WHERE old_id = " var "),"
  print "  (SELECT new_id FROM _map_attribute_values WHERE old_id = " av ")"
  print "WHERE EXISTS (SELECT 1 FROM _map_product_variations WHERE old_id = " var ")"
  print "  AND EXISTS (SELECT 1 FROM _map_attribute_values WHERE old_id = " av ")"
  print "ON CONFLICT (variation_id, attribute_value_id) DO NOTHING;"
}
END { print "COMMIT;" }
' /tmp/_vattrs.tsv > /tmp/_vattrs.sql
$PG < /tmp/_vattrs.sql > /dev/null
echo "   $(wc -l < /tmp/_vattrs.tsv) variation_attrs"

# -------------------- 7. categorias_financeiras --------------------
echo "=> Migrando financial_categories..."
$MYSQL -e "SELECT nome, tipo, ativo FROM categorias_financeiras ORDER BY id;" 2>/dev/null > /tmp/_fincats.tsv

awk -F'\t' -v TENANT="$TENANT_ID" '
function q(s) { gsub("\x27", "\x27\x27", s); return s == "" ? "NULL" : "\x27" s "\x27" }
BEGIN { print "BEGIN;" }
{
  nome=$1; tipo=$2; ativo=$3;
  active = (ativo == "1") ? "true" : "false";
  pg_tipo = (tipo == "receita") ? "RECEITA" : "DESPESA";
  code = tolower(nome); gsub(/[^a-z0-9]+/, "_", code); gsub(/^_|_\$/, "", code);
  print "INSERT INTO financial_categories (id, tenant_id, name, code, type, kind, active, created_at, updated_at)"
  print "VALUES (gen_random_uuid(), \x27" TENANT "\x27, " q(nome) ", \x27" code "\x27, \x27" pg_tipo "\x27, \x27CUSTOM\x27, " active ", NOW(), NOW())"
  print "ON CONFLICT (tenant_id, code) DO NOTHING;"
}
END { print "COMMIT;" }
' /tmp/_fincats.tsv > /tmp/_fincats.sql
$PG < /tmp/_fincats.sql > /dev/null
echo "   $(wc -l < /tmp/_fincats.tsv) categorias financeiras"

# -------------------- 8. stock_movements historicos --------------------
# Guard: so roda se tabela estiver vazia (evita duplicacao em reruns)
SM_COUNT=$($PG -t -A -c "SELECT COUNT(*) FROM stock_movements" | tr -d ' ')
if [ "$SM_COUNT" -gt "10" ]; then
  echo "=> stock_movements ja populado ($SM_COUNT). Pulando."
else
echo "=> Migrando stock_movements (~1700)..."
$MYSQL -e "SELECT IFNULL(produto_id, 0), IFNULL(variacao_id, 0), IFNULL(tipo, 'entrada'), IFNULL(quantidade, 0), IFNULL(motivo, ''), IFNULL(referencia_tipo, ''), IFNULL(usuario_id, 0), IFNULL(observacoes, ''), IFNULL(criado_em, NOW()) FROM estoque_movimentacoes ORDER BY id;" 2>/dev/null > /tmp/_movs.tsv

awk -F'\t' -v TENANT="$TENANT_ID" '
function q(s) { gsub("\x27", "\x27\x27", s); return s == "" ? "NULL" : "\x27" s "\x27" }
BEGIN { print "BEGIN;" }
{
  prod=$1; var=$2; tipo=$3; qtd=$4; motivo=$5; ref_tipo=$6; user_id=$7; obs=$8; criado=$9;
  pg_tipo = "ENTRY";
  if (tipo == "saida") pg_tipo = "EXIT";
  else if (tipo == "ajuste") pg_tipo = "ADJUSTMENT";
  else if (tipo == "devolucao") pg_tipo = "RETURN";
  else if (tipo == "baixa") pg_tipo = "EXIT";
  else if (tipo == "upgrade_entrada") pg_tipo = "ENTRY";
  var_sql = (var != "0" && var != "") ? "(SELECT new_id FROM _map_product_variations WHERE old_id = " var ")" : "NULL";
  user_sql = (user_id != "0" && user_id != "") ? "COALESCE((SELECT new_id FROM _map_users WHERE old_id = " user_id "), (SELECT new_id FROM _map_users ORDER BY old_id LIMIT 1))" : "(SELECT new_id FROM _map_users ORDER BY old_id LIMIT 1)";
  print "INSERT INTO stock_movements (id, tenant_id, product_id, variation_id, type, quantity, reason, reference_type, user_id, notes, created_at)"
  print "SELECT gen_random_uuid(), \x27" TENANT "\x27, mp.new_id, " var_sql ", \x27" pg_tipo "\x27::\"StockMovementType\", " qtd ", " q(motivo) ", " q(ref_tipo) ", " user_sql ", " q(obs) ", \x27" criado "\x27"
  print "FROM _map_products mp WHERE mp.old_id = " prod ";"
}
END { print "COMMIT;" }
' /tmp/_movs.tsv > /tmp/_movs.sql
$PG < /tmp/_movs.sql > /tmp/_movs.err 2>&1 || { echo "   FALHA movs"; tail -3 /tmp/_movs.err; }
echo "   $(wc -l < /tmp/_movs.tsv) movs"
fi

# -------------------- 9. sale_upgrades --------------------
SU_COUNT=$($PG -t -A -c "SELECT COUNT(*) FROM sale_upgrades" | tr -d ' ')
if [ "$SU_COUNT" -gt "5" ]; then
  echo "=> sale_upgrades ja populado ($SU_COUNT). Pulando."
else
echo "=> Migrando sale_upgrades..."
$MYSQL -e "SELECT venda_id, IFNULL(aparelho_entrada_marca, ''), IFNULL(aparelho_entrada_modelo, ''), IFNULL(aparelho_entrada_imei, ''), IFNULL(aparelho_entrada_numero_serie, ''), IFNULL(aparelho_entrada_condicao, 'usado'), IFNULL(aparelho_entrada_bateria_saude, 0), IFNULL(valor_avaliado, 0), IFNULL(valor_abatido, 0), IFNULL(observacoes, ''), IFNULL(criado_em, NOW()) FROM pdv_upgrades ORDER BY id;" 2>/dev/null > /tmp/_upgrades.tsv

awk -F'\t' -v TENANT="$TENANT_ID" '
function q(s) { gsub("\x27", "\x27\x27", s); return s == "" ? "NULL" : "\x27" s "\x27" }
BEGIN { print "BEGIN;" }
{
  venda=$1; marca=$2; modelo=$3; imei=$4; serial=$5; cond=$6; bat=$7; aval=$8; abat=$9; obs=$10; criado=$11;
  pg_cond = "USED";
  if (cond == "novo") pg_cond = "NEW";
  else if (cond == "seminovo" || cond == "vitrine") pg_cond = "USED";
  else if (cond == "defeito") pg_cond = "DEFECTIVE";
  bat_sql = (bat == "0") ? "NULL" : bat;
  print "INSERT INTO sale_upgrades (id, tenant_id, sale_id, brand, model, imei, serial_number, condition, battery_health, appraised_value, abated_value, notes, created_at)"
  print "SELECT gen_random_uuid(), \x27" TENANT "\x27, ms.new_id, " q(marca) ", " q(modelo) ", " q(imei) ", " q(serial) ", \x27" pg_cond "\x27::\"DeviceCondition\", " bat_sql ", " aval ", " abat ", " q(obs) ", \x27" criado "\x27"
  print "FROM _map_sales ms WHERE ms.old_id = " venda ";"
}
END { print "COMMIT;" }
' /tmp/_upgrades.tsv > /tmp/_upgrades.sql
$PG < /tmp/_upgrades.sql > /tmp/_upgrades.err 2>&1 || { echo "   FALHA upgrades"; tail -5 /tmp/_upgrades.err; }
echo "   $(wc -l < /tmp/_upgrades.tsv) upgrades"
fi

# -------------------- 10. Counts finais --------------------
echo ""
echo "=== Estado final ==="
$PG -c "
SELECT 'product_attributes' tbl, COUNT(*) FROM product_attributes
UNION ALL SELECT 'product_attribute_values', COUNT(*) FROM product_attribute_values
UNION ALL SELECT 'product_attribute_configs', COUNT(*) FROM product_attribute_configs
UNION ALL SELECT 'product_photos', COUNT(*) FROM product_photos
UNION ALL SELECT 'product_category_pivots', COUNT(*) FROM product_category_pivots
UNION ALL SELECT 'product_variation_attributes', COUNT(*) FROM product_variation_attributes
UNION ALL SELECT 'financial_categories', COUNT(*) FROM financial_categories
UNION ALL SELECT 'stock_movements', COUNT(*) FROM stock_movements
UNION ALL SELECT 'sale_upgrades', COUNT(*) FROM sale_upgrades
ORDER BY tbl;"

REMOTE
