#!/bin/bash
# Fase 2: Catalogos -> services, suppliers, product_categories, payment_methods
# Usa AWK para gerar SQL (bash read com IFS=tab perde campos vazios consecutivos)

set -euo pipefail

TENANT_ID="dd308431-0525-417a-97c5-459e4b6cf45a"
PG="docker exec -i arenatech-postgres-prod psql -U arenatech arenatech"
MYSQL="mysql arena_dev"

echo "=> Mapeamentos..."
$PG > /dev/null <<EOF
DROP TABLE IF EXISTS _map_services CASCADE;
DROP TABLE IF EXISTS _map_suppliers CASCADE;
DROP TABLE IF EXISTS _map_categories CASCADE;
DROP TABLE IF EXISTS _map_payment_methods CASCADE;
CREATE TABLE _map_services         (old_id INT    PRIMARY KEY, new_id UUID NOT NULL);
CREATE TABLE _map_suppliers        (old_id BIGINT PRIMARY KEY, new_id UUID NOT NULL);
CREATE TABLE _map_categories       (old_id BIGINT PRIMARY KEY, new_id UUID NOT NULL);
CREATE TABLE _map_payment_methods  (old_id BIGINT PRIMARY KEY, new_id UUID NOT NULL);

-- Truncar tabelas alvo (idempotencia)
TRUNCATE TABLE services CASCADE;
TRUNCATE TABLE suppliers CASCADE;
TRUNCATE TABLE product_categories CASCADE;
TRUNCATE TABLE payment_methods CASCADE;
EOF

# ---------- services ----------
echo "=> Services..."
$MYSQL -e "
  SELECT id,
         CONCAT(tipo_servico, ' ', modelo_aparelho) AS name,
         tipo_servico,
         modelo_aparelho,
         IFNULL(descricao,'') AS descricao,
         valor,
         ativo,
         IFNULL(criado_em, NOW()) AS criado
  FROM servicos
  ORDER BY id;
" --batch --raw 2>/dev/null | tail -n +2 > /tmp/_services.tsv

awk -F'\t' -v TENANT="$TENANT_ID" '
function q(s) { gsub("'\''", "'\'''\''", s); return s == "" ? "NULL" : "'\''" s "'\''" }
BEGIN { print "BEGIN;" }
{
  id=$1; name=$2; service_type=$3; device_model=$4; descricao=$5; valor=$6; ativo=$7; criado=$8;
  gsub("'\''", "'\'''\''", name);
  active = (ativo == "1") ? "true" : "false";
  print "WITH ns AS (";
  print "  INSERT INTO services (id, tenant_id, name, description, base_price, service_type, device_model, active, created_at, updated_at)";
  print "  VALUES (gen_random_uuid(), '\''" TENANT "'\'', '\''" name "'\'', " q(descricao) ", " valor ", " q(service_type) ", " q(device_model) ", " active ", '\''" criado "'\'', NOW())";
  print "  RETURNING id";
  print ")";
  print "INSERT INTO _map_services (old_id, new_id) SELECT " id ", id FROM ns;";
}
END { print "COMMIT;" }
' /tmp/_services.tsv > /tmp/_services.sql

$PG -v ON_ERROR_STOP=1 -q < /tmp/_services.sql > /tmp/_services_err.log 2>&1 || { echo "FALHA services"; tail -10 /tmp/_services_err.log; exit 1; }

# ---------- suppliers ----------
echo "=> Suppliers..."
$MYSQL -e "
  SELECT id, tipo_pessoa,
         IFNULL(cpf_cnpj,'') AS doc,
         nome_razao_social AS name,
         IFNULL(nome_fantasia,'') AS trade,
         IFNULL(telefone,'') AS phone,
         IFNULL(email,'') AS email,
         IFNULL(cep,'') AS zip,
         IFNULL(logradouro,'') AS street,
         IFNULL(numero,'') AS num,
         IFNULL(complemento,'') AS comp,
         IFNULL(bairro,'') AS bairro,
         IFNULL(cidade,'') AS city,
         IFNULL(estado,'') AS state,
         IFNULL(observacoes,'') AS notes,
         ativo,
         IFNULL(criado_em, NOW()) AS criado
  FROM fornecedores
  ORDER BY id;
" --batch --raw 2>/dev/null | tail -n +2 > /tmp/_suppliers.tsv

awk -F'\t' -v TENANT="$TENANT_ID" '
function q(s) { gsub("'\''", "'\'''\''", s); return s == "" ? "NULL" : "'\''" s "'\''" }
function digits(s) { gsub(/[^0-9]/, "", s); return s }
BEGIN { print "BEGIN;" }
{
  id=$1; tipo=$2; doc=$3; name=$4; trade=$5; phone=$6; email=$7;
  zip=$8; street=$9; num=$10; comp=$11; bairro=$12; city=$13; state=$14;
  notes=$15; ativo=$16; criado=$17;

  pg_type = (tipo == "fisica") ? "PF" : "PJ";
  d = digits(doc);
  cpf = "NULL"; cnpj = "NULL";
  if (length(d) == 11) cpf = "'\''" d "'\''";
  else if (length(d) == 14) cnpj = "'\''" d "'\''";
  active = (ativo == "1") ? "true" : "false";

  gsub("'\''", "'\'''\''", name);
  print "WITH ns AS (";
  print "  INSERT INTO suppliers (id, tenant_id, type, name, trade_name, cpf, cnpj, phone, email,";
  print "    zip_code, street, street_number, complement, neighborhood, city, state, notes, active, created_at, updated_at)";
  print "  VALUES (gen_random_uuid(), '\''" TENANT "'\'', '\''" pg_type "'\'', '\''" name "'\'', " q(trade) ", " cpf ", " cnpj ", " q(phone) ", " q(email) ", " q(zip) ", " q(street) ", " q(num) ", " q(comp) ", " q(bairro) ", " q(city) ", " q(state) ", " q(notes) ", " active ", '\''" criado "'\'', NOW())";
  print "  RETURNING id";
  print ")";
  print "INSERT INTO _map_suppliers (old_id, new_id) SELECT " id ", id FROM ns;";
}
END { print "COMMIT;" }
' /tmp/_suppliers.tsv > /tmp/_suppliers.sql

$PG -v ON_ERROR_STOP=1 -q < /tmp/_suppliers.sql > /tmp/_suppliers_err.log 2>&1 || { echo "FALHA suppliers"; tail -15 /tmp/_suppliers_err.log; exit 1; }

# ---------- product_categories ----------
echo "=> Product categories..."
$MYSQL -e "
  SELECT id, nome,
         IFNULL(descricao,'') AS descricao,
         IFNULL(cor_badge, '#6b7280') AS cor,
         ativo,
         IFNULL(criado_em, NOW()) AS criado
  FROM produto_categorias
  ORDER BY id;
" --batch --raw 2>/dev/null | tail -n +2 > /tmp/_cats.tsv

awk -F'\t' -v TENANT="$TENANT_ID" '
function q(s) { gsub("'\''", "'\'''\''", s); return s == "" ? "NULL" : "'\''" s "'\''" }
BEGIN { print "BEGIN;" }
{
  id=$1; name=$2; descricao=$3; cor=$4; ativo=$5; criado=$6;
  gsub("'\''", "'\'''\''", name);
  active = (ativo == "1") ? "true" : "false";
  print "WITH nc AS (";
  print "  INSERT INTO product_categories (id, tenant_id, name, description, badge_color, active, created_at, updated_at)";
  print "  VALUES (gen_random_uuid(), '\''" TENANT "'\'', '\''" name "'\'', " q(descricao) ", '\''" cor "'\'', " active ", '\''" criado "'\'', NOW())";
  print "  RETURNING id";
  print ")";
  print "INSERT INTO _map_categories (old_id, new_id) SELECT " id ", id FROM nc;";
}
END { print "COMMIT;" }
' /tmp/_cats.tsv > /tmp/_cats.sql
$PG -v ON_ERROR_STOP=1 -q < /tmp/_cats.sql > /tmp/_cats_err.log 2>&1 || { echo "FALHA categories"; tail -10 /tmp/_cats_err.log; exit 1; }

# ---------- payment_methods ----------
echo "=> Payment methods..."
$MYSQL -e "
  SELECT id, codigo, rotulo, ativo, aceita_parcelas,
         IFNULL(criado_em, NOW()) AS criado
  FROM formas_pagamento
  ORDER BY id;
" --batch --raw 2>/dev/null | tail -n +2 > /tmp/_pms.tsv

awk -F'\t' -v TENANT="$TENANT_ID" '
BEGIN { print "BEGIN;" }
{
  id=$1; codigo=$2; rotulo=$3; ativo=$4; aceita=$5; criado=$6;
  pm_type = "OTHER";
  if (codigo == "dinheiro") pm_type = "CASH";
  else if (codigo == "pix" || codigo == "depix") pm_type = "PIX";
  else if (codigo == "cartao_credito" || codigo == "credito" || codigo == "parcelado") pm_type = "CREDIT_CARD";
  else if (codigo == "cartao_debito" || codigo == "debito") pm_type = "DEBIT_CARD";
  else if (codigo == "crediario") pm_type = "STORE_CREDIT";
  active = (ativo == "1") ? "true" : "false";
  accepts_change = (pm_type == "CASH") ? "true" : "false";
  gsub("'\''", "'\'''\''", rotulo);
  print "WITH np AS (";
  print "  INSERT INTO payment_methods (id, tenant_id, name, type, fee_percent, active, accepts_change, created_at, updated_at)";
  print "  VALUES (gen_random_uuid(), '\''" TENANT "'\'', '\''" rotulo "'\'', '\''" pm_type "'\''::\"PaymentMethodType\", 0, " active ", " accepts_change ", '\''" criado "'\'', NOW())";
  print "  RETURNING id";
  print ")";
  print "INSERT INTO _map_payment_methods (old_id, new_id) SELECT " id ", id FROM np;";
}
END { print "COMMIT;" }
' /tmp/_pms.tsv > /tmp/_pms.sql
$PG -v ON_ERROR_STOP=1 -q < /tmp/_pms.sql > /tmp/_pms_err.log 2>&1 || { echo "FALHA payment methods"; tail -10 /tmp/_pms_err.log; exit 1; }

# Resumo
echo "=> Resumo Fase 2:"
$PG -c "
  SELECT 'services' tbl, COUNT(*) FROM services
  UNION ALL SELECT 'suppliers', COUNT(*) FROM suppliers
  UNION ALL SELECT 'product_categories', COUNT(*) FROM product_categories
  UNION ALL SELECT 'payment_methods', COUNT(*) FROM payment_methods
  ORDER BY tbl;
"
