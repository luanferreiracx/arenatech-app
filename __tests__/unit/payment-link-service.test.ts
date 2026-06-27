/**
 * expireStalePaymentLinks: ACTIVE com expiresAt no passado -> EXPIRED. Banco
 * mockado; valida o filtro (status ACTIVE + vencidos) e o retorno.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const updateMany = vi.fn();
const tx = { paymentLink: { updateMany } };

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (t: typeof tx) => unknown) => fn(tx),
}));

import { expireStalePaymentLinks, PAYMENT_LINK_TTL_MS } from "@/server/services/payment-link.service";

beforeEach(() => {
  updateMany.mockReset();
});

describe("expireStalePaymentLinks", () => {
  it("TTL e de 12 horas", () => {
    expect(PAYMENT_LINK_TTL_MS).toBe(12 * 60 * 60 * 1000);
  });

  it("expira somente ACTIVE vencidos e retorna a contagem", async () => {
    updateMany.mockResolvedValue({ count: 3 });
    const res = await expireStalePaymentLinks();
    expect(res.expired).toBe(3);
    const arg = updateMany.mock.calls[0]![0] as {
      where: { status: string; expiresAt: { lt: Date } };
      data: { status: string };
    };
    expect(arg.where.status).toBe("ACTIVE");
    expect(arg.where.expiresAt.lt).toBeInstanceOf(Date);
    expect(arg.data.status).toBe("EXPIRED");
  });

  it("nada vencido -> count 0", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const res = await expireStalePaymentLinks();
    expect(res.expired).toBe(0);
  });
});
