import { describe, it, expect, vi } from "vitest";
import { getAvailableQuantity } from "@/server/services/product.service";

/**
 * Regressao: getAvailableQuantity so tratava serializado x simples (ignorava
 * produtos com variacoes, retornando o currentStock cru do pai) e engolia erro
 * de banco como "0" (catch vazio), mascarando falhas. Agora delega para
 * resolveCurrentStockByProduct — fonte unica que cobre os tres tipos.
 */
function makeTx(opts: {
  product: {
    id: string;
    isSerialized: boolean;
    hasVariations: boolean;
    currentStock: number;
  } | null;
  stockItemCount?: number;
  variationSum?: number | null;
}) {
  return {
    product: {
      findUnique: vi.fn().mockResolvedValue(opts.product),
    },
    stockItem: {
      groupBy: vi.fn().mockResolvedValue(
        opts.product?.isSerialized
          ? [{ productId: opts.product.id, _count: { _all: opts.stockItemCount ?? 0 } }]
          : [],
      ),
    },
    productVariation: {
      groupBy: vi.fn().mockResolvedValue(
        opts.product?.hasVariations
          ? [{ productId: opts.product.id, _sum: { currentStock: opts.variationSum ?? 0 } }]
          : [],
      ),
    },
  };
}

describe("getAvailableQuantity", () => {
  it("retorna 0 quando o produto nao existe", async () => {
    const tx = makeTx({ product: null });
    expect(await getAvailableQuantity(tx as any, "t1", "missing")).toBe(0);
  });

  it("produto simples: retorna o currentStock do proprio produto", async () => {
    const tx = makeTx({
      product: { id: "p1", isSerialized: false, hasVariations: false, currentStock: 7 },
    });
    expect(await getAvailableQuantity(tx as any, "t1", "p1")).toBe(7);
  });

  it("serializado: conta StockItems AVAILABLE (nao o currentStock do pai)", async () => {
    const tx = makeTx({
      product: { id: "p2", isSerialized: true, hasVariations: false, currentStock: 999 },
      stockItemCount: 3,
    });
    expect(await getAvailableQuantity(tx as any, "t1", "p2")).toBe(3);
  });

  it("com variacoes: soma o estoque das variacoes (bug antigo ignorava)", async () => {
    const tx = makeTx({
      product: { id: "p3", isSerialized: false, hasVariations: true, currentStock: 0 },
      variationSum: 12,
    });
    expect(await getAvailableQuantity(tx as any, "t1", "p3")).toBe(12);
  });

  it("propaga erro de banco em vez de engolir como 0", async () => {
    const tx = makeTx({
      product: { id: "p4", isSerialized: true, hasVariations: false, currentStock: 0 },
    });
    tx.stockItem.groupBy = vi.fn().mockRejectedValue(new Error("db down"));
    await expect(getAvailableQuantity(tx as any, "t1", "p4")).rejects.toThrow(/db down/);
  });
});
