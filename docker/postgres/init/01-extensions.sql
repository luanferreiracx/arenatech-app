CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Mede QUAL query custa caro, com dados e concorrência reais. Depende de
-- `shared_preload_libraries=pg_stat_statements` no `command` do serviço postgres
-- (docker-compose) — sem o preload este CREATE falha, e é de propósito: melhor
-- falhar no boot de um ambiente novo do que subir achando que há medição.
--
-- ATENÇÃO: este diretório (`/docker-entrypoint-initdb.d`) só roda quando o
-- volume de dados está VAZIO. Em banco que já existe — produção incluída — a
-- extensão precisa ser criada à mão:
--   docker exec <container> psql -U arenatech -d arenatech \
--     -c 'CREATE EXTENSION IF NOT EXISTS pg_stat_statements;'
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
