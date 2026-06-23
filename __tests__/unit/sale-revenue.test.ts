import { describe, it, expect } from "vitest";
import { saleGoodsRevenueCents, saleGrossProfitCents } from "@/lib/sales/sale-revenue";

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
