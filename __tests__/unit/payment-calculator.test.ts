import { describe, it, expect } from "vitest";
import { Prisma, type PaymentMethod } from "@prisma/client";
import { calculatePayment } from "@/lib/services/payment-calculator";
import {
  splitCardReceivable,
  type CardSettlementRate,
} from "@/server/services/card-receivable.service";

// A taxa do cartao vem da AcquirerRate (cardRate, em CENTAVOS) e e calculada com
// a MESMA matematica do recebivel (splitCardReceivable). A politica (loja-absorve
// / cliente-paga) vem de PaymentMethod.feePolicy.
function makeMethod(overrides: Partial<PaymentMethod> = {}): PaymentMethod {
  return {
    id: "m1",
    tenantId: "t1",
    code: "cartao",
    name: "Cartao",
    type: "CREDIT_CARD",
    feePercent: new Prisma.Decimal(0),
    feeFixed: new Prisma.Decimal(0),
    acceptsInstallments: true,
    installmentsMin: 1,
    installmentsMax: 12,
    settlementDays: 0,
    active: true,
    acceptsChange: false,
    feePolicy: "LOJA_ABSORVE",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PaymentMethod;
}

/** Taxa de adquirente em centavos (feeFixed em centavos). */
function rate(feePercent: number, feeFixed = 0, settlementDays = 30): CardSettlementRate {
  return { feePercent, feeFixed, settlementDays };
}

const SALE_DATE = new Date("2026-06-01T12:00:00Z");

describe("calculatePayment", () => {
  describe("LOJA_ABSORVE (loja absorve a taxa)", () => {
    it("deduz a taxa do recebido; cliente paga so a mercadoria", () => {
      const method = makeMethod({ feePolicy: "LOJA_ABSORVE" });
      const r = calculatePayment({
        method, installments: 1, valorMercadoria: 10_000, cardRate: rate(10), saleDate: SALE_DATE,
      });
      expect(r.error).toBeNull();
      expect(r.totalPaid).toBe(10_000);
      expect(r.operatorFee).toBe(1_000); // 10% de 10000
      expect(r.netRevenue).toBe(9_000);
      expect(r.surcharge).toBe(0);
    });

    it("soma a taxa fixa (centavos) a taxa percentual em 1x", () => {
      const method = makeMethod();
      const r = calculatePayment({
        method, installments: 1, valorMercadoria: 10_000, cardRate: rate(2, 50), saleDate: SALE_DATE,
      });
      expect(r.operatorFee).toBe(200 + 50); // 2% de 10000 + R$0,50
      expect(r.netRevenue).toBe(10_000 - 250);
    });

    it("registra surcharge quando o operador informa total pago maior que a mercadoria", () => {
      const method = makeMethod({ feePolicy: "LOJA_ABSORVE" });
      const r = calculatePayment({
        method, installments: 1, valorMercadoria: 10_000, cardRate: rate(10),
        totalPaidManual: 10_500, saleDate: SALE_DATE,
      });
      expect(r.totalPaid).toBe(10_500);
      expect(r.surcharge).toBe(500);
    });
  });

  describe("CLIENTE_PAGA (gross-up; taxa sobre o valor com acrescimo)", () => {
    it("calcula o bruto via gross-up e a taxa incide sobre o total com acrescimo", () => {
      const method = makeMethod({ feePolicy: "CLIENTE_PAGA" });
      const r = calculatePayment({
        method, installments: 1, valorMercadoria: 10_000, cardRate: rate(10), saleDate: SALE_DATE,
      });
      // bruto = 10000 * 100 / 90 = 11111. Taxa = 10% de 11111 = 1111.
      expect(r.totalPaid).toBe(11_111);
      expect(r.surcharge).toBe(1_111);
      expect(r.operatorFee).toBe(1_111);
      expect(r.netRevenue).toBe(11_111 - 1_111);
    });

    it("usa o total manual direto quando >= mercadoria", () => {
      const method = makeMethod({ feePolicy: "CLIENTE_PAGA" });
      const r = calculatePayment({
        method, installments: 1, valorMercadoria: 10_000, cardRate: rate(10),
        totalPaidManual: 11_000, saleDate: SALE_DATE,
      });
      expect(r.totalPaid).toBe(11_000);
      expect(r.surcharge).toBe(1_000);
      expect(r.operatorFee).toBe(1_100); // 10% de 11000
      expect(r.netRevenue).toBe(11_000 - 1_100);
    });

    it("erra quando a taxa percentual >= 100 (gross-up impossivel)", () => {
      const method = makeMethod({ feePolicy: "CLIENTE_PAGA" });
      const r = calculatePayment({
        method, installments: 1, valorMercadoria: 10_000, cardRate: rate(100), saleDate: SALE_DATE,
      });
      expect(r.error).toMatch(/gross-up/i);
    });
  });

  describe("fonte da taxa (AcquirerRate vs fallback do metodo)", () => {
    it("usa a AcquirerRate (cardRate) quando informada", () => {
      const method = makeMethod({ feePercent: new Prisma.Decimal(9) }); // base seria 9%
      const r = calculatePayment({
        method, installments: 1, valorMercadoria: 10_000, cardRate: rate(3), saleDate: SALE_DATE,
      });
      expect(r.operatorFee).toBe(300); // 3% da AcquirerRate, nao 9% do metodo
    });

    it("cai para o feePercent/feeFixed do metodo quando nao ha AcquirerRate (cardRate null)", () => {
      const method = makeMethod({
        feePercent: new Prisma.Decimal(4),
        feeFixed: new Prisma.Decimal(0.5),
      });
      const r = calculatePayment({
        method, installments: 1, valorMercadoria: 10_000, cardRate: null, saleDate: SALE_DATE,
      });
      expect(r.operatorFee).toBe(400 + 50); // 4% + R$0,50 base do metodo
    });
  });

  describe("validacoes de borda", () => {
    it("rejeita valor de mercadoria negativo", () => {
      const r = calculatePayment({
        method: makeMethod(), installments: 1, valorMercadoria: -1, cardRate: rate(0), saleDate: SALE_DATE,
      });
      expect(r.error).toMatch(/negativo/i);
    });

    it("rejeita parcelas < 1", () => {
      const r = calculatePayment({
        method: makeMethod(), installments: 0, valorMercadoria: 10_000, cardRate: rate(0), saleDate: SALE_DATE,
      });
      expect(r.error).toMatch(/Parcelas/i);
    });

    it("rejeita parcelamento quando o metodo nao aceita", () => {
      const method = makeMethod({ acceptsInstallments: false, installmentsMax: 1 });
      const r = calculatePayment({
        method, installments: 2, valorMercadoria: 10_000, cardRate: rate(0), saleDate: SALE_DATE,
      });
      expect(r.error).toMatch(/nao aceita parcelamento/i);
    });

    it("rejeita acima do maximo de parcelas", () => {
      const method = makeMethod({ installmentsMax: 6 });
      const r = calculatePayment({
        method, installments: 7, valorMercadoria: 10_000, cardRate: rate(0), saleDate: SALE_DATE,
      });
      expect(r.error).toMatch(/no maximo 6x/i);
    });

    it("rejeita taxa negativa", () => {
      const r = calculatePayment({
        method: makeMethod(), installments: 1, valorMercadoria: 10_000, cardRate: rate(-1), saleDate: SALE_DATE,
      });
      expect(r.error).toMatch(/negativo/i);
    });
  });

  it("calcula o valor da parcela = totalPaid / parcelas", () => {
    const method = makeMethod();
    const r = calculatePayment({
      method, installments: 3, valorMercadoria: 9_000, cardRate: rate(0), saleDate: SALE_DATE,
    });
    expect(r.installmentValue).toBe(3_000);
  });

  // ── TESTE-GUARDIAO: o operatorFee do breakdown deve bater, centavo a centavo,
  // com a soma dos feeCents dos recebiveis (splitCardReceivable). E a definicao
  // de "DRE = recebivel". Cobre a matriz {1x,12x} x {feeFixed 0,>0} x {politica}.
  describe("paridade DRE = recebivel (operatorFee == Σ feeCents do split)", () => {
    const matrix: { installments: number; r: CardSettlementRate; policy: "LOJA_ABSORVE" | "CLIENTE_PAGA" }[] = [];
    for (const installments of [1, 12]) {
      for (const feeFixed of [0, 99]) {
        for (const policy of ["LOJA_ABSORVE", "CLIENTE_PAGA"] as const) {
          matrix.push({ installments, r: rate(2.99, feeFixed), policy });
        }
      }
    }

    it.each(matrix)(
      "%j: operatorFee == soma dos feeCents do recebivel",
      ({ installments, r: cardRate, policy }) => {
        const method = makeMethod({ feePolicy: policy });
        const valorMercadoria = 100_000;
        const bd = calculatePayment({ method, installments, valorMercadoria, cardRate, saleDate: SALE_DATE });
        expect(bd.error).toBeNull();
        // O recebivel e gerado sobre o BRUTO que passou na maquininha (totalPaid).
        const expectedFee = splitCardReceivable(cardRate, bd.totalPaid, installments, SALE_DATE)
          .reduce((s, x) => s + x.feeCents, 0);
        expect(bd.operatorFee).toBe(expectedFee);
        // E o liquido bate: netRevenue = totalPaid - operatorFee.
        expect(bd.netRevenue).toBe(bd.totalPaid - bd.operatorFee);
      },
    );
  });
});
