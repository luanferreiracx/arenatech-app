-- Saldo de cashback NUNCA negativo (auditoria 2026-07-25).
--
-- `lockBalance`/`unlockBalance` faziam read-modify-write sem CAS: o gate
-- ("disponivel >= pedido") era avaliado sobre um snapshot e o `decrement`
-- seguinte nao reavaliava a condicao. Dois locks concorrentes de R$100 sobre um
-- saldo de R$100 passavam os dois e deixavam `available_balance = -100`. O CAS
-- no codigo fecha a corrida; esta CHECK e a rede final, para qualquer caminho
-- novo que esqueca o guard.
--
-- LIMPEZA DO LEGADO (decisao do dono 2026-07-27): a base tinha 2 saldos
-- negativos (-55,00 e -60,00) vindos da migracao do Laravel de 2026-05-23 —
-- NAO do bug de concorrencia (os 4 saldos compartilham o mesmo `updated_at`, e
-- os movimentos somam exatamente -115: creditou 215, debitou 330). Era divida
-- historica importada de um modulo que nunca entrou em uso: 0 campanhas, e as
-- 22 acoes todas em estado terminal (EXPIRED/CANCELLED/REJECTED) fora 1 PENDING
-- orfa. O dono confirmou que o modulo antigo nao era usado e autorizou comecar
-- do zero, entao zeramos a fidelidade em vez de arrastar o passivo.
--
-- Corte por data: so remove o que nasceu ANTES do modulo de fidelidade ir ao ar
-- (PRs #685-#690, 2026-07-25). Dado novo nao e tocado, e rodar de novo e no-op.

DELETE FROM reward_movements WHERE created_at < DATE '2026-07-01';
DELETE FROM reward_balances  WHERE created_at < DATE '2026-07-01';
DELETE FROM reward_actions   WHERE created_at < DATE '2026-07-01';

-- Rede final no banco. NOT VALID + VALIDATE separa o lock pesado da validacao
-- (padrao zero-downtime): o ADD nao varre a tabela, o VALIDATE varre com lock
-- fraco. Aqui a tabela e pequena, mas o padrao fica correto para quando crescer.
ALTER TABLE reward_balances
  ADD CONSTRAINT reward_balances_available_non_negative
  CHECK (available_balance >= 0) NOT VALID;
ALTER TABLE reward_balances VALIDATE CONSTRAINT reward_balances_available_non_negative;

ALTER TABLE reward_balances
  ADD CONSTRAINT reward_balances_locked_non_negative
  CHECK (locked_balance >= 0) NOT VALID;
ALTER TABLE reward_balances VALIDATE CONSTRAINT reward_balances_locked_non_negative;
