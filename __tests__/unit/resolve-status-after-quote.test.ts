import { describe, it, expect } from "vitest";
import { statusAfterQuote, lastRealOriginWhere, WAITING_APPROVAL } from "@/lib/services/quote-status";

/**
 * Regressao (OS202600260): revisoes de orcamento encadeadas geravam history
 * WAITING_APPROVAL -> WAITING_APPROVAL. A restauracao usava o ultimo registro e
 * devolvia WAITING_APPROVAL, prendendo a OS num loop. A correcao ignora esses
 * registros (lastRealOriginWhere) e usa o ultimo status REAL de origem.
 */
describe("lastRealOriginWhere", () => {
  it("exclui registros cujo previousStatus e WAITING_APPROVAL", () => {
    const where = lastRealOriginWhere("os-1");
    expect(where.orderId).toBe("os-1");
    expect(where.newStatus).toBe(WAITING_APPROVAL);
    expect(where.previousStatus).toEqual({ not: WAITING_APPROVAL });
  });
});

describe("statusAfterQuote", () => {
  it("restaura o status real de origem na aprovacao (ex: COMPLETED)", () => {
    expect(statusAfterQuote("COMPLETED", "approve")).toBe("COMPLETED");
    expect(statusAfterQuote("IN_PROGRESS", "approve")).toBe("IN_PROGRESS");
  });

  it("nunca devolve WAITING_APPROVAL (cai no fallback)", () => {
    expect(statusAfterQuote(WAITING_APPROVAL, "approve")).toBe("APPROVED");
    expect(statusAfterQuote(WAITING_APPROVAL, "reject")).toBe("IN_DIAGNOSIS");
  });

  it("fallback por acao quando nao ha origem real", () => {
    expect(statusAfterQuote(null, "approve")).toBe("APPROVED");
    expect(statusAfterQuote(null, "reject")).toBe("IN_DIAGNOSIS");
  });
});
