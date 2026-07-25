-- Alinha o enum StockMovementType do banco com o schema.prisma.
--
-- BUG (auditoria 2026-07-25): o schema declara RESERVE/RELEASE desde a
-- introdução do fluxo "peça na OS" (os-stock.service.ts), mas NENHUMA migration
-- adicionou os valores ao banco. O enum em produção parou em
-- ('ENTRY','EXIT','ADJUSTMENT','SALE','RETURN','TRANSFER').
--
-- Efeito: `reserveStockForOsItem` grava `type: "RESERVE"` e o INSERT estoura
-- ("invalid input value for enum"). Como o decremento de estoque acontece na
-- MESMA transação, tudo faz rollback — sem corrupção, mas adicionar peça/produto
-- numa OS SEMPRE falhou. Prova em produção: 235 service_order_items, 100%
-- do tipo SERVICE, nenhum PRODUCT, e zero stock_movements RESERVE/RELEASE.
--
-- ALTER TYPE ... ADD VALUE é aditivo: não reescreve linha nenhuma e não afeta
-- os valores existentes. IF NOT EXISTS torna a migration idempotente e segura
-- num banco que porventura já os tenha (ex.: criado do zero por um schema push).
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'RESERVE';
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'RELEASE';
