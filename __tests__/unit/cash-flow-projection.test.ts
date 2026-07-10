/**
 * Projeção de fluxo de caixa — dedup de cartão (auditoria PDV R4, Fase 1).
 * O dinheiro de cartão entra SÓ pelo CardReceivable (D+N real); parcelas de
 * vendas com CardReceivable são puladas para não contar 2×.
 */
import { describe, it, expect } from "vitest";
import { buildProjectedCashFlow } from "@/server/services/cash-flow-projection";

const d = (s: string) => new Date(`${s}T12:00:00Z`);

describe("buildProjectedCashFlow", () => {
  it("não-cartão: parcela + recebível de cartão de vendas DIFERENTES somam ambos", () => {
    const r = buildProjectedCashFlow(
      [{ dueDate: d("2026-07-10"), remainingCents: 5000, type: "RECEIVABLE", saleId: "venda-pix", isCardMethod: false }],
      [{ expectedSettlementDate: d("2026-07-10"), netCents: 3000 }],
      new Set(["venda-cartao"]), // a venda da parcela NÃO é cartão
    );
    expect(r.summary.totalReceivable).toBe(8000); // 5000 (pix) + 3000 (cartão)
  });

  it("BUG do R4: venda no cartão parcelado NÃO conta 2× — só o CardReceivable", () => {
    // Mesma venda: 1 parcela de MÉTODO cartão (FT legada) E 1 CardReceivable.
    const saleId = "venda-cartao-3x";
    const r = buildProjectedCashFlow(
      [{ dueDate: d("2026-08-10"), remainingCents: 10000, type: "RECEIVABLE", saleId, isCardMethod: true }],
      [{ expectedSettlementDate: d("2026-07-11"), netCents: 9700 }], // líquido D+N
      new Set([saleId]), // é venda de cartão → pula a parcela de cartão
    );
    // Só o CardReceivable (9700), NÃO 10000+9700.
    expect(r.summary.totalReceivable).toBe(9700);
  });

  it("D1: venda MISTA (crediário + cartão) NÃO derruba a parcela de crediário", () => {
    // A venda tem CardReceivable (perna cartão) E uma parcela de crediário
    // (isCardMethod=false). O crediário é dinheiro legítimo sem representação em
    // cartão — deve entrar; só a perna cartão vem pelo CardReceivable.
    const saleId = "venda-mista";
    const r = buildProjectedCashFlow(
      [{ dueDate: d("2026-08-10"), remainingCents: 5000, type: "RECEIVABLE", saleId, isCardMethod: false }],
      [{ expectedSettlementDate: d("2026-07-11"), netCents: 4900 }], // líquido da perna cartão
      new Set([saleId]), // a venda tem CardReceivable...
    );
    // ...mas a parcela de crediário (não-cartão) NÃO é pulada: 5000 + 4900.
    expect(r.summary.totalReceivable).toBe(9900);
  });

  it("payable (parcela a pagar) entra no lado certo e não é afetado pelo cartão", () => {
    const r = buildProjectedCashFlow(
      [{ dueDate: d("2026-07-10"), remainingCents: 2000, type: "PAYABLE", saleId: null, isCardMethod: false }],
      [{ expectedSettlementDate: d("2026-07-10"), netCents: 1000 }],
      new Set(),
    );
    expect(r.summary.totalReceivable).toBe(1000);
    expect(r.summary.totalPayable).toBe(2000);
    expect(r.summary.projectedBalance).toBe(-1000);
  });

  it("saldo acumulado respeita a ordem cronológica", () => {
    const r = buildProjectedCashFlow(
      [
        { dueDate: d("2026-07-12"), remainingCents: 3000, type: "RECEIVABLE", saleId: null, isCardMethod: false },
        { dueDate: d("2026-07-10"), remainingCents: 1000, type: "RECEIVABLE", saleId: null, isCardMethod: false },
      ],
      [],
      new Set(),
    );
    expect(r.projection.map((p) => p.date)).toEqual(["2026-07-10", "2026-07-12"]);
    expect(r.projection[0]!.cumulativeBalance).toBe(1000);
    expect(r.projection[1]!.cumulativeBalance).toBe(4000);
  });

  it("parcela sem saleId (ex.: conta manual) nunca é confundida com cartão", () => {
    const r = buildProjectedCashFlow(
      [{ dueDate: d("2026-07-10"), remainingCents: 5000, type: "RECEIVABLE", saleId: null, isCardMethod: false }],
      [],
      new Set(["qualquer"]),
    );
    expect(r.summary.totalReceivable).toBe(5000);
  });
});
