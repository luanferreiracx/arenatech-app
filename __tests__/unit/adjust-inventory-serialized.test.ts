import { describe, it, expect, vi } from "vitest";
import { adjustInventory } from "@/server/services/stock-item.service";

/**
 * Regressao: adjustInventory setava product.currentStock direto, sem checar
 * isSerialized. Para serializados o saldo deriva de count(StockItem AVAILABLE),
 * entao um ajuste por quantidade corromperia o saldo exibido. Deve recusar.
 */
function makeTx(product: { id: string; name: string; isSerialized: boolean; currentStock: number }) {
  return {
    product: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(product),
      update: vi.fn().mockResolvedValue(product),
    },
    stockMovement: { create: vi.fn().mockResolvedValue({}) },
  };
}

describe("adjustInventory — protecao de serializados", () => {
  it("recusa ajuste por quantidade em produto serializado", async () => {
    const tx = makeTx({ id: "p1", name: "iPhone 14", isSerialized: true, currentStock: 0 });
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await adjustInventory(tx as any, "tenant-1", "user-1", {
      productId: "p3",
      newQuantity: 7,
      reason: "Sem mudanca",
    });
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });
});
