#!/bin/bash
# Fase 3: clientes Laravel -> customers Next.js (PF apenas; Laravel nao tem PJ no schema clientes)
set -euo pipefail

TENANT_ID="dd308431-0525-417a-97c5-459e4b6cf45a"
PG="docker exec -i arenatech-postgres-prod psql -U arenatech arenatech"
MYSQL="mysql arena_dev"

$PG > /dev/null <<EOF
DROP TABLE IF EXISTS _map_customers CASCADE;
CREATE TABLE _map_customers (old_id INT PRIMARY KEY, new_id UUID NOT NULL);
TRUNCATE TABLE customers CASCADE;
EOF

echo "=> Customers..."
# Laravel: cpf NOT NULL (no schema), mas pode ter duplicados/invalidos.
# Estrategia: dedup por CPF (keep first), CPF invalido vai como NULL no Postgres.
$MYSQL -e "
  SELECT id,
         IFNULL(cpf,'') AS cpf,
         nome_completo AS name,
         IFNULL(DATE_FORMAT(data_nascimento, '%Y-%m-%d'),'') AS birth,
         celular_whatsapp AS phone,
         IFNULL(celular_alternativo,'') AS phone2,
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
         IFNULL(criado_em, NOW()) AS criado,
         IFNULL(usuario_cadastro_id, 0) AS user_id
  FROM clientes
  ORDER BY id;
" --batch --raw 2>/dev/null | tail -n +2 > /tmp/_customers.tsv

# Dedup CPFs validos (manter primeira ocorrencia)
awk -F'\t' -v TENANT="$TENANT_ID" '
function q(s) { gsub("'\''", "'\'''\''", s); return s == "" ? "NULL" : "'\''" s "'\''" }
function digits(s) { gsub(/[^0-9]/, "", s); return s }

BEGIN { print "BEGIN;" }
{
  id=$1; cpf_raw=$2; name=$3; birth=$4; phone=$5; phone2=$6; email=$7;
  zip=$8; street=$9; num=$10; comp=$11; bairro=$12; city=$13; state=$14;
  notes=$15; ativo=$16; criado=$17; user_id=$18;

  # CPF: normalizar 11 digitos; se invalido -> NULL
  cpf_n = digits(cpf_raw);
  if (length(cpf_n) == 11) {
    # dedup: pular se ja vimos
    if (seen[cpf_n]) cpf_sql = "NULL";
    else { seen[cpf_n] = 1; cpf_sql = "'\''" cpf_n "'\''"; }
  } else {
    cpf_sql = "NULL";
  }

  # Phone NOT NULL: se vazio, "" string vazia
  if (phone == "") phone = "";
  gsub("'\''", "'\'''\''", phone);

  # deletedAt: ativo=0 -> agora
  deleted_sql = (ativo == "1") ? "NULL" : "NOW()";

  # birth date: vazio -> NULL
  birth_sql = (birth == "") ? "NULL" : "'\''" birth "'\''";

  # created_by_id: usar mapping de users; se nao mapeado -> NULL
  if (user_id != "0" && user_id != "") {
    created_by_sql = "(SELECT new_id FROM _map_users WHERE old_id = " user_id ")";
  } else {
    created_by_sql = "NULL";
  }

  gsub("'\''", "'\'''\''", name);
  print "WITH nc AS (";
  print "  INSERT INTO customers (id, tenant_id, type, name, cpf, phone, phone_secondary, email,";
  print "    birth_date, zip_code, street, street_number, complement, neighborhood, city, state,";
  print "    notes, created_by_id, deleted_at, created_at, updated_at)";
  print "  VALUES (gen_random_uuid(), '\''" TENANT "'\'', '\''PF'\'', '\''" name "'\'', " cpf_sql ", '\''" phone "'\'', " q(phone2) ", " q(email) ", " birth_sql ", " q(zip) ", " q(street) ", " q(num) ", " q(comp) ", " q(bairro) ", " q(city) ", " q(state) ", " q(notes) ", " created_by_sql ", " deleted_sql ", '\''" criado "'\'', NOW())";
  print "  RETURNING id";
  print ")";
  print "INSERT INTO _map_customers (old_id, new_id) SELECT " id ", id FROM nc;";
}
END { print "COMMIT;" }
' /tmp/_customers.tsv > /tmp/_customers.sql

$PG -v ON_ERROR_STOP=1 -q < /tmp/_customers.sql > /tmp/_customers_err.log 2>&1 || { echo "FALHA customers"; tail -15 /tmp/_customers_err.log; exit 1; }

echo "=> Resumo Fase 3:"
$PG -c "
  SELECT 'customers (total)' tbl, COUNT(*) FROM customers
  UNION ALL SELECT 'customers (com CPF)', COUNT(*) FROM customers WHERE cpf IS NOT NULL
  UNION ALL SELECT 'customers (deletados)', COUNT(*) FROM customers WHERE deleted_at IS NOT NULL
  UNION ALL SELECT '_map_customers', COUNT(*) FROM _map_customers
  ORDER BY tbl;
"
