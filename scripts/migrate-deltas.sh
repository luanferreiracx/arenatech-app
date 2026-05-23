#!/bin/bash
# Migracao DELTA: traz para Postgres prod o que esta no Laravel mas
# ainda nao foi migrado. Usa _map_* existente: se old_id ja esta em
# _map_X, pula; senao, insere + adiciona ao mapping.
#
# Ordem (FK):
#   1. customers
#   2. products
#   3. sales + items
#   4. service_orders + items
#   5. contas_receber/pagar + parcelas
set -euo pipefail

VPS="contabo"
TENANT_ID="dd308431-0525-417a-97c5-459e4b6cf45a"

echo "=== Sending delta migration to VPS ==="
ssh "$VPS" "TENANT_ID=$TENANT_ID bash -s" << 'REMOTE'
set -euo pipefail
MYSQL="mysql -u arena_dev -pArenaDev@2025 arena_dev --batch --raw -N"
PG="docker exec -i arenatech-postgres-prod psql -U arenatech arenatech -v ON_ERROR_STOP=1"

# -------------------- 1. CUSTOMERS delta --------------------
echo "=> Customers delta..."
$MYSQL -e "
SELECT c.id, c.cpf, c.nome_completo, IFNULL(DATE_FORMAT(c.data_nascimento, '%Y-%m-%d'), ''),
  c.celular_whatsapp, IFNULL(c.celular_alternativo, ''), IFNULL(c.email, ''),
  IFNULL(c.cep, ''), IFNULL(c.logradouro, ''), IFNULL(c.numero, ''), IFNULL(c.complemento, ''),
  IFNULL(c.bairro, ''), IFNULL(c.cidade, ''), IFNULL(c.estado, ''),
  IFNULL(c.observacoes, ''), IFNULL(c.ativo, 1),
  DATE_FORMAT(c.criado_em, '%Y-%m-%d %H:%i:%s')
FROM clientes c
WHERE NOT EXISTS (SELECT 1 FROM clientes c2 WHERE c2.cpf = c.cpf AND c2.id < c.id)
ORDER BY c.id;" 2>/dev/null > /tmp/_cust.tsv

awk -F'\t' -v TENANT="$TENANT_ID" '
function q(s) { gsub("\x27", "\x27\x27", s); return s == "" ? "NULL" : "\x27" s "\x27" }
BEGIN { print "BEGIN;" }
{
  id=$1; cpf=$2; nome=$3; dob=$4; cel=$5; cel_alt=$6; email=$7;
  # Limpa CPF (remove pontuacao)
  gsub(/[^0-9]/, "", cpf);
  if (length(cpf) != 11) next;
  cep=$8; rua=$9; num=$10; comp=$11; bairro=$12; cidade=$13; estado=$14;
  obs=$15; ativo=$16; criado=$17;
  # Insere apenas se nao existe pelo cpf (idempotente). Index unique parcial
  # garante atomicidade.
  print "INSERT INTO customers (id, tenant_id, type, name, cpf, phone, phone_secondary, email, birth_date, zip_code, street, street_number, complement, neighborhood, city, state, notes, created_at, updated_at, deleted_at)"
  print "SELECT gen_random_uuid(), \x27" TENANT "\x27, \x27PF\x27, " q(nome) ", " q(cpf) ", " q(cel) ", " q(cel_alt) ", " q(email)
  print "  , " (dob == "" ? "NULL" : q(dob)) "::date, " q(cep) ", " q(rua) ", " q(num) ", " q(comp) ", " q(bairro) ", " q(cidade) ", " q(estado)
  print "  , " q(obs) ", \x27" criado "\x27, NOW(), " (ativo == "1" ? "NULL" : "NOW()")
  print "WHERE NOT EXISTS (SELECT 1 FROM customers WHERE cpf = " q(cpf) " AND tenant_id = \x27" TENANT "\x27 AND deleted_at IS NULL);"
  # Adiciona ao mapping pelo cpf (mesmo se ja existia)
  print "INSERT INTO _map_customers (old_id, new_id)"
  print "SELECT " id ", id FROM customers WHERE cpf = " q(cpf) " AND tenant_id = \x27" TENANT "\x27 AND deleted_at IS NULL"
  print "ON CONFLICT (old_id) DO NOTHING;"
}
END { print "COMMIT;" }
' /tmp/_cust.tsv > /tmp/_cust.sql

$PG < /tmp/_cust.sql > /tmp/_cust.err 2>&1 || { echo "FALHA customers"; tail -10 /tmp/_cust.err; exit 1; }
echo "   $(wc -l < /tmp/_cust.tsv) lines processed"

# Contagem
$PG -c "SELECT 'customers' tbl, COUNT(*) FROM customers WHERE deleted_at IS NULL UNION ALL SELECT '_map_customers', COUNT(*) FROM _map_customers;"

# -------------------- 2. PRODUCTS delta --------------------
echo "=> Products delta..."
$MYSQL -e "
SELECT id, IFNULL(categoria_id, 0), IFNULL(codigo_interno, ''), IFNULL(codigo_barras, ''),
  nome, IFNULL(descricao, ''), IFNULL(marca, ''),
  eh_aparelho, eh_premium, IFNULL(aliquota_icms_diferencial, 0),
  IFNULL(ncm, ''), IFNULL(cest, ''), IFNULL(imagem_url, ''),
  controla_imei, usa_variacoes,
  preco_custo, preco_venda, IFNULL(preco_promocional, 0),
  IFNULL(margem_lucro_padrao, 0), estoque_minimo, quantidade_estoque,
  ativo, DATE_FORMAT(criado_em, '%Y-%m-%d %H:%i:%s')
FROM produtos
WHERE id NOT IN (SELECT old_id FROM _map_products) OR id IN (
  SELECT p.id FROM produtos p
  LEFT JOIN _map_products m ON m.old_id = p.id
  WHERE m.old_id IS NULL
)
ORDER BY id;" 2>/dev/null > /tmp/_prods_new.tsv

# Filtra apenas produtos com old_id NAO mapeado (delta real)
$PG -t -A -c "SELECT old_id FROM _map_products" | sort -n > /tmp/_prods_mapped.txt
awk -F'\t' 'NR==FNR { mapped[$0]=1; next } !($1 in mapped)' /tmp/_prods_mapped.txt /tmp/_prods_new.tsv > /tmp/_prods.tsv

awk -F'\t' -v TENANT="$TENANT_ID" '
function q(s) { gsub("\x27", "\x27\x27", s); return s == "" ? "NULL" : "\x27" s "\x27" }
BEGIN { print "BEGIN;" }
{
  id=$1; cat_id=$2; sku=$3; barcode=$4; name=$5; descricao=$6; marca=$7;
  eh_aparelho=$8; eh_premium=$9; icms_dif=$10; ncm=$11; cest=$12; image_url=$13;
  controla_imei=$14; usa_variacoes=$15; cost=$16; sale=$17; promo=$18;
  margin=$19; min_stk=$20; curr_stk=$21; ativo=$22; criado=$23;

  active = (ativo == "1") ? "true" : "false";
  is_serialized = (controla_imei == "1") ? "true" : "false";
  is_premium = (eh_premium == "1") ? "true" : "false";
  is_device = (eh_aparelho == "1") ? "true" : "false";
  has_variations = (usa_variacoes == "1") ? "true" : "false";
  promo_sql = (promo == "0" || promo == "0.00") ? "NULL" : promo;
  margin_sql = (margin == "0" || margin == "0.00") ? "NULL" : margin;
  icms_sql = (icms_dif == "0" || icms_dif == "0.00") ? "NULL" : icms_dif;
  deleted_sql = (ativo == "1") ? "NULL" : "NOW()";
  cat_sql = (cat_id != "0" && cat_id != "") ? "(SELECT new_id FROM _map_categories WHERE old_id = " cat_id ")" : "NULL";

  print "WITH np AS ("
  print "  INSERT INTO products (id, tenant_id, category_id, sku, barcode, name, description, brand,"
  print "    cost_price, sale_price, promotional_price, default_margin, ncm, cest, image_url, current_stock, min_stock,"
  print "    is_serialized, is_premium, is_device, has_variations, icms_differential_rate,"
  print "    active, deleted_at, created_at, updated_at)"
  print "  VALUES (gen_random_uuid(), \x27" TENANT "\x27, " cat_sql ", " q(sku) ", " q(barcode) ", " q(name) ", " q(descricao) ", " q(marca) ","
  print "    " cost ", " sale ", " promo_sql ", " margin_sql ", " q(ncm) ", " q(cest) ", " q(image_url) ", " curr_stk ", " min_stk ","
  print "    " is_serialized ", " is_premium ", " is_device ", " has_variations ", " icms_sql ","
  print "    " active ", " deleted_sql ", \x27" criado "\x27, NOW())"
  print "  RETURNING id"
  print ")"
  print "INSERT INTO _map_products (old_id, new_id) SELECT " id ", id FROM np;"
}
END { print "COMMIT;" }
' /tmp/_prods.tsv > /tmp/_prods.sql

if [ -s /tmp/_prods.sql ]; then
  $PG < /tmp/_prods.sql > /tmp/_prods.err 2>&1 || { echo "FALHA products"; tail -10 /tmp/_prods.err; exit 1; }
  echo "   $(wc -l < /tmp/_prods.tsv) products inseridos"
else
  echo "   0 products novos"
fi

$PG -c "SELECT 'products' tbl, COUNT(*) FROM products WHERE deleted_at IS NULL UNION ALL SELECT '_map_products', COUNT(*) FROM _map_products;"

REMOTE
