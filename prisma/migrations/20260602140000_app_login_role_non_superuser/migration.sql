-- Role de LOGIN nao-privilegiado para o RUNTIME da aplicacao.
--
-- PROBLEMA: a app conectava como `arenatech` (SUPERUSER + owner das tabelas).
-- Superuser IGNORA RLS — entao o isolamento entre tenants dependia apenas da
-- disciplina de sempre usar withTenant()/withAdmin(). Qualquer `prisma.<model>`
-- direto enxergava TODOS os tenants.
--
-- SOLUCAO: o runtime passa a logar como `app_login`, um role SEM superuser, SEM
-- BYPASSRLS e SEM ser owner das tabelas — portanto SUJEITO a RLS. Ele e membro
-- de `app_user` (default, sujeito a RLS) e de `app_admin` (BYPASSRLS, usado so
-- via SET LOCAL ROLE em withAdmin). Migrations continuam rodando com `arenatech`
-- (DATABASE_URL); o runtime usa APP_DATABASE_URL apontando para app_login.
--
-- A SENHA do app_login NAO e versionada. Defina-a por ambiente, fora do git:
--   ALTER ROLE app_login WITH PASSWORD '<senha>';
-- (em dev: ver passo manual; em prod: secret no servidor.)

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_login') THEN
    -- LOGIN, sem privilegios elevados. Sem senha aqui (definida por ambiente).
    CREATE ROLE app_login LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  ELSE
    -- Garante o estado correto mesmo se o role ja existir.
    ALTER ROLE app_login LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

-- app_login pode assumir app_user (default) e app_admin via SET ROLE.
GRANT app_user TO app_login;
GRANT app_admin TO app_login;

-- Por padrao, ao conectar, a sessao roda como app_user (sujeito a RLS).
-- withAdmin() faz SET LOCAL ROLE app_admin quando precisa do bypass.
ALTER ROLE app_login SET ROLE app_user;

-- Acesso ao schema (os GRANTs de tabela/sequence ja foram dados a app_user/
-- app_admin na migration base 20260508155300_enable_rls e via ALTER DEFAULT
-- PRIVILEGES; app_login herda por ser membro desses roles).
GRANT USAGE ON SCHEMA public TO app_login;
