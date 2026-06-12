import { describe, it, expect, vi } from "vitest";
import { disposeStockItem } from "@/server/services/stock-item.service";
import { disposeStockItemSchema } from "@/lib/validators/stock-item";
import { randomUUID } from "node:crypto";

/**
 * Baixa/descarte de unidade serializada: soft delete + movimento EXIT.
 * So permite itens ainda no estoque (AVAILABLE/DEFECTIVE/BLOCKED/RETURNED).
 * SOLD/RESERVED tem fluxo proprio e nao podem ser descartados direto.
 */
function makeTx(item: { id: string; status: string; deletedAt: Date | null; productId?: string; variationId?: string | null }) {
  const full = { productId: "prod-1", variationId: null, ...item };
  return {
    stockItem: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(full),
      update: vi.fn().mockResolvedValue(full),
    },
    stockMovement: { create: vi.fn().mockResolvedValue({}) },
  };
}

describe("disposeStockItemSchema", () => {
  it("exige motivo com pelo menos 3 caracteres", () => {
    expect(disposeStockItemSchema.safeParse({ stockItemId: randomUUID(), reason: "" }).success).toBe(false);
    expect(disposeStockItemSchema.safeParse({ stockItemId: randomUUID(), reason: "ok" }).success).toBe(false);
    expect(disposeStockItemSchema.safeParse({ stockItemId: randomUUID(), reason: "Perda total" }).success).toBe(true);
  });
});

describe("disposeStockItem — protecao por status", () => {
  it("descarta item AVAILABLE (soft delete + movimento EXIT)", async () => {
    const tx = makeTx({ id: "s1", status: "AVAILABLE", deletedAt: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await disposeStockItem(tx as any, "tenant-1", "user-1", { stockItemId: "s1", reason: "Perda total" });
    expect(tx.stockItem.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: expect.objectContaining({ deletedAt: expect.any(Date) }),
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "EXIT", referenceType: "dispose" }) }),
    );
  });

  it("descarta item DEFECTIVE", async () => {
    const tx = makeTx({ id: "s2", status: "DEFECTIVE", deletedAt: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await disposeStockItem(tx as any, "tenant-1", "user-1", { stockItemId: "s2", reason: "Inutilizado" });
    expect(tx.stockItem.update).toHaveBeenCalled();
  });

  it("recusa descarte de item VENDIDO (estorno e o caminho)", async () => {
    const tx = makeTx({ id: "s3", status: "SOLD", deletedAt: null });
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      disposeStockItem(tx as any, "tenant-1", "user-1", { stockItemId: "s3", reason: "x y z" }),
    ).rejects.toThrow(/vendido|estorno/i);
    expect(tx.stockItem.update).not.toHaveBeenCalled();
  });

  it("recusa descarte de item RESERVADO", async () => {
    const tx = makeTx({ id: "s4", status: "RESERVED", deletedAt: null });
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      disposeStockItem(tx as any, "tenant-1", "user-1", { stockItemId: "s4", reason: "x y z" }),
    ).rejects.toThrow(/reservad/i);
  });

  it("e idempotente: recusa item ja baixado", async () => {
    const tx = makeTx({ id: "s5", status: "DEFECTIVE", deletedAt: new Date() });
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      disposeStockItem(tx as any, "tenant-1", "user-1", { stockItemId: "s5", reason: "x y z" }),
    ).rejects.toThrow(/ja foi baixad/i);
  });
});
