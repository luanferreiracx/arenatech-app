DO $$
DECLARE
  tbl text;
  cnt int := 0;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables WHERE schemaname='public'
      AND tablename NOT IN ('tenants','users','user_tenants','plans','addons','_prisma_migrations')
      AND tablename NOT LIKE '_map_%'
  LOOP
    BEGIN
      EXECUTE 'TRUNCATE TABLE public.' || quote_ident(tbl) || ' CASCADE';
      cnt := cnt + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Falha em %: %', tbl, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Truncadas com sucesso: %', cnt;
END$$;
