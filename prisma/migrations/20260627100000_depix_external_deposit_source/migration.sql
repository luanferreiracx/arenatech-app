-- Origem EXTERNAL_DEPOSIT: deposito de DePix on-chain vindo de uma carteira
-- externa (Sideswap, hardware wallet) — sem PIX/Eulen. O monitor LWK detecta a
-- entrada sem label e registra a tx; o credito so apos cross-check on-chain.
ALTER TYPE "DepixTransactionSourceType" ADD VALUE 'EXTERNAL_DEPOSIT';
