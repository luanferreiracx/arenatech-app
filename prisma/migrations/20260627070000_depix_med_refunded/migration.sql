-- MED (Mecanismo Especial de Devolucao): deposito devolvido pelo BC apos pago.
-- Novo status terminal + timestamp do report. O DePix ja esta on-chain na
-- carteira; o estorno e manual (servidor nao debita non-custodial sem a chave).
ALTER TYPE "DepixTransactionStatus" ADD VALUE 'MED_REFUNDED';
ALTER TABLE "tenant_depix_transactions" ADD COLUMN "med_reported_at" TIMESTAMP(3);
