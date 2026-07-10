import { describe, it, expect, vi } from "vitest";
import { adjustInventory } from "@/server/services/stock-item.service";

/**
 * Regressao: adjustInventory setava product.currentStock direto, sem checar
 * isSerialized. Para serializados o saldo deriva de count(StockItem AVAILABLE),
 * entao um ajuste por quantidade corromperia o saldo exibido. Deve recusar.
 */
function makeTx(
  product: {
    id: string;
    name: string;
    isSerialized: boolean;
    currentStock: number;
    hasVariations?: boolean;
  },
  variation?: { id: string; productId: string; currentStock: number },
) {
  return {
    product: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(product),
      update: vi.fn().mockResolvedValue(product),
    },
    productVariation: {
      findFirst: vi.fn().mockResolvedValue(variation ?? null),
      update: vi.fn().mockResolvedValue(variation ?? {}),
    },
    stockMovement: { create: vi.fn().mockResolvedValue({}) },
    // S1: lock FOR UPDATE relê o saldo fresco. No unit (sem concorrência) o
    // fresco == o do objeto; a query de variação bate na tabela product_variations.
    $queryRaw: vi.fn((strings: TemplateStringsArray) => {
      const sql = strings.join("");
      if (sql.includes("product_variations")) {
        return Promise.resolve([{ current_stock: variation?.currentStock ?? 0 }]);
      }
      return Promise.resolve([{ current_stock: product.currentStock }]);
    }),
  };
}

describe("adjustInventory — protecao de serializados", () => {
  it("recusa ajuste por quantidade em produto serializado", async () => {
    const tx = makeTx({ id: "p1", name: "iPhone 14", isSerialized: true, currentStock: 0 });
    await expect(
      adjustInventory(tx as any, "tenant-1", "user-1", {
        productId: "p1",
        newQuantity: 5,
        reason: "Contagem",
      }),
    ).rejects.toThrow(/serializado/i);
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it("ajusta normalmente produto nao serializado", async () => {
    const tx = makeTx({ id: "p2", name: "Capa", isSerialized: false, currentStock: 3 });
    await adjustInventory(tx as any, "tenant-1", "user-1", {
      productId: "p2",
      newQuantity: 10,
      reason: "Reposicao",
    });
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: "p2" },
      data: { currentStock: 10 },
    });
    expect(tx.stockMovement.create).toHaveBeenCalled();
  });

  it("nao cria movimento quando nao ha mudanca de saldo", async () => {
    const tx = makeTx({ id: "p3", name: "Cabo", isSerialized: false, currentStock: 7 });
    await adjustInventory(tx as any, "tenant-1", "user-1", {
      productId: "p3",
      newQuantity: 7,
      reason: "Sem mudanca",
    });
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });
});

/**
 * Regressao: o ajuste em massa nao funcionava para produtos com variacoes.
 * adjustInventory setava product.currentStock, mas o saldo real de um produto
 * com variacoes vive em ProductVariation.currentStock (o do pai eh a soma
 * derivada). Agora exige variationId e ajusta a variacao.
 */
describe("adjustInventory — produtos com variacoes", () => {
  it("exige variationId quando o produto tem variacoes", async () => {
    const tx = makeTx({
      id: "pv",
      name: "iPhone 15",
      isSerialized: false,
      currentStock: 30,
      hasVariations: true,
    });
    await expect(
      adjustInventory(tx as any, "tenant-1", "user-1", {
        productId: "pv",
        newQuantity: 15,
        reason: "Contagem",
      }),
    ).rejects.toThrow(/variac/i);
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.productVariation.update).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it("recusa variacao que nao pertence ao produto", async () => {
    const tx = makeTx(
      { id: "pv", name: "iPhone 15", isSerialized: false, currentStock: 30, hasVariations: true },
      { id: "v1", productId: "OUTRO", currentStock: 12 },
    );
    await expect(
      adjustInventory(tx as any, "tenant-1", "user-1", {
        productId: "pv",
        variationId: "v1",
        newQuantity: 5,
        reason: "Ajuste",
      }),
    ).rejects.toThrow(/nao pertence/i);
    expect(tx.productVariation.update).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it("ajusta a variacao (nao o pai) e registra o movimento com variationId", async () => {
    const tx = makeTx(
      { id: "pv", name: "iPhone 15", isSerialized: false, currentStock: 30, hasVariations: true },
      { id: "v1", productId: "pv", currentStock: 12 },
    );
    await adjustInventory(tx as any, "tenant-1", "user-1", {
      productId: "pv",
      variationId: "v1",
      newQuantity: 15,
      reason: "Contagem fisica",
    });
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.productVariation.update).toHaveBeenCalledWith({
      where: { id: "v1" },
      data: { currentStock: 15 },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: "pv",
          variationId: "v1",
          type: "ADJUSTMENT",
          quantity: 3,
          quantityBefore: 12,
          quantityAfter: 15,
        }),
      }),
    );
  });

  it("nao cria movimento quando o saldo da variacao nao muda", async () => {
    const tx = makeTx(
      { id: "pv", name: "iPhone 15", isSerialized: false, currentStock: 30, hasVariations: true },
      { id: "v1", productId: "pv", currentStock: 8 },
    );
    await adjustInventory(tx as any, "tenant-1", "user-1", {
      productId: "pv",
      variationId: "v1",
      newQuantity: 8,
      reason: "Sem mudanca",
    });
    expect(tx.productVariation.update).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });
});
