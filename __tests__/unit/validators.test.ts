import { describe, it, expect } from "vitest";
import { createCustomerSchema, validateCnpj, normalizeCnpj } from "@/lib/validators/customer";
import { createServiceSchema } from "@/lib/validators/catalog";
import { createPaymentMethodSchema } from "@/lib/validators/settings";

// ────────────────────────────────────────────────────────────────────────────
// CNPJ Validator
// ────────────────────────────────────────────────────────────────────────────

describe("validateCnpj", () => {
  it("accepts valid CNPJ", () => {
    expect(validateCnpj("11222333000181")).toBe(true);
  });

  it("accepts formatted valid CNPJ", () => {
    expect(validateCnpj("11.222.333/0001-81")).toBe(true);
  });

  it("rejects all-same-digit CNPJ", () => {
    expect(validateCnpj("11111111111111")).toBe(false);
    expect(validateCnpj("00000000000000")).toBe(false);
  });

  it("rejects wrong length", () => {
    expect(validateCnpj("1122233300018")).toBe(false); // 13 digits
    expect(validateCnpj("112223330001811")).toBe(false); // 15 digits
  });

  it("rejects invalid check digits", () => {
    expect(validateCnpj("11222333000182")).toBe(false); // last digit wrong
    expect(validateCnpj("11222333000100")).toBe(false);
  });
});

describe("normalizeCnpj", () => {
  it("strips non-digits", () => {
    expect(normalizeCnpj("11.222.333/0001-81")).toBe("11222333000181");
  });

  it("leaves pure digits unchanged", () => {
    expect(normalizeCnpj("11222333000181")).toBe("11222333000181");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Customer Schema
// ────────────────────────────────────────────────────────────────────────────

describe("createCustomerSchema", () => {
  it("accepts PF with valid CPF", () => {
    const result = createCustomerSchema.safeParse({
      type: "PF",
      name: "João Silva",
      cpf: "529.982.247-25",
    });
    expect(result.success).toBe(true);
  });

  it("rejects PF with invalid CPF", () => {
    const result = createCustomerSchema.safeParse({
      type: "PF",
      name: "João Silva",
      cpf: "111.111.111-11",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("cpf"))).toBe(true);
    }
  });

  it("accepts PJ with valid CNPJ", () => {
    const result = createCustomerSchema.safeParse({
      type: "PJ",
      name: "Arena Tech Ltda",
      cnpj: "11.222.333/0001-81",
    });
    expect(result.success).toBe(true);
  });

  it("rejects PJ with invalid CNPJ", () => {
    const result = createCustomerSchema.safeParse({
      type: "PJ",
      name: "Arena Tech Ltda",
      cnpj: "00.000.000/0000-00",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("cnpj"))).toBe(true);
    }
  });

  it("requires name of at least 2 chars", () => {
    const result = createCustomerSchema.safeParse({ type: "PF", name: "A" });
    expect(result.success).toBe(false);
  });

  it("accepts empty email", () => {
    const result = createCustomerSchema.safeParse({
      type: "PF",
      name: "João Silva",
      email: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = createCustomerSchema.safeParse({
      type: "PF",
      name: "João Silva",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Service Schema
// ────────────────────────────────────────────────────────────────────────────

describe("createServiceSchema", () => {
  it("accepts valid service", () => {
    const result = createServiceSchema.safeParse({
      name: "Troca de Tela",
      basePrice: 150,
      active: true,
    });
    expect(result.success).toBe(true);
  });

  it("requires name", () => {
    const result = createServiceSchema.safeParse({ name: "", basePrice: 100, active: true });
    expect(result.success).toBe(false);
  });

  it("rejects negative price", () => {
    const result = createServiceSchema.safeParse({
      name: "Serviço",
      basePrice: -10,
      active: true,
    });
    expect(result.success).toBe(false);
  });

  it("accepts zero price", () => {
    const result = createServiceSchema.safeParse({
      name: "Diagnóstico Gratuito",
      basePrice: 0,
      active: true,
    });
    expect(result.success).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// PaymentMethod Schema
// ────────────────────────────────────────────────────────────────────────────

describe("createPaymentMethodSchema", () => {
  it("accepts valid payment method", () => {
    const result = createPaymentMethodSchema.safeParse({
      name: "PIX",
      type: "PIX",
      feePercent: 0,
      acceptsChange: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts fee up to 100%", () => {
    const result = createPaymentMethodSchema.safeParse({
      name: "Cartão Crédito",
      type: "CREDIT_CARD",
      feePercent: 3.5,
      acceptsChange: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects fee above 100%", () => {
    const result = createPaymentMethodSchema.safeParse({
      name: "Cartão Crédito",
      type: "CREDIT_CARD",
      feePercent: 101,
      acceptsChange: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative fee", () => {
    const result = createPaymentMethodSchema.safeParse({
      name: "Dinheiro",
      type: "CASH",
      feePercent: -1,
      acceptsChange: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown payment type", () => {
    const result = createPaymentMethodSchema.safeParse({
      name: "Cripto",
      type: "CRYPTO",
      feePercent: 0,
      acceptsChange: false,
    });
    expect(result.success).toBe(false);
  });
});
