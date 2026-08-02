-- ADR 0061 — `subscriptions.current_period_end` deixa de aceitar NULL.
--
-- Por quê: o cron de vencimento filtra por `current_period_end < now()`, e NULL
-- nunca casa com `<`. Uma assinatura com vencimento nulo é INVISÍVEL para o
-- motor de cobrança: nunca vira PAST_DUE, nunca suspende, fica ativa e de graça
-- para sempre, em silêncio.
--
-- Não é hipótese. Medido em produção em 2026-08-02: a ÚNICA assinatura existente
-- estava exatamente nesse estado (`current_period_end IS NULL`, criada em
-- 12/07/2026). Ela também não tem `subscription.activate` no audit log, o que
-- mostra que não veio pelo código — `activateSubscription` sempre grava o
-- vencimento no create e sempre audita. Foi inserida à mão e caiu num estado que
-- o motor não enxerga.
--
-- Expand-contract em duas etapas: preenche, depois restringe. O backfill deriva
-- o vencimento de um ciclo após o início, que é o mesmo cálculo do
-- `nextPeriodEnd` para uma assinatura recém-ativada.

-- Etapa 1 — backfill. Sem `WHERE`, `started_at` seria reescrito à toa; o filtro
-- garante que só as linhas órfãs mudam.
UPDATE subscriptions
SET current_period_end = started_at + CASE
      WHEN billing_cycle = 'YEARLY' THEN INTERVAL '1 year'
      ELSE INTERVAL '1 month'
    END
WHERE current_period_end IS NULL;

-- Etapa 2 — restringe. A tabela tem uma linha em produção, então o lock é
-- instantâneo e não justifica o rodeio de CHECK NOT VALID + VALIDATE. Se um dia
-- houver volume, este é o ponto a trocar.
SET lock_timeout = '5s';
ALTER TABLE subscriptions ALTER COLUMN current_period_end SET NOT NULL;
