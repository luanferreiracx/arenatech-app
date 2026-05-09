#!/bin/bash
# =============================================================================
# Migração de dados: arena_dev (MySQL) → arenatech (PostgreSQL)
# Executa na VPS via SSH
#
# Uso: ./scripts/migrate-arena-dev.sh
# Idempotente: pode rodar múltiplas vezes (DELETE + INSERT por tabela)
# =============================================================================

set -euo pipefail

VPS="contabo"
TENANT_ID="dd308431-0525-417a-97c5-459e4b6cf45a"
SUPER_ADMIN_USER_ID="64472a4d-3063-495e-94ea-294e419e1e2d"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $1"; }

echo "============================================="
echo "  Arena Tech: MySQL -> PostgreSQL Migration"
echo "============================================="
echo ""

log_info "Sending migration script to VPS..."

ssh "$VPS" 'bash -s' << 'REMOTE_SCRIPT'
#!/bin/bash
set -euo pipefail

TAB=$(printf "\t")
# Use __X__ as NULL placeholder to prevent bash read from collapsing empty fields
NP="__X__"
MYSQL="mysql -u root arena_dev --batch --raw -N"
PG="docker exec -i arenatech-postgres-prod psql -U arenatech arenatech"
PG_QUIET="docker exec -i arenatech-postgres-prod psql -U arenatech arenatech -t -A"
TENANT_ID="dd308431-0525-417a-97c5-459e4b6cf45a"
SUPER_ADMIN_USER_ID="64472a4d-3063-495e-94ea-294e419e1e2d"
SUPER_ADMIN_CPF="02205027301"

SQLFILE="/tmp/arena_migration.sql"

escape_sql() {
  echo "$1" | sed "s/'/''/g"
}

# Convert field to SQL value: __X__ -> NULL, otherwise quoted
sv() {
  if [ "$1" = "$NP" ] || [ -z "$1" ]; then
    echo "NULL"
  else
    echo "'$(escape_sql "$1")'"
  fi
}

# NP-aware: is value "real" (not placeholder)?
is_real() {
  [ "$1" != "$NP" ] && [ -n "$1" ]
}

# ========================================
# STEP 0: Mapping tables
# ========================================
echo "Creating mapping tables..."
echo "
DROP TABLE IF EXISTS _map_users CASCADE;
DROP TABLE IF EXISTS _map_customers CASCADE;
DROP TABLE IF EXISTS _map_services CASCADE;
DROP TABLE IF EXISTS _map_products CASCADE;
DROP TABLE IF EXISTS _map_payment_methods CASCADE;
DROP TABLE IF EXISTS _map_delivery_persons CASCADE;
DROP TABLE IF EXISTS _map_service_providers CASCADE;
DROP TABLE IF EXISTS _map_service_orders CASCADE;
DROP TABLE IF EXISTS _map_sales CASCADE;
DROP TABLE IF EXISTS _map_diagnostic_templates CASCADE;

CREATE TABLE _map_users (old_id INT PRIMARY KEY, new_id UUID NOT NULL);
CREATE TABLE _map_customers (old_id INT PRIMARY KEY, new_id UUID NOT NULL);
CREATE TABLE _map_services (old_id INT PRIMARY KEY, new_id UUID NOT NULL);
CREATE TABLE _map_products (old_id BIGINT PRIMARY KEY, new_id UUID NOT NULL);
CREATE TABLE _map_payment_methods (old_id BIGINT PRIMARY KEY, new_id UUID NOT NULL);
CREATE TABLE _map_delivery_persons (old_id BIGINT PRIMARY KEY, new_id UUID NOT NULL);
CREATE TABLE _map_service_providers (old_id BIGINT PRIMARY KEY, new_id UUID NOT NULL);
CREATE TABLE _map_service_orders (old_id INT PRIMARY KEY, new_id UUID NOT NULL);
CREATE TABLE _map_sales (old_id BIGINT PRIMARY KEY, new_id UUID NOT NULL);
CREATE TABLE _map_diagnostic_templates (old_id INT PRIMARY KEY, new_id UUID NOT NULL);
" | $PG > /dev/null 2>&1

echo "  [OK] Mapping tables created"

# ========================================
# STEP 1: usuarios -> users + user_tenants
# ========================================
echo "Migrating usuarios -> users + user_tenants..."

cat > "$SQLFILE" << SQLINIT
BEGIN;
-- Delete non-seed users that were migrated previously
DELETE FROM user_tenants WHERE tenant_id = '${TENANT_ID}' AND user_id NOT IN (
  SELECT id FROM users WHERE is_super_admin = true
);
DELETE FROM users WHERE is_super_admin = false AND cpf NOT IN ('12345678909','52998224725','11144477735','98765432100');
DELETE FROM _map_users;
-- Add super admin mapping
INSERT INTO _map_users (old_id, new_id) VALUES (5, '${SUPER_ADMIN_USER_ID}') ON CONFLICT DO NOTHING;
INSERT INTO user_tenants (user_id, tenant_id, role, created_at)
VALUES ('${SUPER_ADMIN_USER_ID}', '${TENANT_ID}', 'admin', NOW())
ON CONFLICT (user_id, tenant_id) DO NOTHING;
SQLINIT

$MYSQL -e "
  SELECT id, cpf, password, nome, COALESCE(NULLIF(whatsapp,''),'${NP}'), eh_tecnico, role, ativo,
         IF(criado_em IS NULL,'2025-01-01 00:00:00',criado_em)
  FROM usuarios
  WHERE cpf IS NOT NULL AND cpf != '' AND cpf REGEXP '^[0-9]{11}$' AND cpf != '${SUPER_ADMIN_CPF}'
" | while IFS="$TAB" read -r old_id cpf password nome whatsapp eh_tecnico role ativo criado_em; do
  new_uuid=$(cat /proc/sys/kernel/random/uuid)
  name_esc=$(escape_sql "$nome")
  pass_esc=$(escape_sql "$password")

  pg_role="operator"
  [ "$role" = "admin" ] && pg_role="admin"

  cat >> "$SQLFILE" << EOSQL
INSERT INTO users (id, cpf, name, email, password_hash, is_super_admin, created_at, updated_at)
VALUES ('${new_uuid}', '${cpf}', '${name_esc}', NULL, '${pass_esc}', false, '${criado_em}', '${criado_em}');
INSERT INTO user_tenants (user_id, tenant_id, role, created_at)
VALUES ('${new_uuid}', '${TENANT_ID}', '${pg_role}', '${criado_em}');
INSERT INTO _map_users (old_id, new_id) VALUES (${old_id}, '${new_uuid}');
EOSQL
done

echo "COMMIT;" >> "$SQLFILE"
$PG < "$SQLFILE" > /dev/null 2>&1
USERS_COUNT=$(echo "SELECT COUNT(*) FROM _map_users" | $PG_QUIET)
echo "  [OK] Users migrated: ${USERS_COUNT}"

# ========================================
# STEP 2: clientes -> customers
# ========================================
echo "Migrating clientes -> customers..."

echo "
BEGIN;
DELETE FROM customer_interests WHERE tenant_id = '${TENANT_ID}';
DELETE FROM customers WHERE tenant_id = '${TENANT_ID}';
DELETE FROM _map_customers;
" > "$SQLFILE"

$MYSQL -e "
  SELECT id, COALESCE(NULLIF(cpf,''),'${NP}'), nome_completo, COALESCE(NULLIF(celular_whatsapp,''),'${NP}'), COALESCE(NULLIF(celular_alternativo,''),'${NP}'),
         COALESCE(NULLIF(email,''),'${NP}'), COALESCE(NULLIF(cep,''),'${NP}'), COALESCE(NULLIF(logradouro,''),'${NP}'), COALESCE(NULLIF(numero,''),'${NP}'),
         COALESCE(NULLIF(complemento,''),'${NP}'), COALESCE(NULLIF(bairro,''),'${NP}'), COALESCE(NULLIF(cidade,''),'${NP}'), COALESCE(NULLIF(estado,''),'${NP}'),
         COALESCE(NULLIF(REPLACE(REPLACE(observacoes,'\n',' '),'\r',''),''),'${NP}'), ativo, IF(criado_em IS NULL,'2025-01-01 00:00:00',criado_em), IF(atualizado_em IS NULL,'2025-01-01 00:00:00',atualizado_em)
  FROM clientes
" | while IFS="$TAB" read -r old_id cpf nome phone phone2 email cep logradouro numero complemento bairro cidade estado notas ativo criado_em atualizado_em; do
  new_uuid=$(cat /proc/sys/kernel/random/uuid)
  name_esc=$(escape_sql "$nome")

  cpf_val=$(sv "$cpf")
  email_val=$(sv "$email")
  phone_val=$(sv "$phone")
  phone2_val=$(sv "$phone2")
  notas_val=$(sv "$notas")

  address_json="NULL"
  if is_real "$logradouro" || is_real "$cidade"; then
    s_street=""; is_real "$logradouro" && s_street=$(escape_sql "$logradouro")
    s_num=""; is_real "$numero" && s_num="$numero"
    s_compl=""; is_real "$complemento" && s_compl=$(escape_sql "$complemento")
    s_bairro=""; is_real "$bairro" && s_bairro=$(escape_sql "$bairro")
    s_city=""; is_real "$cidade" && s_city=$(escape_sql "$cidade")
    s_state=""; is_real "$estado" && s_state="$estado"
    s_zip=""; is_real "$cep" && s_zip="$cep"
    address_json="'{\"street\":\"${s_street}\",\"number\":\"${s_num}\",\"complement\":\"${s_compl}\",\"neighborhood\":\"${s_bairro}\",\"city\":\"${s_city}\",\"state\":\"${s_state}\",\"zip\":\"${s_zip}\"}'"
  fi

  deleted_at="NULL"
  [ "$ativo" = "0" ] && deleted_at="'${atualizado_em}'"

  cat >> "$SQLFILE" << EOSQL
INSERT INTO customers (id, tenant_id, type, name, cpf, email, phone, phone2, address, notes, deleted_at, created_at, updated_at)
VALUES ('${new_uuid}', '${TENANT_ID}', 'PF', '${name_esc}', ${cpf_val}, ${email_val}, ${phone_val}, ${phone2_val}, ${address_json}, ${notas_val}, ${deleted_at}, '${criado_em}', '${atualizado_em}');
INSERT INTO _map_customers (old_id, new_id) VALUES (${old_id}, '${new_uuid}');
EOSQL
done

echo "COMMIT;" >> "$SQLFILE"
$PG < "$SQLFILE" > /dev/null 2>&1
CUST_COUNT=$(echo "SELECT COUNT(*) FROM _map_customers" | $PG_QUIET)
echo "  [OK] Customers migrated: ${CUST_COUNT}"

# ========================================
# STEP 3: servicos -> services
# ========================================
echo "Migrating servicos -> services..."

echo "
BEGIN;
DELETE FROM services WHERE tenant_id = '${TENANT_ID}';
DELETE FROM _map_services;
" > "$SQLFILE"

$MYSQL -e "
  SELECT id, tipo_servico, modelo_aparelho, valor, COALESCE(NULLIF(descricao,''),'${NP}'), ativo,
         IF(criado_em IS NULL,'2025-01-01 00:00:00',criado_em), IF(atualizado_em IS NULL,'2025-01-01 00:00:00',atualizado_em)
  FROM servicos
" | while IFS="$TAB" read -r old_id tipo modelo valor descricao ativo criado_em atualizado_em; do
  new_uuid=$(cat /proc/sys/kernel/random/uuid)
  name_raw="${tipo} - ${modelo}"
  name_esc=$(escape_sql "$name_raw")
  desc_val=$(sv "$descricao")

  active="true"
  [ "$ativo" = "0" ] && active="false"

  deleted_at="NULL"
  [ "$ativo" = "0" ] && deleted_at="'${atualizado_em}'"

  cat >> "$SQLFILE" << EOSQL
INSERT INTO services (id, tenant_id, name, description, base_price, active, deleted_at, created_at, updated_at)
VALUES ('${new_uuid}', '${TENANT_ID}', '${name_esc}', ${desc_val}, ${valor}, ${active}, ${deleted_at}, '${criado_em}', '${atualizado_em}');
INSERT INTO _map_services (old_id, new_id) VALUES (${old_id}, '${new_uuid}');
EOSQL
done

echo "COMMIT;" >> "$SQLFILE"
$PG < "$SQLFILE" > /dev/null 2>&1
SVC_COUNT=$(echo "SELECT COUNT(*) FROM _map_services" | $PG_QUIET)
echo "  [OK] Services migrated: ${SVC_COUNT}"

# ========================================
# STEP 4: avaliacoes -> diagnostic_templates
# ========================================
echo "Migrating avaliacoes -> diagnostic_templates..."

echo "
BEGIN;
DELETE FROM diagnostic_templates WHERE tenant_id = '${TENANT_ID}';
DELETE FROM _map_diagnostic_templates;
" > "$SQLFILE"

$MYSQL -e "
  SELECT id, modelo, armazenamento, COALESCE(NULLIF(saude_bateria,''),'${NP}'), COALESCE(NULLIF(valor,''),'${NP}'),
         IFNULL(validade_dias,7), IF(criado_em IS NULL,'2025-01-01 00:00:00',criado_em), IF(atualizado_em IS NULL,'2025-01-01 00:00:00',atualizado_em)
  FROM avaliacoes
" | while IFS="$TAB" read -r old_id modelo armazenamento saude_bateria valor validade_dias criado_em atualizado_em; do
  new_uuid=$(cat /proc/sys/kernel/random/uuid)
  title_raw="${modelo} - ${armazenamento}"
  title_esc=$(escape_sql "$title_raw")
  sb=""; is_real "$saude_bateria" && sb="$saude_bateria"
  vl=""; is_real "$valor" && vl="$valor"
  content_raw="Saude Bateria: ${sb} | Valor: ${vl} | Validade: ${validade_dias} dias"
  content_esc=$(escape_sql "$content_raw")

  cat >> "$SQLFILE" << EOSQL
INSERT INTO diagnostic_templates (id, tenant_id, title, content, category, active, created_at, updated_at)
VALUES ('${new_uuid}', '${TENANT_ID}', '${title_esc}', '${content_esc}', 'avaliacao', true, '${criado_em}', '${atualizado_em}');
INSERT INTO _map_diagnostic_templates (old_id, new_id) VALUES (${old_id}, '${new_uuid}');
EOSQL
done

echo "COMMIT;" >> "$SQLFILE"
$PG < "$SQLFILE" > /dev/null 2>&1
DIAG_COUNT=$(echo "SELECT COUNT(*) FROM _map_diagnostic_templates" | $PG_QUIET)
echo "  [OK] Diagnostic templates migrated: ${DIAG_COUNT}"

# ========================================
# STEP 5: produtos -> products
# ========================================
echo "Migrating produtos -> products..."

echo "
BEGIN;
DELETE FROM stock_movements WHERE tenant_id = '${TENANT_ID}';
DELETE FROM device_purchases WHERE tenant_id = '${TENANT_ID}';
DELETE FROM products WHERE tenant_id = '${TENANT_ID}';
DELETE FROM _map_products;
" > "$SQLFILE"

$MYSQL -e "
  SELECT id, COALESCE(NULLIF(codigo_interno,''),'${NP}'), COALESCE(NULLIF(codigo_barras,''),'${NP}'), nome, COALESCE(NULLIF(descricao,''),'${NP}'),
         preco_custo, preco_venda, quantidade_estoque, estoque_minimo, ativo,
         criado_em, atualizado_em
  FROM produtos
" | while IFS="$TAB" read -r old_id sku barcode nome descricao custo venda estoque estoque_min ativo criado_em atualizado_em; do
  new_uuid=$(cat /proc/sys/kernel/random/uuid)
  name_esc=$(escape_sql "$nome")
  sku_val=$(sv "$sku")
  barcode_val=$(sv "$barcode")
  desc_val=$(sv "$descricao")

  active="true"
  [ "$ativo" = "0" ] && active="false"

  deleted_at="NULL"
  [ "$ativo" = "0" ] && deleted_at="'${atualizado_em}'"

  cat >> "$SQLFILE" << EOSQL
INSERT INTO products (id, tenant_id, sku, barcode, name, description, cost_price, sale_price, current_stock, min_stock, unit, active, deleted_at, created_at, updated_at)
VALUES ('${new_uuid}', '${TENANT_ID}', ${sku_val}, ${barcode_val}, '${name_esc}', ${desc_val}, ${custo}, ${venda}, ${estoque}, ${estoque_min}, 'un', ${active}, ${deleted_at}, '${criado_em}', '${atualizado_em}');
INSERT INTO _map_products (old_id, new_id) VALUES (${old_id}, '${new_uuid}');
EOSQL
done

echo "COMMIT;" >> "$SQLFILE"
$PG < "$SQLFILE" > /dev/null 2>&1
PROD_COUNT=$(echo "SELECT COUNT(*) FROM _map_products" | $PG_QUIET)
echo "  [OK] Products migrated: ${PROD_COUNT}"

# ========================================
# STEP 6: formas_pagamento -> payment_methods
# ========================================
echo "Migrating formas_pagamento -> payment_methods..."

echo "
BEGIN;
DELETE FROM installment_rules WHERE tenant_id = '${TENANT_ID}';
DELETE FROM payment_methods WHERE tenant_id = '${TENANT_ID}';
DELETE FROM _map_payment_methods;
" > "$SQLFILE"

$MYSQL -e "
  SELECT id, codigo, rotulo, ativo, criado_em, atualizado_em
  FROM formas_pagamento
" | while IFS="$TAB" read -r old_id codigo rotulo ativo criado_em atualizado_em; do
  new_uuid=$(cat /proc/sys/kernel/random/uuid)
  name_esc=$(escape_sql "$rotulo")

  pg_type="OTHER"
  case "$codigo" in
    dinheiro)       pg_type="CASH" ;;
    pix)            pg_type="PIX" ;;
    depix)          pg_type="PIX" ;;
    cartao_credito) pg_type="CREDIT_CARD" ;;
    cartao_debito)  pg_type="DEBIT_CARD" ;;
    transferencia)  pg_type="BANK_TRANSFER" ;;
    crediario)      pg_type="STORE_CREDIT" ;;
  esac

  active="true"
  [ "$ativo" = "0" ] && active="false"

  accepts_change="false"
  [ "$codigo" = "dinheiro" ] && accepts_change="true"

  cat >> "$SQLFILE" << EOSQL
INSERT INTO payment_methods (id, tenant_id, name, type, fee_percent, active, accepts_change, created_at, updated_at)
VALUES ('${new_uuid}', '${TENANT_ID}', '${name_esc}', '${pg_type}', 0, ${active}, ${accepts_change}, '${criado_em}', '${atualizado_em}');
INSERT INTO _map_payment_methods (old_id, new_id) VALUES (${old_id}, '${new_uuid}');
EOSQL
done

echo "COMMIT;" >> "$SQLFILE"
$PG < "$SQLFILE" > /dev/null 2>&1
PM_COUNT=$(echo "SELECT COUNT(*) FROM _map_payment_methods" | $PG_QUIET)
echo "  [OK] Payment methods migrated: ${PM_COUNT}"

# ========================================
# STEP 7: entregadores -> delivery_persons
# ========================================
echo "Migrating entregadores -> delivery_persons..."

echo "
BEGIN;
DELETE FROM delivery_persons WHERE tenant_id = '${TENANT_ID}';
DELETE FROM _map_delivery_persons;
" > "$SQLFILE"

$MYSQL -e "
  SELECT id, nome, COALESCE(NULLIF(whatsapp,''),'${NP}'), ativo
  FROM entregadores
" | while IFS="$TAB" read -r old_id nome phone ativo; do
  new_uuid=$(cat /proc/sys/kernel/random/uuid)
  name_esc=$(escape_sql "$nome")
  phone_val=$(sv "$phone")
  active="true"
  [ "$ativo" = "0" ] && active="false"

  cat >> "$SQLFILE" << EOSQL
INSERT INTO delivery_persons (id, tenant_id, name, phone, active, created_at, updated_at)
VALUES ('${new_uuid}', '${TENANT_ID}', '${name_esc}', ${phone_val}, ${active}, NOW(), NOW());
INSERT INTO _map_delivery_persons (old_id, new_id) VALUES (${old_id}, '${new_uuid}');
EOSQL
done

echo "COMMIT;" >> "$SQLFILE"
$PG < "$SQLFILE" > /dev/null 2>&1
DP_COUNT=$(echo "SELECT COUNT(*) FROM _map_delivery_persons" | $PG_QUIET)
echo "  [OK] Delivery persons migrated: ${DP_COUNT}"

# ========================================
# STEP 8: prestadores -> service_providers
# ========================================
echo "Migrating prestadores -> service_providers..."

echo "
BEGIN;
DELETE FROM service_providers WHERE tenant_id = '${TENANT_ID}';
DELETE FROM _map_service_providers;
" > "$SQLFILE"

$MYSQL -e "
  SELECT p.id, COALESCE(NULLIF(u.nome,''),'Prestador'), p.perfil, p.tipo_vinculo,
         COALESCE(NULLIF(p.cpf,''),'${NP}'), COALESCE(NULLIF(p.cnpj_mei,''),'${NP}'), COALESCE(NULLIF(p.whatsapp,''),'${NP}'),
         p.ativo, IF(p.criado_em IS NULL,'2025-01-01 00:00:00',p.criado_em), IF(p.atualizado_em IS NULL,'2025-01-01 00:00:00',p.atualizado_em)
  FROM prestadores p
  LEFT JOIN usuarios u ON u.id = p.usuario_id
" | while IFS="$TAB" read -r old_id nome perfil tipo_vinculo cpf cnpj phone ativo criado_em atualizado_em; do
  new_uuid=$(cat /proc/sys/kernel/random/uuid)
  name_esc=$(escape_sql "$nome")
  phone_val=$(sv "$phone")

  cpf_cnpj_val="NULL"
  if is_real "$cnpj"; then
    cpf_cnpj_val=$(sv "$cnpj")
  elif is_real "$cpf"; then
    cpf_cnpj_val=$(sv "$cpf")
  fi

  active="true"
  [ "$ativo" = "0" ] && active="false"

  cat >> "$SQLFILE" << EOSQL
INSERT INTO service_providers (id, tenant_id, name, type, cpf_cnpj, phone, active, created_at, updated_at)
VALUES ('${new_uuid}', '${TENANT_ID}', '${name_esc}', '${tipo_vinculo}', ${cpf_cnpj_val}, ${phone_val}, ${active}, '${criado_em}', '${atualizado_em}');
INSERT INTO _map_service_providers (old_id, new_id) VALUES (${old_id}, '${new_uuid}');
EOSQL
done

echo "COMMIT;" >> "$SQLFILE"
$PG < "$SQLFILE" > /dev/null 2>&1
SP_COUNT=$(echo "SELECT COUNT(*) FROM _map_service_providers" | $PG_QUIET)
echo "  [OK] Service providers migrated: ${SP_COUNT}"

# ========================================
# STEP 9: ordens_servico -> service_orders
# ========================================
echo "Migrating ordens_servico -> service_orders..."

echo "
BEGIN;
DELETE FROM service_order_documents WHERE tenant_id = '${TENANT_ID}';
DELETE FROM service_order_history WHERE tenant_id = '${TENANT_ID}';
DELETE FROM service_order_items WHERE tenant_id = '${TENANT_ID}';
DELETE FROM service_orders WHERE tenant_id = '${TENANT_ID}';
DELETE FROM _map_service_orders;
" > "$SQLFILE"

$MYSQL -e "
  SELECT id, numero_os, cliente_id, status,
         COALESCE(NULLIF(tipo_equipamento,''),'${NP}'), COALESCE(NULLIF(marca,''),'${NP}'), COALESCE(NULLIF(modelo,''),'${NP}'),
         COALESCE(NULLIF(serie,''),'${NP}'), COALESCE(NULLIF(imei,''),'${NP}'), COALESCE(NULLIF(senha_equipamento,''),'${NP}'),
         COALESCE(NULLIF(REPLACE(REPLACE(acessorios,'\n',' '),'\r',''),''),'${NP}'), COALESCE(NULLIF(REPLACE(REPLACE(problema_relatado,'\n',' '),'\r',''),''),'${NP}'), COALESCE(NULLIF(REPLACE(REPLACE(defeito_constatado,'\n',' '),'\r',''),''),'${NP}'),
         IFNULL(valor_servico,0), IFNULL(valor_pecas,0), IFNULL(custo_pecas,0),
         IFNULL(desconto,0), IFNULL(valor_total,0), IFNULL(valor_pago,0),
         COALESCE(NULLIF(forma_pagamento,''),'${NP}'), IFNULL(tecnico_responsavel_usuario_id,0),
         usuario_criacao_id, data_entrada, IF(data_previsao IS NULL,'${NP}',data_previsao),
         IF(data_conclusao IS NULL,'${NP}',data_conclusao), IF(data_entrega IS NULL,'${NP}',data_entrega),
         COALESCE(NULLIF(REPLACE(REPLACE(observacoes_internas,'\n',' '),'\r',''),''),'${NP}'), COALESCE(NULLIF(REPLACE(REPLACE(observacoes_cliente,'\n',' '),'\r',''),''),'${NP}'),
         COALESCE(NULLIF(link_publico,''),'${NP}'), ativo, IFNULL(eh_garantia,0), IFNULL(prazo_garantia_meses,3),
         COALESCE(NULLIF(REPLACE(REPLACE(motivo_cancelamento,'\n',' '),'\r',''),''),'${NP}'), COALESCE(NULLIF(REPLACE(REPLACE(motivo_estorno,'\n',' '),'\r',''),''),'${NP}'), IF(data_estorno IS NULL,'${NP}',data_estorno),
         IFNULL(desconto_pagamento,0),
         IFNULL(check_entrada_aparelho_liga,'nao_testado'),
         IFNULL(check_entrada_aparelho_vibra,'nao_testado'),
         IFNULL(check_entrada_botoes_ok,'nao_testado'),
         IFNULL(check_entrada_bluetooth_ok,'nao_testado'),
         IFNULL(check_entrada_wifi_ok,'nao_testado'),
         IFNULL(check_entrada_vidro_traseiro_ok,'nao_testado'),
         IFNULL(check_entrada_audio_ok,'nao_testado'),
         IFNULL(check_entrada_microfone_ok,'nao_testado'),
         IFNULL(check_entrada_cameras_flash_ok,'nao_testado'),
         IFNULL(check_entrada_touch_faceid_ok,'nao_testado'),
         IFNULL(check_entrada_aparelho_carrega,'nao_testado'),
         IFNULL(check_entrada_tela_frontal_ok,'nao_testado'),
         IFNULL(check_entrada_carregamento_cabo,'nao_testado'),
         IFNULL(check_entrada_carregamento_inducao,'nao_testado'),
         IFNULL(check_entrada_ima_magsafe,'nao_testado'),
         IFNULL(enviado_laboratorio,0), IFNULL(laboratorio_recebido,0),
         IF(criado_em IS NULL,'2025-01-01 00:00:00',criado_em), IF(atualizado_em IS NULL,'2025-01-01 00:00:00',atualizado_em)
  FROM ordens_servico
" | while IFS="$TAB" read -r old_id numero_os cliente_id status \
  tipo_equip marca modelo serie imei senha_equip \
  acessorios problema defeito \
  v_servico v_pecas c_pecas v_desconto v_total v_pago \
  f_pagamento tecnico_id usuario_criacao data_entrada \
  data_previsao data_conclusao data_entrega \
  obs_internas obs_cliente link_publico ativo eh_garantia prazo_garantia \
  motivo_cancel motivo_estorno data_estorno desconto_pag \
  ck_liga ck_vibra ck_botoes ck_bluetooth ck_wifi ck_vidro ck_audio \
  ck_mic ck_cameras ck_touch ck_carrega ck_tela ck_cabo ck_inducao ck_magsafe \
  enviado_lab lab_recebido criado_em atualizado_em; do

  new_uuid=$(cat /proc/sys/kernel/random/uuid)

  # Map status
  pg_status="OPEN"
  case "$status" in
    iniciada)              pg_status="OPEN" ;;
    em_diagnostico)        pg_status="IN_DIAGNOSIS" ;;
    aguardando_aprovacao)  pg_status="WAITING_APPROVAL" ;;
    aprovada)              pg_status="APPROVED" ;;
    aguardando_pecas)      pg_status="WAITING_PARTS" ;;
    em_execucao)           pg_status="IN_PROGRESS" ;;
    em_andamento)          pg_status="IN_PROGRESS" ;;
    concluida)             pg_status="COMPLETED" ;;
    concluido)             pg_status="COMPLETED" ;;
    paga)                  pg_status="PAID" ;;
    aguardando_pagamento)  pg_status="PAID" ;;
    aguardando_retirada)   pg_status="READY_FOR_PICKUP" ;;
    entregue)              pg_status="DELIVERED" ;;
    em_garantia)           pg_status="IN_WARRANTY" ;;
    cancelada)             pg_status="CANCELLED" ;;
    cancelado)             pg_status="CANCELLED" ;;
    estornada)             pg_status="REFUNDED" ;;
  esac

  pl="$link_publico"
  ! is_real "$pl" && pl=$(cat /proc/sys/kernel/random/uuid | tr -d '-')

  n_tipo=$(sv "$tipo_equip")
  n_marca=$(sv "$marca")
  n_modelo=$(sv "$modelo")
  n_serie=$(sv "$serie")
  n_imei=$(sv "$imei")
  n_senha=$(sv "$senha_equip")
  n_acess=$(sv "$acessorios")
  n_prob=$(sv "$problema")
  n_def=$(sv "$defeito")
  n_obsi=$(sv "$obs_internas")
  n_obsc=$(sv "$obs_cliente")
  n_prev=$(sv "$data_previsao")
  n_conc=$(sv "$data_conclusao")
  n_entr=$(sv "$data_entrega")
  n_fpag=$(sv "$f_pagamento")
  n_canc=$(sv "$motivo_cancel")
  n_est=$(sv "$motivo_estorno")
  n_dest=$(sv "$data_estorno")

  is_warranty="false"
  [ "$eh_garantia" = "1" ] && is_warranty="true"
  sent_lab="false"
  [ "$enviado_lab" = "1" ] && sent_lab="true"
  lab_recv="false"
  [ "$lab_recebido" = "1" ] && lab_recv="true"
  deleted_at="NULL"
  [ "$ativo" = "0" ] && deleted_at="'${atualizado_em}'"

  tech_sql="NULL"
  [ "$tecnico_id" != "0" ] && tech_sql="(SELECT new_id FROM _map_users WHERE old_id = ${tecnico_id})"
  created_by_sql="COALESCE((SELECT new_id FROM _map_users WHERE old_id = ${usuario_criacao}), '${SUPER_ADMIN_USER_ID}')"

  checklist="{\"aparelho_liga\":\"${ck_liga}\",\"aparelho_vibra\":\"${ck_vibra}\",\"botoes_ok\":\"${ck_botoes}\",\"bluetooth_ok\":\"${ck_bluetooth}\",\"wifi_ok\":\"${ck_wifi}\",\"vidro_traseiro_ok\":\"${ck_vidro}\",\"audio_ok\":\"${ck_audio}\",\"microfone_ok\":\"${ck_mic}\",\"cameras_flash_ok\":\"${ck_cameras}\",\"touch_faceid_ok\":\"${ck_touch}\",\"aparelho_carrega\":\"${ck_carrega}\",\"tela_frontal_ok\":\"${ck_tela}\",\"carregamento_cabo\":\"${ck_cabo}\",\"carregamento_inducao\":\"${ck_inducao}\",\"ima_magsafe\":\"${ck_magsafe}\"}"

  cat >> "$SQLFILE" << EOSQL
INSERT INTO service_orders (
  id, tenant_id, number, customer_id, technician_id, created_by_id, status, public_link,
  device_type, device_brand, device_model, serial_number, imei, device_password, accessories,
  reported_problem, diagnosed_problem, internal_notes, customer_notes, entry_checklist,
  service_amount, parts_amount, parts_cost, discount, total_amount, paid_amount,
  is_warranty, warranty_months,
  entry_date, estimated_date, completed_date, delivered_date,
  payment_method, payment_discount,
  cancellation_reason, refund_reason, refunded_at,
  sent_to_lab, lab_received, deleted_at, created_at, updated_at
) VALUES (
  '${new_uuid}', '${TENANT_ID}', '$(escape_sql "$numero_os")',
  (SELECT new_id FROM _map_customers WHERE old_id = ${cliente_id}),
  ${tech_sql}, ${created_by_sql}, '${pg_status}', '${pl}',
  ${n_tipo}, ${n_marca}, ${n_modelo}, ${n_serie}, ${n_imei}, ${n_senha}, ${n_acess},
  ${n_prob}, ${n_def}, ${n_obsi}, ${n_obsc}, '${checklist}',
  ${v_servico}, ${v_pecas}, ${c_pecas}, ${v_desconto}, ${v_total}, ${v_pago},
  ${is_warranty}, ${prazo_garantia},
  '${data_entrada}', ${n_prev}, ${n_conc}, ${n_entr},
  ${n_fpag}, ${desconto_pag},
  ${n_canc}, ${n_est}, ${n_dest},
  ${sent_lab}, ${lab_recv}, ${deleted_at}, '${criado_em}', '${atualizado_em}'
);
INSERT INTO _map_service_orders (old_id, new_id) VALUES (${old_id}, '${new_uuid}');
EOSQL
done

echo "COMMIT;" >> "$SQLFILE"
OS_RESULT=$($PG < "$SQLFILE" 2>&1)
if echo "$OS_RESULT" | grep -q "ERROR"; then
  echo "  [ERROR] Service orders SQL errors detected:"
  echo "$OS_RESULT" | grep "ERROR" | head -5
fi
OS_COUNT=$(echo "SELECT COUNT(*) FROM _map_service_orders" | $PG_QUIET)
echo "  [OK] Service orders migrated: ${OS_COUNT}"

# ========================================
# STEP 9b: ordens_servico_itens -> service_order_items
# ========================================
echo "Migrating ordens_servico_itens -> service_order_items..."

echo "BEGIN;" > "$SQLFILE"

$MYSQL -e "
  SELECT id, ordem_servico_id, tipo_item, IFNULL(servico_id,0), IFNULL(produto_id,0),
         COALESCE(NULLIF(REPLACE(REPLACE(descricao,'\n',' '),'\r',''),''),'Item'), IFNULL(valor,0), IFNULL(quantidade,1), IFNULL(subtotal,0),
         IFNULL(custo_unitario,0), IF(criado_em IS NULL,'2025-01-01 00:00:00',criado_em)
  FROM ordens_servico_itens
" | while IFS="$TAB" read -r old_id os_id tipo servico_id produto_id descricao valor qtd subtotal custo criado_em; do
  new_uuid=$(cat /proc/sys/kernel/random/uuid)
  desc_esc=$(escape_sql "$descricao")

  pg_type="SERVICE"
  [ "$tipo" = "produto" ] && pg_type="PRODUCT"

  svc_sql="NULL"
  [ "$servico_id" != "0" ] && svc_sql="(SELECT new_id FROM _map_services WHERE old_id = ${servico_id})"

  prod_sql="NULL"
  [ "$produto_id" != "0" ] && prod_sql="(SELECT new_id FROM _map_products WHERE old_id = ${produto_id})"

  cat >> "$SQLFILE" << EOSQL
INSERT INTO service_order_items (id, tenant_id, order_id, type, service_id, product_id, description, quantity, unit_price, cost_price, total, created_at)
VALUES ('${new_uuid}', '${TENANT_ID}',
  (SELECT new_id FROM _map_service_orders WHERE old_id = ${os_id}),
  '${pg_type}', ${svc_sql}, ${prod_sql}, '${desc_esc}', ${qtd}, ${valor}, ${custo}, ${subtotal}, '${criado_em}');
EOSQL
done

echo "COMMIT;" >> "$SQLFILE"
OSI_RESULT=$($PG < "$SQLFILE" 2>&1)
if echo "$OSI_RESULT" | grep -q "ERROR"; then
  echo "  [ERROR] OS items SQL errors:"
  echo "$OSI_RESULT" | grep "ERROR" | head -5
fi
OSI_COUNT=$(echo "SELECT COUNT(*) FROM service_order_items WHERE tenant_id = '${TENANT_ID}'" | $PG_QUIET)
echo "  [OK] Service order items migrated: ${OSI_COUNT}"

# ========================================
# STEP 9c: ordens_servico_historico -> service_order_history
# ========================================
echo "Migrating ordens_servico_historico -> service_order_history..."

echo "BEGIN;" > "$SQLFILE"

$MYSQL -e "
  SELECT id, ordem_servico_id, COALESCE(NULLIF(status_anterior,''),'${NP}'), status_novo,
         COALESCE(NULLIF(REPLACE(REPLACE(observacao,'\n',' '),'\r',''),''),'${NP}'), IFNULL(usuario_id,0), IF(criado_em IS NULL,'2025-01-01 00:00:00',criado_em)
  FROM ordens_servico_historico
" | while IFS="$TAB" read -r old_id os_id status_ant status_novo obs usuario_id criado_em; do
  new_uuid=$(cat /proc/sys/kernel/random/uuid)
  obs_val=$(sv "$obs")
  status_ant_val=$(sv "$status_ant")

  user_sql="'${SUPER_ADMIN_USER_ID}'"
  [ "$usuario_id" != "0" ] && user_sql="COALESCE((SELECT new_id FROM _map_users WHERE old_id = ${usuario_id}), '${SUPER_ADMIN_USER_ID}')"

  cat >> "$SQLFILE" << EOSQL
INSERT INTO service_order_history (id, tenant_id, order_id, user_id, previous_status, new_status, notes, created_at)
VALUES ('${new_uuid}', '${TENANT_ID}',
  (SELECT new_id FROM _map_service_orders WHERE old_id = ${os_id}),
  ${user_sql}, ${status_ant_val}, '$(escape_sql "$status_novo")', ${obs_val}, '${criado_em}');
EOSQL
done

echo "COMMIT;" >> "$SQLFILE"
$PG < "$SQLFILE" > /dev/null 2>&1
OSH_COUNT=$(echo "SELECT COUNT(*) FROM service_order_history WHERE tenant_id = '${TENANT_ID}'" | $PG_QUIET)
echo "  [OK] Service order history migrated: ${OSH_COUNT}"

# ========================================
# STEP 10: pdv_vendas -> sales
# ========================================
echo "Migrating pdv_vendas -> sales..."

echo "
BEGIN;
DELETE FROM sale_items WHERE tenant_id = '${TENANT_ID}';
DELETE FROM sales WHERE tenant_id = '${TENANT_ID}';
DELETE FROM _map_sales;
" > "$SQLFILE"

$MYSQL -e "
  SELECT id, numero_venda, IFNULL(cliente_id,0), vendedor_id,
         subtotal, IFNULL(desconto,0), COALESCE(NULLIF(desconto_tipo,''),'${NP}'),
         valor_total, IFNULL(valor_pago,0), IFNULL(troco,0),
         COALESCE(NULLIF(forma_pagamento,''),'${NP}'), COALESCE(NULLIF(REPLACE(REPLACE(pagamento_detalhes,'\n',' '),'\r',''),''),'${NP}'),
         status, IF(data_venda IS NULL,'2025-01-01 00:00:00',data_venda), COALESCE(NULLIF(link_publico,''),'${NP}'),
         IF(data_cancelamento IS NULL,'${NP}',data_cancelamento), COALESCE(NULLIF(REPLACE(REPLACE(motivo_cancelamento,'\n',' '),'\r',''),''),'${NP}'),
         IFNULL(usuario_cancelamento_id,0),
         criado_em, atualizado_em
  FROM pdv_vendas
" | while IFS="$TAB" read -r old_id numero cliente_id vendedor_id \
  subtotal desconto desconto_tipo valor_total valor_pago troco \
  forma_pagamento pagamento_detalhes status data_venda link_publico \
  data_cancel motivo_cancel usuario_cancel_id \
  criado_em atualizado_em; do

  [ -z "$old_id" ] && continue

  new_uuid=$(cat /proc/sys/kernel/random/uuid)
  numero_esc=$(escape_sql "$numero")

  pg_status="COMPLETED"
  case "$status" in
    finalizada) pg_status="COMPLETED" ;;
    cancelada)  pg_status="CANCELLED" ;;
    estornada)  pg_status="REFUNDED" ;;
  esac

  customer_sql="NULL"
  [ "$cliente_id" != "0" ] && customer_sql="(SELECT new_id FROM _map_customers WHERE old_id = ${cliente_id})"

  seller_sql="COALESCE((SELECT new_id FROM _map_users WHERE old_id = ${vendedor_id}), '${SUPER_ADMIN_USER_ID}')"

  pag_det_val="NULL"
  if is_real "$pagamento_detalhes"; then
    pag_esc=$(escape_sql "$pagamento_detalhes")
    pag_det_val="'${pag_esc}'"
  fi

  disc_type_val="NULL"
  is_real "$desconto_tipo" && {
    [ "$desconto_tipo" = "valor" ] && disc_type_val="'fixed'"
    [ "$desconto_tipo" = "percentual" ] && disc_type_val="'percentage'"
  }

  pl="$link_publico"
  ! is_real "$pl" && pl=$(cat /proc/sys/kernel/random/uuid | tr -d '-')

  cancel_at_val="NULL"
  is_real "$data_cancel" && cancel_at_val="'${data_cancel}'"

  cancel_reason_val=$(sv "$motivo_cancel")

  cancel_by_val="NULL"
  [ "$usuario_cancel_id" != "0" ] && cancel_by_val="(SELECT new_id FROM _map_users WHERE old_id = ${usuario_cancel_id})"

  cat >> "$SQLFILE" << EOSQL
INSERT INTO sales (
  id, tenant_id, number, customer_id, seller_id, status,
  subtotal, discount_type, discount_value, discount_amount, total_amount, paid_amount, change_amount,
  payment_details, sale_date, cancelled_at, cancelled_by_id, cancellation_reason,
  public_link, created_at, updated_at
) VALUES (
  '${new_uuid}', '${TENANT_ID}', '${numero_esc}',
  ${customer_sql}, ${seller_sql}, '${pg_status}',
  ${subtotal}, ${disc_type_val}, ${desconto}, ${desconto}, ${valor_total}, ${valor_pago}, ${troco},
  ${pag_det_val}, '${data_venda}', ${cancel_at_val}, ${cancel_by_val}, ${cancel_reason_val},
  '${pl}', '${criado_em}', '${atualizado_em}'
);
INSERT INTO _map_sales (old_id, new_id) VALUES (${old_id}, '${new_uuid}');
EOSQL
done

echo "COMMIT;" >> "$SQLFILE"
$PG < "$SQLFILE" > /dev/null 2>&1
SALES_COUNT=$(echo "SELECT COUNT(*) FROM _map_sales" | $PG_QUIET)
echo "  [OK] Sales migrated: ${SALES_COUNT}"

# ========================================
# STEP 10b: pdv_venda_itens -> sale_items
# ========================================
echo "Migrating pdv_venda_itens -> sale_items..."

# Create a placeholder product for items without product reference
MISC_PRODUCT_ID=$(cat /proc/sys/kernel/random/uuid)
echo "BEGIN;
INSERT INTO products (id, tenant_id, name, description, cost_price, sale_price, current_stock, min_stock, unit, active, created_at, updated_at)
VALUES ('${MISC_PRODUCT_ID}', '${TENANT_ID}', 'Item Avulso (Migrado)', 'Produto placeholder para itens de venda sem referencia de produto', 0, 0, 0, 0, 'un', false, NOW(), NOW())
ON CONFLICT DO NOTHING;
COMMIT;" | $PG > /dev/null 2>&1

echo "BEGIN;" > "$SQLFILE"

$MYSQL -e "
  SELECT id, venda_id, IFNULL(produto_id,0), COALESCE(NULLIF(REPLACE(REPLACE(descricao_avulsa,'\n',' '),'\r',''),''),'Item'),
         quantidade, preco_unitario, preco_custo_unitario, desconto_item, subtotal,
         criado_em
  FROM pdv_venda_itens
" | while IFS="$TAB" read -r old_id venda_id produto_id descricao qtd preco custo desconto subtotal criado_em; do
  new_uuid=$(cat /proc/sys/kernel/random/uuid)
  desc_esc=$(escape_sql "$descricao")

  product_sql="'${MISC_PRODUCT_ID}'"
  [ "$produto_id" != "0" ] && product_sql="COALESCE((SELECT new_id FROM _map_products WHERE old_id = ${produto_id}), '${MISC_PRODUCT_ID}')"

  cat >> "$SQLFILE" << EOSQL
INSERT INTO sale_items (id, tenant_id, sale_id, product_id, description, quantity, unit_price, cost_price, discount, total, created_at)
SELECT '${new_uuid}', '${TENANT_ID}', ms.new_id,
  ${product_sql}, '${desc_esc}', ${qtd}, ${preco}, ${custo}, ${desconto}, ${subtotal}, '${criado_em}'
FROM _map_sales ms WHERE ms.old_id = ${venda_id};
EOSQL
done

echo "COMMIT;" >> "$SQLFILE"
SI_RESULT=$($PG < "$SQLFILE" 2>&1)
if echo "$SI_RESULT" | grep -q "ERROR"; then
  echo "  [ERROR] Sale items SQL errors:"
  echo "$SI_RESULT" | grep "ERROR" | head -5
fi
SI_COUNT=$(echo "SELECT COUNT(*) FROM sale_items WHERE tenant_id = '${TENANT_ID}'" | $PG_QUIET)
echo "  [OK] Sale items migrated: ${SI_COUNT}"

# ========================================
# STEP 11: contas_receber -> financial_transactions (RECEIVABLE)
# ========================================
echo "Migrating contas_receber -> financial_transactions (RECEIVABLE)..."

echo "
BEGIN;
DELETE FROM installments WHERE tenant_id = '${TENANT_ID}';
DELETE FROM financial_transactions WHERE tenant_id = '${TENANT_ID}';
" > "$SQLFILE"

$MYSQL -e "
  SELECT id, REPLACE(REPLACE(descricao,'\n',' '),'\r',''), COALESCE(NULLIF(origem_tipo,''),'${NP}'), IFNULL(origem_id,0),
         IFNULL(cliente_id,0), valor_total, valor_pago, status,
         COALESCE(NULLIF(REPLACE(REPLACE(observacoes,'\n',' '),'\r',''),''),'${NP}'), data_emissao, IF(data_vencimento IS NULL,'${NP}',data_vencimento),
         criado_em, atualizado_em
  FROM contas_receber
" | while IFS="$TAB" read -r old_id descricao origem_tipo origem_id \
  cliente_id valor_total valor_pago status obs data_emissao data_vencimento \
  criado_em atualizado_em; do
  new_uuid=$(cat /proc/sys/kernel/random/uuid)
  desc_esc=$(escape_sql "$descricao")

  pg_status="PENDING"
  case "$status" in
    pendente)  pg_status="PENDING" ;;
    parcial)   pg_status="PARTIALLY_PAID" ;;
    paga)      pg_status="PAID" ;;
    vencida)   pg_status="OVERDUE" ;;
    cancelada) pg_status="CANCELLED" ;;
  esac

  ref_id="NULL"
  ref_type="NULL"
  if is_real "$origem_tipo" && [ "$origem_id" != "0" ]; then
    ref_type="'${origem_tipo}'"
    case "$origem_tipo" in
      ordem_servico) ref_id="(SELECT new_id FROM _map_service_orders WHERE old_id = ${origem_id})" ;;
      pdv_venda)     ref_id="(SELECT new_id FROM _map_sales WHERE old_id = ${origem_id})" ;;
    esac
  fi

  customer_sql="NULL"
  [ "$cliente_id" != "0" ] && customer_sql="(SELECT new_id FROM _map_customers WHERE old_id = ${cliente_id})"

  due_date="'${data_emissao}'"
  is_real "$data_vencimento" && due_date="'${data_vencimento}'"

  paid_at="NULL"
  [ "$status" = "paga" ] && paid_at="'${atualizado_em}'"

  obs_val=$(sv "$obs")

  cat >> "$SQLFILE" << EOSQL
INSERT INTO financial_transactions (id, tenant_id, type, status, description, total_amount, paid_amount, due_date, paid_at, reference_id, reference_type, customer_id, notes, created_at, updated_at)
VALUES ('${new_uuid}', '${TENANT_ID}', 'RECEIVABLE', '${pg_status}', '${desc_esc}', ${valor_total}, ${valor_pago}, ${due_date}, ${paid_at}, ${ref_id}, ${ref_type}, ${customer_sql}, ${obs_val}, '${criado_em}', '${atualizado_em}');
EOSQL
done

echo "COMMIT;" >> "$SQLFILE"
$PG < "$SQLFILE" > /dev/null 2>&1
CR_COUNT=$(echo "SELECT COUNT(*) FROM financial_transactions WHERE tenant_id = '${TENANT_ID}' AND type = 'RECEIVABLE'" | $PG_QUIET)
echo "  [OK] Financial transactions (receivable) migrated: ${CR_COUNT}"

# ========================================
# STEP 11b: contas_pagar -> financial_transactions (PAYABLE)
# ========================================
echo "Migrating contas_pagar -> financial_transactions (PAYABLE)..."

echo "BEGIN;" > "$SQLFILE"

$MYSQL -e "
  SELECT id, REPLACE(REPLACE(descricao,'\n',' '),'\r',''), COALESCE(NULLIF(fornecedor,''),'${NP}'), valor_total, valor_pago, status,
         COALESCE(NULLIF(REPLACE(REPLACE(observacoes,'\n',' '),'\r',''),''),'${NP}'), data_emissao, IF(data_vencimento IS NULL,'${NP}',data_vencimento),
         criado_em, atualizado_em
  FROM contas_pagar
" | while IFS="$TAB" read -r old_id descricao fornecedor valor_total valor_pago status obs data_emissao data_vencimento criado_em atualizado_em; do
  new_uuid=$(cat /proc/sys/kernel/random/uuid)
  desc_esc=$(escape_sql "$descricao")

  pg_status="PENDING"
  case "$status" in
    pendente)  pg_status="PENDING" ;;
    parcial)   pg_status="PARTIALLY_PAID" ;;
    paga)      pg_status="PAID" ;;
    vencida)   pg_status="OVERDUE" ;;
    cancelada) pg_status="CANCELLED" ;;
  esac

  due_date="'${data_emissao}'"
  is_real "$data_vencimento" && due_date="'${data_vencimento}'"

  paid_at="NULL"
  [ "$status" = "paga" ] && paid_at="'${atualizado_em}'"

  notes_val="NULL"
  if is_real "$fornecedor" && is_real "$obs"; then
    notes_val="'Fornecedor: $(escape_sql "$fornecedor") | $(escape_sql "$obs")'"
  elif is_real "$fornecedor"; then
    notes_val="'Fornecedor: $(escape_sql "$fornecedor")'"
  elif is_real "$obs"; then
    notes_val="'$(escape_sql "$obs")'"
  fi

  cat >> "$SQLFILE" << EOSQL
INSERT INTO financial_transactions (id, tenant_id, type, status, description, total_amount, paid_amount, due_date, paid_at, notes, created_at, updated_at)
VALUES ('${new_uuid}', '${TENANT_ID}', 'PAYABLE', '${pg_status}', '${desc_esc}', ${valor_total}, ${valor_pago}, ${due_date}, ${paid_at}, ${notes_val}, '${criado_em}', '${atualizado_em}');
EOSQL
done

echo "COMMIT;" >> "$SQLFILE"
$PG < "$SQLFILE" > /dev/null 2>&1
CP_COUNT=$(echo "SELECT COUNT(*) FROM financial_transactions WHERE tenant_id = '${TENANT_ID}' AND type = 'PAYABLE'" | $PG_QUIET)
echo "  [OK] Financial transactions (payable) migrated: ${CP_COUNT}"

# ========================================
# STEP 12: Cleanup mapping tables
# ========================================
echo "Cleaning up mapping tables..."
echo "
DROP TABLE IF EXISTS _map_diagnostic_templates;
DROP TABLE IF EXISTS _map_sales;
DROP TABLE IF EXISTS _map_service_orders;
DROP TABLE IF EXISTS _map_service_providers;
DROP TABLE IF EXISTS _map_delivery_persons;
DROP TABLE IF EXISTS _map_payment_methods;
DROP TABLE IF EXISTS _map_products;
DROP TABLE IF EXISTS _map_services;
DROP TABLE IF EXISTS _map_customers;
DROP TABLE IF EXISTS _map_users;
" | $PG > /dev/null 2>&1
echo "  [OK] Mapping tables cleaned up"

# ========================================
# VERIFICATION
# ========================================
echo ""
echo "============================================="
echo "  VERIFICATION: Row Counts"
echo "============================================="
echo ""

printf "%-30s %-15s %-15s\n" "Table" "MySQL" "PostgreSQL"
printf "%-30s %-15s %-15s\n" "-----" "-----" "----------"

mysql_users=$($MYSQL -e "SELECT COUNT(*) FROM usuarios WHERE ativo=1 AND cpf IS NOT NULL AND cpf != '' AND cpf REGEXP '^[0-9]{11}$'")
pg_users=$(echo "SELECT COUNT(*) FROM users" | $PG_QUIET)
printf "%-30s %-15s %-15s\n" "users" "$mysql_users" "$pg_users"

pg_ut=$(echo "SELECT COUNT(*) FROM user_tenants WHERE tenant_id = '${TENANT_ID}'" | $PG_QUIET)
printf "%-30s %-15s %-15s\n" "user_tenants" "-" "$pg_ut"

mysql_cust=$($MYSQL -e "SELECT COUNT(*) FROM clientes")
pg_cust=$(echo "SELECT COUNT(*) FROM customers WHERE tenant_id = '${TENANT_ID}'" | $PG_QUIET)
printf "%-30s %-15s %-15s\n" "customers" "$mysql_cust" "$pg_cust"

mysql_cust_a=$($MYSQL -e "SELECT COUNT(*) FROM clientes WHERE ativo=1")
pg_cust_a=$(echo "SELECT COUNT(*) FROM customers WHERE tenant_id = '${TENANT_ID}' AND deleted_at IS NULL" | $PG_QUIET)
printf "%-30s %-15s %-15s\n" "customers (active)" "$mysql_cust_a" "$pg_cust_a"

mysql_svc=$($MYSQL -e "SELECT COUNT(*) FROM servicos")
pg_svc=$(echo "SELECT COUNT(*) FROM services WHERE tenant_id = '${TENANT_ID}'" | $PG_QUIET)
printf "%-30s %-15s %-15s\n" "services" "$mysql_svc" "$pg_svc"

mysql_diag=$($MYSQL -e "SELECT COUNT(*) FROM avaliacoes")
pg_diag=$(echo "SELECT COUNT(*) FROM diagnostic_templates WHERE tenant_id = '${TENANT_ID}'" | $PG_QUIET)
printf "%-30s %-15s %-15s\n" "diagnostic_templates" "$mysql_diag" "$pg_diag"

mysql_prod=$($MYSQL -e "SELECT COUNT(*) FROM produtos")
pg_prod=$(echo "SELECT COUNT(*) FROM products WHERE tenant_id = '${TENANT_ID}'" | $PG_QUIET)
printf "%-30s %-15s %-15s\n" "products" "$mysql_prod" "$pg_prod"

mysql_pm=$($MYSQL -e "SELECT COUNT(*) FROM formas_pagamento")
pg_pm=$(echo "SELECT COUNT(*) FROM payment_methods WHERE tenant_id = '${TENANT_ID}'" | $PG_QUIET)
printf "%-30s %-15s %-15s\n" "payment_methods" "$mysql_pm" "$pg_pm"

mysql_dp=$($MYSQL -e "SELECT COUNT(*) FROM entregadores")
pg_dp=$(echo "SELECT COUNT(*) FROM delivery_persons WHERE tenant_id = '${TENANT_ID}'" | $PG_QUIET)
printf "%-30s %-15s %-15s\n" "delivery_persons" "$mysql_dp" "$pg_dp"

mysql_sp=$($MYSQL -e "SELECT COUNT(*) FROM prestadores")
pg_sp=$(echo "SELECT COUNT(*) FROM service_providers WHERE tenant_id = '${TENANT_ID}'" | $PG_QUIET)
printf "%-30s %-15s %-15s\n" "service_providers" "$mysql_sp" "$pg_sp"

mysql_os=$($MYSQL -e "SELECT COUNT(*) FROM ordens_servico")
pg_os=$(echo "SELECT COUNT(*) FROM service_orders WHERE tenant_id = '${TENANT_ID}'" | $PG_QUIET)
printf "%-30s %-15s %-15s\n" "service_orders" "$mysql_os" "$pg_os"

mysql_osi=$($MYSQL -e "SELECT COUNT(*) FROM ordens_servico_itens")
pg_osi=$(echo "SELECT COUNT(*) FROM service_order_items WHERE tenant_id = '${TENANT_ID}'" | $PG_QUIET)
printf "%-30s %-15s %-15s\n" "service_order_items" "$mysql_osi" "$pg_osi"

mysql_osh=$($MYSQL -e "SELECT COUNT(*) FROM ordens_servico_historico")
pg_osh=$(echo "SELECT COUNT(*) FROM service_order_history WHERE tenant_id = '${TENANT_ID}'" | $PG_QUIET)
printf "%-30s %-15s %-15s\n" "service_order_history" "$mysql_osh" "$pg_osh"

mysql_sales=$($MYSQL -e "SELECT COUNT(*) FROM pdv_vendas")
pg_sales=$(echo "SELECT COUNT(*) FROM sales WHERE tenant_id = '${TENANT_ID}'" | $PG_QUIET)
printf "%-30s %-15s %-15s\n" "sales" "$mysql_sales" "$pg_sales"

mysql_si=$($MYSQL -e "SELECT COUNT(*) FROM pdv_venda_itens")
pg_si=$(echo "SELECT COUNT(*) FROM sale_items WHERE tenant_id = '${TENANT_ID}'" | $PG_QUIET)
printf "%-30s %-15s %-15s\n" "sale_items" "$mysql_si" "$pg_si"

mysql_cr=$($MYSQL -e "SELECT COUNT(*) FROM contas_receber")
mysql_cp=$($MYSQL -e "SELECT COUNT(*) FROM contas_pagar")
mysql_ft=$((mysql_cr + mysql_cp))
pg_ft=$(echo "SELECT COUNT(*) FROM financial_transactions WHERE tenant_id = '${TENANT_ID}'" | $PG_QUIET)
printf "%-30s %-15s %-15s\n" "financial_transactions" "$mysql_ft" "$pg_ft"

echo ""
echo "============================================="
echo "  Migration complete!"
echo "============================================="

rm -f "$SQLFILE"

REMOTE_SCRIPT

echo ""
log_ok "Migration script finished on VPS"
