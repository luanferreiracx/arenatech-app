import { describe, it, expect, vi } from "vitest"
import { resolveCurrentStockByProduct } from "@/server/services/stock-item.service"

/**
 * Fonte única do estoque efetivo por produto. Antes reimplementada inline em
 * stock.list / stock.getById / stockDashboard com filtros divergentes (list e
 * getById esqueciam active:true nas variações), então o mesmo produto mostrava
 * estoque diferente entre a listagem e os relatórios.
 */
function makeTx(opts: {
  serialized?: Array<{ productId: string; _count: { _all: number } }>
  variations?: Array<{ productId: string; _sum: { currentStock: number | null } }>
}) {
  return {
    stockItem: {
      groupBy: vi.fn().mockResolvedValue(opts.serialized ?? []),
    },
    productVariation: {
      groupBy: vi.fn().mockResolvedValue(opts.variations ?? []),
    },
  }
}

describe("resolveCurrentStockByProduct", () => {
  it("lista vazia → mapa vazio, sem query", async () => {
    const tx = makeTx({})
    const r = await resolveCurrentStockByProduct(tx as never, [])
    expect(r.size).toBe(0)
    expect(tx.stockItem.groupBy).not.toHaveBeenCalled()
    expect(tx.productVariation.groupBy).not.toHaveBeenCalled()
  })

  it("serializado = count de StockItem AVAILABLE", async () => {
    const tx = makeTx({ serialized: [{ productId: "p1", _count: { _all: 7 } }] })
    const r = await resolveCurrentStockByProduct(tx as never, [
      { id: "p1", currentStock: 999, hasVariations: false, isSerialized: true },
    ])
    expect(r.get("p1")).toBe(7) // usa o count, ignora currentStock do produto
  })

  it("com variações = SUM das variações", async () => {
    const tx = makeTx({ variations: [{ productId: "p2", _sum: { currentStock: 12 } }] })
    const r = await resolveCurrentStockByProduct(tx as never, [
      { id: "p2", currentStock: 999, hasVariations: true, isSerialized: false },
    ])
    expect(r.get("p2")).toBe(12)
  })

  it("filtra variações por active:true e deletedAt:null (a regra que divergia)", async () => {
    const tx = makeTx({ variations: [{ productId: "p2", _sum: { currentStock: 5 } }] })
    await resolveCurrentStockByProduct(tx as never, [
      { id: "p2", currentStock: 0, hasVariations: true, isSerialized: false },
    ])
    expect(tx.productVariation.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null, active: true }),
      }),
    )
  })

  it("simples = products.currentStock (sem query)", async () => {
    const tx = makeTx({})
    const r = await resolveCurrentStockByProduct(tx as never, [
      { id: "p3", currentStock: 42, hasVariations: false, isSerialized: false },
    ])
    expect(r.get("p3")).toBe(42)
    expect(tx.stockItem.groupBy).not.toHaveBeenCalled()
    expect(tx.productVariation.groupBy).not.toHaveBeenCalled()
  })

  it("produto sem match nas agregações → 0", async () => {
    const tx = makeTx({ serialized: [], variations: [] })
    const r = await resolveCurrentStockByProduct(tx as never, [
      { id: "p1", currentStock: 0, hasVariations: false, isSerialized: true },
      { id: "p2", currentStock: 0, hasVariations: true, isSerialized: false },
    ])
    expect(r.get("p1")).toBe(0)
    expect(r.get("p2")).toBe(0)
  })

  it("mix dos três tipos numa chamada só", async () => {
    const tx = makeTx({
      serialized: [{ productId: "s", _count: { _all: 3 } }],
      variations: [{ productId: "v", _sum: { currentStock: 8 } }],
    })
    const r = await resolveCurrentStockByProduct(tx as never, [
      { id: "s", currentStock: 0, hasVariations: false, isSerialized: true },
      { id: "v", currentStock: 0, hasVariations: true, isSerialized: false },
      { id: "n", currentStock: 15, hasVariations: false, isSerialized: false },
    ])
    expect(r.get("s")).toBe(3)
    expect(r.get("v")).toBe(8)
    expect(r.get("n")).toBe(15)
  })
})
