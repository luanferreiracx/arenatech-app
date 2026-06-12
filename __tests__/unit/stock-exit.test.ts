import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { stockExitSchema } from "@/lib/validators/stock";

/**
 * Regressao: a tela de Baixa de Estoque (/stock/exit) "nao fazia nada" ao clicar
 * em registrar quando a quantidade ficava vazia. O input vira NaN (valueAsNumber)
 * e a validacao falhava — mas sem exibicao de erro na tela, o react-hook-form
 * bloqueava o submit em silencio. A mensagem precisa ser amigavel para o toast.
 */
describe("stockExitSchema", () => {
  it("aceita baixa valida por quantidade", () => {
    const r = stockExitSchema.safeParse({
      productId: randomUUID(),
      variationId: null,
      quantity: 1,
      reason: "Danificado",
    });
    expect(r.success).toBe(true);
  });

  it("quantidade vazia (NaN) retorna mensagem amigavel", () => {
    const r = stockExitSchema.safeParse({
      productId: randomUUID(),
      variationId: null,
      quantity: Number.NaN,
      reason: "Danificado",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const q = r.error.issues.find((i) => i.path[0] === "quantity");
      expect(q?.message).toBe("Informe a quantidade");
    }
  });

  it("quantidade zero ou negativa e rejeitada", () => {
    for (const quantity of [0, -3]) {
      const r = stockExitSchema.safeParse({
        productId: randomUUID(),
        variationId: null,
        quantity,
        reason: "Perda",
      });
      expect(r.success).toBe(false);
    }
  });

  it("motivo obrigatorio", () => {
    const r = stockExitSchema.safeParse({
      productId: randomUUID(),
      variationId: null,
      quantity: 2,
      reason: "",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path[0] === "reason")).toBe(true);
    }
  });

  it("productId precisa ser uuid (produto nao selecionado)", () => {
    const r = stockExitSchema.safeParse({
      productId: "",
      variationId: null,
      quantity: 1,
      reason: "Perda",
    });
    expect(r.success).toBe(false);
  });
});
