import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { updateSaleSellerSchema } from "@/lib/validators/sale";

/**
 * Troca de vendedor de uma venda (correcao operacional, somente admin).
 * O schema garante venda + vendedor validos e motivo obrigatorio (a alteracao
 * vai para a auditoria da venda, entao precisa de justificativa).
 */
describe("updateSaleSellerSchema", () => {
  it("aceita troca valida com motivo", () => {
    const r = updateSaleSellerSchema.safeParse({
      saleId: randomUUID(),
      sellerId: randomUUID(),
      reason: "Vendedor lancado errado no fechamento",
    });
    expect(r.success).toBe(true);
  });

  it("exige motivo", () => {
    const r = updateSaleSellerSchema.safeParse({
      saleId: randomUUID(),
      sellerId: randomUUID(),
      reason: "",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path[0] === "reason")).toBe(true);
    }
  });

  it("exige saleId e sellerId em formato uuid", () => {
    expect(
      updateSaleSellerSchema.safeParse({ saleId: "x", sellerId: randomUUID(), reason: "ok" }).success,
    ).toBe(false);
    expect(
      updateSaleSellerSchema.safeParse({ saleId: randomUUID(), sellerId: "y", reason: "ok" }).success,
    ).toBe(false);
  });
});
