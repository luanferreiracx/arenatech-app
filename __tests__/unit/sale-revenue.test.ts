import { describe, it, expect } from "vitest";
import { saleGoodsRevenueCents, saleGrossProfitCents, saleAmountToPayCents } from "@/lib/sales/sale-revenue";

describe("saleGoodsRevenueCents", () => {
  it("receita = subtotal - desconto", () => {
    expect(saleGoodsRevenueCents(500000, 0)).toBe(500000);
    expect(saleGoodsRevenueCents(500000, 50000)).toBe(450000);
  });

  it("nunca negativa (desconto > subtotal)", () => {
    expect(saleGoodsRevenueCents(10000, 99999)).toBe(0);
  });
});

describe("saleGrossProfitCents — bug do trade-in", () => {
  it("lucro positivo mesmo com upgrade alto (nao subtrai o trade-in)", () => {
    // Venda: aparelho R$5000, custo R$4000. Cliente deu trade-in de R$3000 e
    // pagou R$2000 (totalAmount liquido). O lucro deve ser R$1000 (5000-4000),
    // NAO -2000 (2000-4000) como no bug.
    const subtotal = 500_000;
    const discount = 0;
    const cost = 400_000;
    expect(saleGrossProfitCents(subtotal, discount, cost)).toBe(100_000);
  });

  it("lucro positivo em downgrade (totalAmount seria 0)", () => {
    // Trade-in excede o valor da venda: totalAmount=0, mas a mercadoria ainda
    // foi vendida acima do custo -> lucro positivo.
    const subtotal = 100_000; // R$1000
    const discount = 0;
    const cost = 80_000; // R$800
    expect(saleGrossProfitCents(subtotal, discount, cost)).toBe(20_000);
  });

  it("considera o desconto na receita", () => {
    expect(saleGrossProfitCents(500_000, 50_000, 400_000)).toBe(50_000);
  });
});

describe("saleAmountToPayCents — semântica de exibição (Total vs A pagar)", () => {
  it("caso VND202602302: Total(mercadoria) − trade-in = A pagar", () => {
    // Dado real de prod: iPhone R$7.936,83; 2 trade-ins (R$1.300 + R$3.600 =
    // R$4.900); sem desconto. O "Total" exibido é 7936,83 (mercadoria) e o
    // "A pagar" é 3036,83 — NÃO o contrário.
    const subtotal = 793_683;
    const discount = 0;
    const upgradeAbated = 490_000;
    expect(saleAmountToPayCents(subtotal, discount, upgradeAbated)).toBe(303_683);
  });

  it("sem trade-in nem desconto: a pagar == subtotal", () => {
    expect(saleAmountToPayCents(500_000, 0, 0)).toBe(500_000);
  });

  it("desconto + trade-in abatem juntos", () => {
    expect(saleAmountToPayCents(500_000, 50_000, 100_000)).toBe(350_000);
  });

  it("downgrade (trade-in > mercadoria): a pagar = 0, nunca negativo", () => {
    expect(saleAmountToPayCents(100_000, 0, 300_000)).toBe(0);
  });
});
