import { describe, it, expect } from "vitest";
import { Prisma, type PaymentMethod } from "@prisma/client";
import { calculatePayment, calculatePaymentByMethodId } from "@/lib/services/payment-calculator";
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
  // Quem paga a taxa = decidido na venda (pelo valor que o cliente pagou),
  // nao por configuracao. Sem valor informado (ou == mercadoria) => loja
  // absorve. Maior que a mercadoria => cliente pagou o acrescimo.
  describe("loja absorve (operador nao informa acrescimo)", () => {
    it("deduz a taxa do recebido; cliente paga so a mercadoria", () => {
      const method = makeMethod();
      const r = calculatePayment({
        method, installments: 1, valorMercadoria: 10_000, cardRate: rate(10), saleDate: SALE_DATE,
      });
      expect(r.error).toBeNull();
      expect(r.totalPaid).toBe(10_000);
      expect(r.operatorFee).toBe(1_000); // 10% de 10000
      expect(r.netRevenue).toBe(9_000);
      expect(r.surcharge).toBe(0);
      expect(r.policy).toBe("LOJA_ABSORVE"); // derivado
    });

    it("soma a taxa fixa (centavos) a taxa percentual em 1x", () => {
      const method = makeMethod();
      const r = calculatePayment({
        method, installments: 1, valorMercadoria: 10_000, cardRate: rate(2, 50), saleDate: SALE_DATE,
      });
      expect(r.operatorFee).toBe(200 + 50); // 2% de 10000 + R$0,50
      expect(r.netRevenue).toBe(10_000 - 250);
    });
  });

  describe("cliente paga (operador informa total > mercadoria)", () => {
    it("a taxa incide sobre o total com acrescimo; loja recebe o liquido desse total", () => {
      const method = makeMethod();
      const r = calculatePayment({
        method, installments: 1, valorMercadoria: 10_000, cardRate: rate(10),
        totalPaidManual: 11_000, saleDate: SALE_DATE,
      });
      expect(r.totalPaid).toBe(11_000);
      expect(r.surcharge).toBe(1_000);
      expect(r.operatorFee).toBe(1_100); // 10% de 11000
      expect(r.netRevenue).toBe(11_000 - 1_100);
      expect(r.policy).toBe("CLIENTE_PAGA"); // derivado do surcharge > 0
    });

    it("total informado igual a mercadoria = loja absorve (sem surcharge)", () => {
      const method = makeMethod();
      const r = calculatePayment({
        method, installments: 1, valorMercadoria: 10_000, cardRate: rate(10),
        totalPaidManual: 10_000, saleDate: SALE_DATE,
      });
      expect(r.surcharge).toBe(0);
      expect(r.policy).toBe("LOJA_ABSORVE");
      expect(r.netRevenue).toBe(9_000);
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
  // de "DRE = recebivel". Cobre {1x,12x} x {feeFixed 0,>0} x {loja absorve /
  // cliente paga (totalPaid > mercadoria)}.
  describe("paridade DRE = recebivel (operatorFee == Σ feeCents do split)", () => {
    const matrix: { installments: number; r: CardSettlementRate; clientePaga: boolean }[] = [];
    for (const installments of [1, 12]) {
      for (const feeFixed of [0, 99]) {
        for (const clientePaga of [false, true]) {
          matrix.push({ installments, r: rate(2.99, feeFixed), clientePaga });
        }
      }
    }

    it.each(matrix)(
      "%j: operatorFee == soma dos feeCents do recebivel",
      ({ installments, r: cardRate, clientePaga }) => {
        const method = makeMethod();
        const valorMercadoria = 100_000;
        // Cliente paga = operador informa um total maior que a mercadoria.
        const totalPaidManual = clientePaga ? 103_500 : undefined;
        const bd = calculatePayment({
          method, installments, valorMercadoria, cardRate, totalPaidManual, saleDate: SALE_DATE,
        });
        expect(bd.error).toBeNull();
        // O recebivel e gerado sobre o BRUTO que passou na maquininha (totalPaid).
        const expectedFee = splitCardReceivable(cardRate, bd.totalPaid, installments, SALE_DATE)
          .reduce((s, x) => s + x.feeCents, 0);
        expect(bd.operatorFee).toBe(expectedFee);
        expect(bd.netRevenue).toBe(bd.totalPaid - bd.operatorFee);
      },
    );
  });
});

describe("calculatePaymentByMethodId — R3 (cartao exige taxa cadastrada)", () => {
  function makeTx(rateRow: { feePercent: number; feeFixed: number; settlementDays: number } | null) {
    return {
      paymentMethod: { findUnique: async () => makeMethod() },
      acquirerRate: { findFirst: async () => rateRow },
    };
  }
  const card = { acquirerId: "a1", cardBrandId: "b1", cardKind: "CREDIT" as const };

  it("cartao COM adquirente mas SEM taxa cadastrada => erro explicito", async () => {
    const bd = await calculatePaymentByMethodId(makeTx(null), {
      paymentMethodId: "m1", installments: 3, valorMercadoria: 10_000, card, tenantId: "t1",
    });
    expect(bd.error).toMatch(/taxa cadastrada/i);
  });

  it("cartao com taxa cadastrada => sem erro", async () => {
    const bd = await calculatePaymentByMethodId(
      makeTx({ feePercent: 2, feeFixed: 0, settlementDays: 1 }),
      { paymentMethodId: "m1", installments: 3, valorMercadoria: 10_000, card, tenantId: "t1" },
    );
    expect(bd.error).toBeNull();
  });

  it("NAO-cartao (sem card) nao dispara o erro de taxa", async () => {
    const bd = await calculatePaymentByMethodId(makeTx(null), {
      paymentMethodId: "m1", installments: 1, valorMercadoria: 10_000, card: null, tenantId: "t1",
    });
    expect(bd.error).toBeNull();
  });
});
