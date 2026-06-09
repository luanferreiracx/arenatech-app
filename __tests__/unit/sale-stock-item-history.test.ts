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

  it("keeps double-sell protection in the atomic StockItem update", () => {
    const router = readFileSync(join(root, "src/server/api/routers/sale.ts"), "utf8");

    expect(router).toContain('status: "AVAILABLE", // proteçao contra double-sell');
    expect(router).toContain("tenantId: ctx.tenantId");
    expect(router).toContain("deletedAt: null");
  });
});
