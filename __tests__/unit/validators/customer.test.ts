import { describe, it, expect } from "vitest";
import {
  createCustomerSchema,
  validateCnpj,
  normalizeCnpj,
  addressSchema,
} from "@/lib/validators/customer";

// ── CNPJ validation ──

describe("validateCnpj", () => {
  it("accepts valid CNPJ", () => {
    // Known valid CNPJs
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

// ── createCustomerSchema ──

describe("createCustomerSchema", () => {
  const validPfData = {
    type: "PF" as const,
    name: "Maria Silva",
    cpf: "52998224725", // valid CPF
    email: "maria@email.com",
    phone: "86999991234",
  };

  const validPjData = {
    type: "PJ" as const,
    name: "Empresa Teste LTDA",
    cnpj: "11222333000181", // valid CNPJ
    email: "contato@empresa.com",
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

  it("rejects PF without CPF", () => {
    const result = createCustomerSchema.safeParse({
      ...validPfData,
      cpf: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects PF with invalid CPF", () => {
    const result = createCustomerSchema.safeParse({
      ...validPfData,
      cpf: "12345678900",
    });
    expect(result.success).toBe(false);
  });

  it("rejects PJ without CNPJ", () => {
    const result = createCustomerSchema.safeParse({
      ...validPjData,
      cnpj: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects PJ with invalid CNPJ", () => {
    const result = createCustomerSchema.safeParse({
      ...validPjData,
      cnpj: "11222333000100",
    });
    expect(result.success).toBe(false);
  });

  it("rejects name shorter than 2 characters", () => {
    const result = createCustomerSchema.safeParse({
      ...validPfData,
      name: "A",
    });
    expect(result.success).toBe(false);
  });

  it("accepts name with exactly 2 characters", () => {
    const result = createCustomerSchema.safeParse({
      ...validPfData,
      name: "AB",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email format", () => {
    const result = createCustomerSchema.safeParse({
      ...validPfData,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty email", () => {
    const result = createCustomerSchema.safeParse({
      ...validPfData,
      email: "",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid email", () => {
    const result = createCustomerSchema.safeParse({
      ...validPfData,
      email: "test@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("accepts customer without optional fields", () => {
    const result = createCustomerSchema.safeParse({
      type: "PF",
      name: "Teste",
      cpf: "52998224725",
    });
    expect(result.success).toBe(true);
  });
});

// ── Address schema ──

describe("addressSchema", () => {
  it("accepts valid address", () => {
    const result = addressSchema.safeParse({
      cep: "64000020",
      logradouro: "Rua Teste",
      numero: "123",
      bairro: "Centro",
      cidade: "Teresina",
      uf: "PI",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty address", () => {
    const result = addressSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial address", () => {
    const result = addressSchema.safeParse({
      cidade: "Teresina",
      uf: "PI",
    });
    expect(result.success).toBe(true);
  });
});
