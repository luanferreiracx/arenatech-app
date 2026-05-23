-- Adiciona valor EXPIRED ao enum QuickSaleStatus.
-- ALTER TYPE...ADD VALUE nao pode rodar dentro de transacao em algumas
-- versoes; usamos IF NOT EXISTS para idempotencia.
ALTER TYPE "QuickSaleStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
