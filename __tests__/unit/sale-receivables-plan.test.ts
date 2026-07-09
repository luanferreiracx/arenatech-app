/**
 * Decisão de QUAIS FinancialTransaction a venda gera (R4 fase 2).
 * Cartão NÃO gera FT (vive no CardReceivable) — a função recebe só não-cartão.
 */
import { describe, it, expect } from "vitest";
import { planSaleReceivables } from "@/server/services/sale-receivables-plan";

describe("planSaleReceivables", () => {
  it("venda 100% cartão (nenhum não-cartão) → nenhuma FT", () => {
    expect(planSaleReceivables([], { totalCents: 10000, paymentMethod: "cartao_credito" })).toEqual([]);
  });

  it("dinheiro à vista → 1 FT agregada PAID pelo total não-cartão", () => {
    const r = planSaleReceivables(
      [{ amount: 10000, installments: 1, method: "dinheiro" }],
      { totalCents: 10000, paymentMethod: "dinheiro" },
    );
    expect(r).toEqual([
      { amountCents: 10000, installments: 1, paymentMethod: "dinheiro", status: "PAID" },
    ]);
  });

  it("misto dinheiro + PIX (ambos à vista) → 1 FT agregada PAID pelo total não-cartão", () => {
    // O cartão já foi filtrado fora; sobram dinheiro (6000) + pix (4000).
    const r = planSaleReceivables(
      [
        { amount: 6000, installments: 1, method: "dinheiro" },
        { amount: 4000, installments: 1, method: "pix" },
      ],
      { totalCents: 10000, paymentMethod: "misto" },
    );
    expect(r).toEqual([
      { amountCents: 10000, installments: 1, paymentMethod: "misto", status: "PAID" },
    ]);
  });

  it("crediário parcelado (3x) → 1 FT PENDING por pagamento", () => {
    const r = planSaleReceivables(
      [{ amount: 30000, installments: 3, method: "crediario" }],
      { totalCents: 30000, paymentMethod: "crediario" },
    );
    expect(r).toEqual([
      { amountCents: 30000, installments: 3, paymentMethod: "crediario", status: "PENDING" },
    ]);
  });

  it("crediário 3x + dinheiro 1x → per-payment (PENDING crediário + PAID dinheiro)", () => {
    const r = planSaleReceivables(
      [
        { amount: 30000, installments: 3, method: "crediario" },
        { amount: 5000, installments: 1, method: "dinheiro" },
      ],
      { totalCents: 35000, paymentMethod: "misto" },
    );
    expect(r).toEqual([
      { amountCents: 30000, installments: 3, paymentMethod: "crediario", status: "PENDING" },
      { amountCents: 5000, installments: 1, paymentMethod: "dinheiro", status: "PAID" },
    ]);
  });
});
