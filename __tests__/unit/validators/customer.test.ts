import { describe, it, expect } from "vitest";
import {
  createCustomerSchema,
  validateCnpj,
  normalizeCnpj,
  createInterestSchema,
  addInteractionSchema,
  sendBatchSchema,
} from "@/lib/validators/customer";

// ── CNPJ validation ──

describe("validateCnpj", () => {
  it("accepts valid CNPJ", () => {
    expect(validateCnpj("11222333000181")).toBe(true);
    expect(validateCnpj("11.222.333/0001-81")).toBe(true);
  });

  it("rejects invalid CNPJ", () => {
    expect(validateCnpj("11222333000100")).toBe(false);
    expect(validateCnpj("00000000000000")).toBe(false);
    expect(validateCnpj("1234")).toBe(false);
    expect(validateCnpj("")).toBe(false);
  });

  it("rejects all-same-digit CNPJs", () => {
    expect(validateCnpj("11111111111111")).toBe(false);
    expect(validateCnpj("22222222222222")).toBe(false);
  });
});

describe("normalizeCnpj", () => {
  it("removes non-digit characters", () => {
    expect(normalizeCnpj("11.222.333/0001-81")).toBe("11222333000181");
  });
});

// ── createCustomerSchema (SPEC 3.1 + 7) ──

describe("createCustomerSchema", () => {
  const validPfData = {
    type: "PF" as const,
    name: "Maria Silva",
    cpf: "52998224725",
    phone: "86999991234",
  };

  const validPjData = {
    type: "PJ" as const,
    name: "Empresa Teste LTDA",
    cnpj: "11222333000181",
    phone: "86999991234",
  };

  it("accepts valid PF customer", () => {
    const result = createCustomerSchema.safeParse(validPfData);
    expect(result.success).toBe(true);
  });

  it("accepts valid PJ customer", () => {
    const result = createCustomerSchema.safeParse(validPjData);
    expect(result.success).toBe(true);
  });

  it("rejects PF without CPF (RN-2)", () => {
    const result = createCustomerSchema.safeParse({ ...validPfData, cpf: "" });
    expect(result.success).toBe(false);
  });

  it("rejects PF with invalid CPF (RN-3)", () => {
    const result = createCustomerSchema.safeParse({ ...validPfData, cpf: "12345678900" });
    expect(result.success).toBe(false);
  });

  it("rejects PF with all-same-digit CPF (RN-3)", () => {
    const result = createCustomerSchema.safeParse({ ...validPfData, cpf: "11111111111" });
    expect(result.success).toBe(false);
  });

  it("rejects PJ without CNPJ (RN-2)", () => {
    const result = createCustomerSchema.safeParse({ ...validPjData, cnpj: "" });
    expect(result.success).toBe(false);
  });

  it("rejects PJ with invalid CNPJ", () => {
    const result = createCustomerSchema.safeParse({ ...validPjData, cnpj: "11222333000100" });
    expect(result.success).toBe(false);
  });

  it("rejects name shorter than 2 characters", () => {
    const result = createCustomerSchema.safeParse({ ...validPfData, name: "A" });
    expect(result.success).toBe(false);
  });

  it("accepts name with exactly 2 characters", () => {
    const result = createCustomerSchema.safeParse({ ...validPfData, name: "AB" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email format", () => {
    const result = createCustomerSchema.safeParse({ ...validPfData, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("accepts empty email", () => {
    const result = createCustomerSchema.safeParse({ ...validPfData, email: "" });
    expect(result.success).toBe(true);
  });

  it("rejects PF with tradeName (cross-field)", () => {
    const result = createCustomerSchema.safeParse({ ...validPfData, tradeName: "Fantasia" });
    expect(result.success).toBe(false);
  });

  it("accepts PJ with tradeName", () => {
    const result = createCustomerSchema.safeParse({ ...validPjData, tradeName: "Fantasia" });
    expect(result.success).toBe(true);
  });

  it("requires phone (min 10 chars)", () => {
    const result = createCustomerSchema.safeParse({ ...validPfData, phone: "123" });
    expect(result.success).toBe(false);
  });

  it("accepts all address fields (ADR 0007)", () => {
    const result = createCustomerSchema.safeParse({
      ...validPfData,
      zipCode: "64000020",
      street: "Rua Teste",
      streetNumber: "123",
      neighborhood: "Centro",
      city: "Teresina",
      state: "PI",
    });
    expect(result.success).toBe(true);
  });

  it("accepts customer without optional fields", () => {
    const result = createCustomerSchema.safeParse({
      type: "PF",
      name: "Teste",
      cpf: "52998224725",
      phone: "86999991234",
    });
    expect(result.success).toBe(true);
  });
});

// ── Interest schema (SPEC 3.2) ──

describe("createInterestSchema", () => {
  it("accepts valid interest", () => {
    const result = createInterestSchema.safeParse({
      customerName: "João",
      phone: "86999991234",
      type: "PURCHASE",
      desiredModel: "iPhone 15",
    });
    expect(result.success).toBe(true);
  });

  it("rejects without customerName", () => {
    const result = createInterestSchema.safeParse({
      customerName: "",
      phone: "86999991234",
      type: "PURCHASE",
      desiredModel: "iPhone 15",
    });
    expect(result.success).toBe(false);
  });

  it("rejects without phone", () => {
    const result = createInterestSchema.safeParse({
      customerName: "João",
      phone: "",
      type: "PURCHASE",
      desiredModel: "iPhone 15",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid type", () => {
    const result = createInterestSchema.safeParse({
      customerName: "João",
      phone: "86999991234",
      type: "INVALID",
      desiredModel: "iPhone 15",
    });
    expect(result.success).toBe(false);
  });
});

// ── Interaction schema (SPEC 3.3) ──

describe("addInteractionSchema", () => {
  it("accepts valid interaction", () => {
    const result = addInteractionSchema.safeParse({
      interestId: "123e4567-e89b-12d3-a456-426614174000",
      type: "PHONE",
      description: "Ligação de follow-up",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid interaction type", () => {
    const result = addInteractionSchema.safeParse({
      interestId: "123e4567-e89b-12d3-a456-426614174000",
      type: "EMAIL",
      description: "Test",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all 3 interaction types", () => {
    for (const type of ["PHONE", "WHATSAPP", "IN_STORE"]) {
      const result = addInteractionSchema.safeParse({
        interestId: "123e4567-e89b-12d3-a456-426614174000",
        type,
        description: "Test",
      });
      expect(result.success).toBe(true);
    }
  });
});

// ── Send batch schema (SPEC RN-11) ──

describe("sendBatchSchema", () => {
  it("accepts 1-5 IDs", () => {
    const result = sendBatchSchema.safeParse({
      ids: ["123e4567-e89b-12d3-a456-426614174000"],
      message: "Olá, temos novidades para você!",
    });
    expect(result.success).toBe(true);
  });

  it("rejects more than 5 IDs (RN-11)", () => {
    const result = sendBatchSchema.safeParse({
      ids: Array(6).fill("123e4567-e89b-12d3-a456-426614174000"),
      message: "Olá, temos novidades para você!",
    });
    expect(result.success).toBe(false);
  });

  it("rejects message shorter than 10 chars", () => {
    const result = sendBatchSchema.safeParse({
      ids: ["123e4567-e89b-12d3-a456-426614174000"],
      message: "Oi",
    });
    expect(result.success).toBe(false);
  });
});
