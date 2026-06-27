/**
 * Regressão (auditoria 2026-06-26, P2-1): estorno com valor > 0 gera saída na
 * gaveta e EXIGE caixa aberto. Antes, sem caixa aberto a saída era silenciosamente
 * pulada (gaveta sub-reportada). Fonte única usada pelos guards de estorno de
 * venda (sale.refund) e de OS (serviceOrder.refund).
 */
import { describe, it, expect } from "vitest";
import { refundNeedsOpenCashSession } from "@/server/services/cash-session.service";

describe("refundNeedsOpenCashSession", () => {
  it("exige caixa aberto quando há valor a estornar", () => {
    expect(refundNeedsOpenCashSession(1)).toBe(true);
    expect(refundNeedsOpenCashSession(15_000)).toBe(true);
  });

  it("não exige caixa quando o valor é zero (nada sai da gaveta)", () => {
    expect(refundNeedsOpenCashSession(0)).toBe(false);
  });

  it("não exige caixa para valor negativo (defensivo)", () => {
    expect(refundNeedsOpenCashSession(-100)).toBe(false);
  });
});
