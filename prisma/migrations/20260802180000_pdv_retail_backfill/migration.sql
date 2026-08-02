-- Compatibilidade da divisão de `pdv` em `pdv` + `pdv-retail` (2026-08-02).
--
-- Antes desta mudança, `pdv` num plano significava "PDV completo": abrir venda
-- de balcão E receber o valor de uma OS. A divisão criou `pdv-retail` para a
-- venda livre, e é o que permite vender assistência sem varejo.
--
-- Sem este backfill, todo plano JÁ EXISTENTE passaria a conceder só a base e o
-- cliente perderia a venda de balcão no deploy — uma regressão silenciosa, no
-- meio do expediente de quem já paga. Medido antes de escrever: em produção o
-- plano PRO tem `pdv` e é o plano da conta de demonstração.
--
-- A regra é literal: quem tinha `pdv` tinha a venda livre, então passa a ter
-- `pdv-retail` também. Planos novos do catálogo escolhem explicitamente.

UPDATE plans
SET features = jsonb_set(
      features::jsonb,
      '{modules}',
      (features::jsonb -> 'modules') || '["pdv-retail"]'::jsonb
    )
WHERE features IS NOT NULL
  AND jsonb_typeof(features::jsonb -> 'modules') = 'array'
  AND (features::jsonb -> 'modules') @> '["pdv"]'::jsonb
  AND NOT (features::jsonb -> 'modules') @> '["pdv-retail"]'::jsonb;
