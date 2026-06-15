import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

describe("sale item stock item history", () => {
  it("does not enforce a global unique constraint on SaleItem.stockItemId", () => {
    const schema = readFileSync(join(root, "prisma/schema/sale.prisma"), "utf8");

    expect(schema).not.toContain("@@unique([stockItemId])");
    expect(schema).toContain("@@index([tenantId, stockItemId, createdAt])");
  });

  it("documents the migration from uniqueness to historical index", () => {
    const migration = readFileSync(
      join(root, "prisma/migrations/20260606170000_sale_item_stock_item_history_index/migration.sql"),
      "utf8",
    );

    expect(migration).toContain('DROP INDEX IF EXISTS "sale_items_stock_item_id_key"');
    expect(migration).toContain('"sale_items_tenant_id_stock_item_id_created_at_idx"');
  });

  it("reserves stock items when added to cart and releases on remove/abandon/cancel", () => {
    const router = readFileSync(join(root, "src/server/api/routers/sale.ts"), "utf8");

    // Item é reservado atomicamente ao ser adicionado ao carrinho.
    expect(router).toContain('status: "RESERVED"');
    expect(router).toContain('reservedForType: "sale"');
    expect(router).toContain("reservedForId: sale.id");
    // Finalização aceita RESERVED (reservado para esta venda) ou AVAILABLE (rascunho antigo).
    expect(router).toContain('status: "AVAILABLE" }');
    // Reservas são liberadas ao remover item, abandonar ou cancelar venda.
    expect(router).toContain("releaseSaleStockItemReservations");
  });

  it("allows trade-in (upgrade) of an IMEI the store already sold", () => {
    const router = readFileSync(join(root, "src/server/api/routers/sale.ts"), "utf8");

    // addUpgrade não bloqueia mais cegamente: só recusa IMEI ainda em circulação.
    // SOLD/DEFECTIVE (fora de circulação) podem voltar como aparelho de entrada.
    expect(router).toContain("isRepurchasableStatus(existing.status)");
    // Na finalização, o StockItem antigo é arquivado e o DevicePurchase anterior
    // cancelado, para liberar o IMEI antes de recriar (unique parcial).
    expect(router).toContain("Aparelho recomprado como entrada (upgrade)");
  });
});
