-- AlterTable: Customer ganha opt-out de comunicacoes (LGPD)
ALTER TABLE "customers"
ADD COLUMN "unsubscribed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "unsubscribed_at" TIMESTAMP(3);
