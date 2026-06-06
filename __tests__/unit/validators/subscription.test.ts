import { describe, expect, it } from "vitest";
import { createTenantSchema } from "@/lib/validators/subscription";

const validCreateTenant = {
  name: "Loja Wallet",
  email: "owner@lojawallet.com.br",
  phone: "86999999999",
  ownerName: "Joao Silva",
  ownerCpf: "11144477735",
  trialDays: 0,
};

describe("createTenantSchema", () => {
  it("aceita cadastro manual valido para onboarding wallet-only", () => {
    expect(createTenantSchema.safeParse(validCreateTenant).success).toBe(true);
  });

  it("rejeita CPF com digito verificador invalido", () => {
    expect(
      createTenantSchema.safeParse({ ...validCreateTenant, ownerCpf: "12345678901" }).success,
    ).toBe(false);
  });

  it("rejeita CNPJ com digito verificador invalido", () => {
    expect(
      createTenantSchema.safeParse({ ...validCreateTenant, cnpj: "12345678000199" }).success,
    ).toBe(false);
  });

  it("aceita CNPJ valido com mascara", () => {
    expect(
      createTenantSchema.safeParse({ ...validCreateTenant, cnpj: "11.222.333/0001-81" }).success,
    ).toBe(true);
  });

  it("limita trial a no maximo 365 dias", () => {
    expect(createTenantSchema.safeParse({ ...validCreateTenant, trialDays: 366 }).success).toBe(false);
  });
});
