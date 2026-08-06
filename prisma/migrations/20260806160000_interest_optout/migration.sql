-- Opt-out de LGPD no proprio lead.
--
-- Auditoria 2026-08-06 (M4-1). O gate do disparo em massa ja casava o opt-out
-- por `customerId` OU por telefone — "o opt-out e da PESSOA, nao do registro",
-- como diz o comentario do CL-2. O que faltava era a porta de ENTRADA:
-- `communication.unsubscribeCustomer` exige `customerId`, e **114 dos 119 leads
-- de producao nao tem Customer**.
--
-- Consequencia medida: se um desses leads responde "PARE" no WhatsApp, o
-- operador nao tem onde registrar. As saidas eram criar um Customer ficticio so
-- para marca-lo descadastrado, ou apagar o lead (hard delete, admin-only) — que
-- destroi a prova de que o pedido foi atendido.
--
-- Nullable e sem backfill: inventar consentimento retroativo seria pior do que
-- admitir a lacuna. Mesmo criterio do aceite de termos (ADR 0065).

ALTER TABLE "interests"
  ADD COLUMN "unsubscribed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "unsubscribed_at" TIMESTAMP(3);

-- O disparo em massa filtra por este campo; sem indice, o filtro varre a tabela
-- inteira a cada lote. Parcial porque quem pediu para sair e minoria por
-- natureza — o indice cobre so as linhas que importam.
CREATE INDEX "interests_tenant_id_unsubscribed_idx"
  ON "interests" ("tenant_id", "unsubscribed")
  WHERE "unsubscribed" = true;
