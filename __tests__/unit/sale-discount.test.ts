import { describe, it, expect } from "vitest";
import { effectiveDiscountCents } from "@/lib/sales/sale-discount";

describe("effectiveDiscountCents", () => {
  describe("percentage", () => {
    it("aplica a alíquota sobre o subtotal", () => {
      expect(
        effectiveDiscountCents({ discountType: "percentage", percentValue: 10, subtotalCents: 20_000 }),
      ).toBe(2_000);
    });

    it("clampa percentual acima de 100 ao subtotal", () => {
      expect(
        effectiveDiscountCents({ discountType: "percentage", percentValue: 150, subtotalCents: 20_000 }),
      ).toBe(20_000);
    });

    it("trata percentual negativo como zero", () => {
      expect(
        effectiveDiscountCents({ discountType: "percentage", percentValue: -5, subtotalCents: 20_000 }),
      ).toBe(0);
    });
  });

  describe("fixed", () => {
    it("usa o valor nominal quando dentro do subtotal", () => {
      expect(
        effectiveDiscountCents({ discountType: "fixed", fixedNominalCents: 5_000, subtotalCents: 20_000 }),
      ).toBe(5_000);
    });

    // Regressão: desconto fixo gravado num carrinho maior que depois encolhe.
    // Sem o clamp, o líquido (subtotal − desconto) ficava negativo e a venda
    // virava "downgrade" fantasma (loja devolvendo dinheiro não pago).
    it("clampa o desconto fixo ao subtotal quando itens são removidos", () => {
      expect(
        effectiveDiscountCents({ discountType: "fixed", fixedNominalCents: 5_000, subtotalCents: 4_000 }),
      ).toBe(4_000);
    });

    it("trata valor fixo negativo como zero", () => {
      expect(
        effectiveDiscountCents({ discountType: "fixed", fixedNominalCents: -100, subtotalCents: 20_000 }),
      ).toBe(0);
    });
  });

  it("retorna zero quando o subtotal é zero ou negativo", () => {
    expect(
      effectiveDiscountCents({ discountType: "percentage", percentValue: 10, subtotalCents: 0 }),
    ).toBe(0);
    expect(
      effectiveDiscountCents({ discountType: "fixed", fixedNominalCents: 5_000, subtotalCents: -10 }),
    ).toBe(0);
  });
});
