import { describe, it, expect, vi } from "vitest";
import { releaseStaleReservations } from "@/server/services/stock-item.service";

/**
 * Cron de auto-release: libera StockItems RESERVED presos (carrinho PDV
 * abandonado sem finalizar/abandonar). Libera reserva orfa ou de venda ainda
 * em DRAFT; NÃO libera reserva de venda que nao seja DRAFT (seguranca).
 */
function makeTx(opts: {
  stale: Array<{ id: string; reservedForId: string | null }>;
  draftSaleIds: string[];
}) {
  return {
    stockItem: {
      findMany: vi.fn().mockResolvedValue(opts.stale),
      updateMany: vi.fn().mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve({ count: where.id.in.length }),
      ),
    },
    sale: {
      findMany: vi.fn().mockResolvedValue(opts.draftSaleIds.map((id) => ({ id }))),
    },
  };
}

describe("releaseStaleReservations", () => {
  it("nao faz nada quando nao ha reservas antigas", async () => {
    const tx = makeTx({ stale: [], draftSaleIds: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await releaseStaleReservations(tx as any);
    expect(r.releasedCount).toBe(0);
    expect(tx.stockItem.updateMany).not.toHaveBeenCalled();
  });

  it("libera reserva de venda ainda em DRAFT", async () => {
    const tx = makeTx({
      stale: [{ id: "si-1", reservedForId: "sale-draft" }],
      draftSaleIds: ["sale-draft"],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await releaseStaleReservations(tx as any);
    expect(r.releasedCount).toBe(1);
    expect(tx.stockItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "AVAILABLE", reservedForId: null }),
      }),
    );
  });

  it("libera reserva orfa (sem venda de origem)", async () => {
    const tx = makeTx({
      stale: [{ id: "si-2", reservedForId: null }],
      draftSaleIds: [],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await releaseStaleReservations(tx as any);
    expect(r.releasedCount).toBe(1);
  });

  it("NAO libera reserva de venda que nao esta em DRAFT", async () => {
    // sale-finalized nao retornou em findMany (status != DRAFT) -> nao libera.
    const tx = makeTx({
      stale: [{ id: "si-3", reservedForId: "sale-finalized" }],
      draftSaleIds: [],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await releaseStaleReservations(tx as any);
    expect(r.releasedCount).toBe(0);
    expect(tx.stockItem.updateMany).not.toHaveBeenCalled();
  });

  it("usa o cutoff de tempo na busca (reservedAt < agora - staleMinutes)", async () => {
    const tx = makeTx({ stale: [], draftSaleIds: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await releaseStaleReservations(tx as any, 30);
    const where = tx.stockItem.findMany.mock.calls[0]![0].where;
    expect(where.status).toBe("RESERVED");
    expect(where.reservedForType).toBe("sale");
    expect(where.reservedAt.lt).toBeInstanceOf(Date);
  });
});
