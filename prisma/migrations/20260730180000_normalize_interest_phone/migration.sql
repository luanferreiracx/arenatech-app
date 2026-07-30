-- CL-1 — Módulo 9 (Finalização): normaliza `interests.phone` para só-dígitos.
--
-- A coluna era escrita em dois formatos: a procedure do painel normalizava, o
-- bot do WhatsApp gravava o telefone cru do contato. Medido em produção antes da
-- correção: 23 dos 75 interesses tinham máscara.
--
-- A conversão automática de lead (venda/OS → interesse) casa pelos últimos 8
-- dígitos com `endsWith`. Um valor mascarado termina em "9999", não em
-- "99999999" — sem este backfill os 23 continuariam invisíveis ao conversor,
-- que é exatamente o defeito que estamos fechando.
--
-- Idempotente e restrito às linhas que precisam: quem já é só-dígitos não muda.
UPDATE interests
   SET phone = regexp_replace(phone, '[^0-9]', '', 'g')
 WHERE phone IS NOT NULL
   AND phone !~ '^[0-9]*$';
