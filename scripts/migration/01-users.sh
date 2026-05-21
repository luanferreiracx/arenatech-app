#!/bin/bash
# Fase 1: usuarios Laravel -> users + user_tenants Next.js
# Mantem o hash bcrypt original (compativel com bcryptjs do NextAuth)

set -euo pipefail

TENANT_ID="dd308431-0525-417a-97c5-459e4b6cf45a"
PG="docker exec -i arenatech-postgres-prod psql -U arenatech arenatech"
MYSQL="mysql arena_dev -N --batch --raw"

echo "=> Criando tabela de mapeamento..."
$PG > /dev/null <<EOF
DROP TABLE IF EXISTS _map_users CASCADE;
CREATE TABLE _map_users (old_id INT PRIMARY KEY, new_id UUID NOT NULL);
EOF

echo "=> Mapeando admins Laravel para super admins ja existentes..."
$PG > /dev/null <<EOF
-- Laravel user id=5 (Luan) -> super admin Luan ja cadastrado
INSERT INTO _map_users (old_id, new_id) VALUES (5, '64472a4d-3063-495e-94ea-294e419e1e2d')
ON CONFLICT DO NOTHING;
EOF

echo "=> Lendo usuarios do Laravel..."
$MYSQL -e "
  SELECT id, COALESCE(cpf, ''), nome, COALESCE(whatsapp, ''),
         password, role, ativo, criado_em
  FROM usuarios
  ORDER BY id;
" > /tmp/_users.tsv

count_in=$(wc -l < /tmp/_users.tsv)
echo "   -> $count_in usuarios Laravel"

echo "=> Gerando SQL de insert..."
{
  echo "BEGIN;"
  while IFS=$'\t' read -r id cpf nome whatsapp password role ativo criado_em; do
    # Se ja mapeado (id=5 Luan), pula
    if [ "$id" = "5" ]; then continue; fi

    # CPF: usar generated se vazio (placeholder com prefixo "ZZ" + id)
    # CPF deve ser unico no Postgres; CPF vazio Laravel -> placeholder
    cpf_norm=$(echo "$cpf" | tr -cd '0-9')
    if [ -z "$cpf_norm" ] || [ "${#cpf_norm}" -lt 11 ]; then
      # Placeholder valido em comprimento (11 chars) baseado no id
      cpf_norm=$(printf "99999%06d" "$id")
    fi

    # Email pode ser NULL (Laravel nao tem)
    # Role Laravel: admin/user/tecnico -> Next.js: owner/operator/technician
    case "$role" in
      admin)    pg_role="owner";    is_super="false" ;;
      gerente)  pg_role="manager";  is_super="false" ;;
      tecnico)  pg_role="technician"; is_super="false" ;;
      caixa)    pg_role="cashier";  is_super="false" ;;
      *)        pg_role="operator"; is_super="false" ;;
    esac

    nome_esc=$(echo "$nome" | sed "s/'/''/g")
    # criado_em pode vir vazio; usar NOW() nesses casos
    if [ -z "$criado_em" ] || [ "$criado_em" = "NULL" ]; then
      created_sql="NOW()"
    else
      created_sql="'$criado_em'"
    fi

    cat <<SQL
WITH new_user AS (
  INSERT INTO users (id, cpf, name, password_hash, is_super_admin, created_at, updated_at)
  VALUES (gen_random_uuid(), '$cpf_norm', '$nome_esc', '$password', $is_super, $created_sql, NOW())
  RETURNING id
)
INSERT INTO _map_users (old_id, new_id) SELECT $id, id FROM new_user;
INSERT INTO user_tenants (user_id, tenant_id, role, created_at)
  SELECT new_id, '$TENANT_ID', '$pg_role', $created_sql FROM _map_users WHERE old_id = $id
  ON CONFLICT DO NOTHING;
SQL
  done < /tmp/_users.tsv

  # Tambem garantir que o super admin Luan tenha user_tenants para o tenant
  cat <<SQL
INSERT INTO user_tenants (user_id, tenant_id, role, created_at)
VALUES ('64472a4d-3063-495e-94ea-294e419e1e2d', '$TENANT_ID', 'owner', NOW())
ON CONFLICT DO NOTHING;
SQL

  echo "COMMIT;"
} > /tmp/_users_insert.sql

echo "=> Aplicando no Postgres..."
$PG -q < /tmp/_users_insert.sql > /tmp/_users_result.log 2>&1 || {
  echo "ERRO ao aplicar SQL:"
  tail -30 /tmp/_users_result.log
  exit 1
}

# Contagem final
echo "=> Resultado:"
$PG -c "
  SELECT 'users (total)' AS tabela, COUNT(*) FROM users
  UNION ALL SELECT 'user_tenants (arena)', COUNT(*) FROM user_tenants WHERE tenant_id='$TENANT_ID'
  UNION ALL SELECT '_map_users', COUNT(*) FROM _map_users;
"
