-- Saque ON-CHAIN (Sideswap/externo): endereco Liquid de destino. Quando
-- preenchido (kind=WITHDRAW), discrimina um envio on-chain direto de um saque
-- PIX. Nullable, sem backfill.
ALTER TABLE "tenant_depix_transactions" ADD COLUMN "onchain_address" TEXT;
