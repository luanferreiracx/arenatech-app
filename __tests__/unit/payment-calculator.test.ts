import { describe, it, expect } from "vitest";
import { Prisma, type PaymentMethod, type PaymentMethodRate } from "@prisma/client";
import { calculatePayment } from "@/lib/services/payment-calculator";

// Mocks mínimos (cast) — o teste exercita o comportamento puro da calculadora,
// que define taxa/acréscimo/líquido em TODA venda do PDV.
function makeMethod(
  overrides: Partial<PaymentMethod> & { rates?: PaymentMethodRate[] } = {},
): PaymentMethod & { rates?: PaymentMethodRate[] } {
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PaymentMethod & { rates?: PaymentMethodRate[] };
}

function makeRate(overrides: Partial<PaymentMethodRate> = {}): PaymentMethodRate {
  return {
    id: "r1",
    tenantId: "t1",
    paymentMethodId: "m1",
    installments: 1,
    appliesTo: "AMBOS",
    policy: "LOJA_ABSORVE",
    feePercent: new Prisma.Decimal(0),
    feeFixed: new Prisma.Decimal(0),
    settlementDays: 30,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PaymentMethodRate;
}

describe("calculatePayment", () => {
  describe("LOJA_ABSORVE (loja absorve a taxa)", () => {
    it("deduz a taxa do recebido; cliente paga só a mercadoria", () => {
      const method = makeMethod({
        rates: [makeRate({ feePercent: new Prisma.Decimal(10), policy: "LOJA_ABSORVE" })],
      });
      const r = calculatePayment({ method, installments: 1, valorMercadoria: 10_000, appliesTo: "AMBOS" });
      expect(r.error).toBeNull();
      expect(r.totalPaid).toBe(10_000); // cliente paga a mercadoria
      expect(r.operatorFee).toBe(1_000); // 10% de 10000
      expect(r.netRevenue).toBe(9_000); // mercadoria - taxa
      expect(r.surcharge).toBe(0);
    });

    it("soma a taxa fixa (em reais) à taxa percentual", () => {
      const method = makeMethod({
        rates: [makeRate({ feePercent: new Prisma.Decimal(2), feeFixed: new Prisma.Decimal(0.5) })],
      });
      const r = calculatePayment({ method, installments: 1, valorMercadoria: 10_000, appliesTo: "AMBOS" });
      expect(r.operatorFee).toBe(200 + 50); // 2% de 10000 + R$0,50
      expect(r.netRevenue).toBe(10_000 - 250);
    });

    it("registra surcharge quando o operador informa total pago maior que a mercadoria", () => {
      const method = makeMethod({
        rates: [makeRate({ feePercent: new Prisma.Decimal(10), policy: "LOJA_ABSORVE" })],
      });
      const r = calculatePayment({
        method, installments: 1, valorMercadoria: 10_000, appliesTo: "AMBOS", totalPaidManual: 10_500,
      });
      expect(r.totalPaid).toBe(10_500);
      expect(r.surcharge).toBe(500);
    });
  });

  describe("CLIENTE_PAGA (gross-up)", () => {
    it("calcula o bruto via gross-up: cliente paga o acréscimo, loja recebe a mercadoria", () => {
      const method = makeMethod({
        rates: [makeRate({ feePercent: new Prisma.Decimal(10), policy: "CLIENTE_PAGA" })],
      });
      const r = calculatePayment({ method, installments: 1, valorMercadoria: 10_000, appliesTo: "AMBOS" });
      // bruto = (10000 + 0) * 100 / (100 - 10) = 1_000_000 / 90 = 11111.11 -> 11111
      expect(r.totalPaid).toBe(11_111);
      expect(r.surcharge).toBe(1_111);
      expect(r.operatorFee).toBe(1_111); // operadora fica com o acréscimo
      expect(r.netRevenue).toBe(10_000); // loja recebe a mercadoria cheia
    });

    it("usa o total manual direto quando >= mercadoria", () => {
      const method = makeMethod({
        rates: [makeRate({ feePercent: new Prisma.Decimal(10), policy: "CLIENTE_PAGA" })],
      });
      const r = calculatePayment({
        method, installments: 1, valorMercadoria: 10_000, appliesTo: "AMBOS", totalPaidManual: 11_000,
      });
      expect(r.totalPaid).toBe(11_000);
      expect(r.surcharge).toBe(1_000);
      expect(r.netRevenue).toBe(10_000);
    });

    it("erra quando a taxa percentual >= 100 (gross-up impossível)", () => {
      const method = makeMethod({
        rates: [makeRate({ feePercent: new Prisma.Decimal(100), policy: "CLIENTE_PAGA" })],
      });
      const r = calculatePayment({ method, installments: 1, valorMercadoria: 10_000, appliesTo: "AMBOS" });
      expect(r.error).toMatch(/gross-up/i);
    });
  });

  describe("resolução de rate (fallback)", () => {
    it("prefere o rate exato (installments + appliesTo) sobre AMBOS", () => {
      const method = makeMethod({
        rates: [
          makeRate({ installments: 1, appliesTo: "AMBOS", feePercent: new Prisma.Decimal(5) }),
          makeRate({ id: "r2", installments: 1, appliesTo: "APARELHO", feePercent: new Prisma.Decimal(3) }),
        ],
      });
      const r = calculatePayment({ method, installments: 1, valorMercadoria: 10_000, appliesTo: "APARELHO" });
      expect(r.operatorFee).toBe(300); // 3% (rate APARELHO), não 5% (AMBOS)
    });

    it("cai para o feePercent do método quando não há rate para as parcelas", () => {
      const method = makeMethod({
        feePercent: new Prisma.Decimal(4),
        rates: [makeRate({ installments: 2, feePercent: new Prisma.Decimal(9) })],
      });
      const r = calculatePayment({ method, installments: 1, valorMercadoria: 10_000, appliesTo: "AMBOS" });
      expect(r.operatorFee).toBe(400); // 4% do método (não há rate p/ 1x)
    });
  });

  describe("validações de borda", () => {
    it("rejeita valor de mercadoria negativo", () => {
      const r = calculatePayment({ method: makeMethod(), installments: 1, valorMercadoria: -1, appliesTo: "AMBOS" });
      expect(r.error).toMatch(/negativo/i);
    });

    it("rejeita parcelas < 1", () => {
      const r = calculatePayment({ method: makeMethod(), installments: 0, valorMercadoria: 10_000, appliesTo: "AMBOS" });
      expect(r.error).toMatch(/Parcelas/i);
    });

    it("rejeita parcelamento quando o método não aceita", () => {
      const method = makeMethod({ acceptsInstallments: false, installmentsMax: 1 });
      const r = calculatePayment({ method, installments: 2, valorMercadoria: 10_000, appliesTo: "AMBOS" });
      expect(r.error).toMatch(/nao aceita parcelamento/i);
    });

    it("rejeita acima do máximo de parcelas", () => {
      const method = makeMethod({ installmentsMax: 6 });
      const r = calculatePayment({ method, installments: 7, valorMercadoria: 10_000, appliesTo: "AMBOS" });
      expect(r.error).toMatch(/no maximo 6x/i);
    });

    it("rejeita taxa negativa (dado migrado inválido)", () => {
      const method = makeMethod({ rates: [makeRate({ feePercent: new Prisma.Decimal(-1) })] });
      const r = calculatePayment({ method, installments: 1, valorMercadoria: 10_000, appliesTo: "AMBOS" });
      expect(r.error).toMatch(/negativo/i);
    });
  });

  it("calcula o valor da parcela = totalPaid / parcelas", () => {
    const method = makeMethod({ rates: [makeRate({ installments: 3, feePercent: new Prisma.Decimal(0) })] });
    const r = calculatePayment({ method, installments: 3, valorMercadoria: 9_000, appliesTo: "AMBOS" });
    expect(r.installmentValue).toBe(3_000);
  });
});
