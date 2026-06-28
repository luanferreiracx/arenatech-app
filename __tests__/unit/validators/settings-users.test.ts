import { describe, it, expect } from "vitest";
import { createUserSchema, updateUserSchema } from "@/lib/validators/settings";

// CPF válido (dígitos verificadores corretos) usado nos testes.
const VALID_CPF = "52998224725";
const VALID_USER = {
  name: "Fulano",
  cpf: VALID_CPF,
  email: "fulano@loja.com",
  phone: "(11) 91234-5678",
  role: "operator" as const,
};

describe("createUserSchema (gestão de usuários do tenant)", () => {
  it("aceita usuário válido com email + WhatsApp", () => {
    expect(createUserSchema.safeParse(VALID_USER).success).toBe(true);
  });

  it("EXIGE email (recuperação de 2FA)", () => {
    const { email: _omit, ...noEmail } = VALID_USER;
    expect(createUserSchema.safeParse(noEmail).success).toBe(false);
    expect(createUserSchema.safeParse({ ...VALID_USER, email: "" }).success).toBe(false);
  });

  it("EXIGE WhatsApp (recuperação de 2FA)", () => {
    const { phone: _omit, ...noPhone } = VALID_USER;
    expect(createUserSchema.safeParse(noPhone).success).toBe(false);
    expect(createUserSchema.safeParse({ ...VALID_USER, phone: "" }).success).toBe(false);
  });

  it("valida telefone BR (DDD + número, 10–11 dígitos)", () => {
    expect(createUserSchema.safeParse({ ...VALID_USER, phone: "1191234567" }).success).toBe(true); // 10
    expect(createUserSchema.safeParse({ ...VALID_USER, phone: "11912345678" }).success).toBe(true); // 11
    expect(createUserSchema.safeParse({ ...VALID_USER, phone: "12345" }).success).toBe(false); // curto
    expect(createUserSchema.safeParse({ ...VALID_USER, phone: "119123456789" }).success).toBe(false); // longo
  });

  it("rejeita CPF com dígito verificador inválido", () => {
    expect(createUserSchema.safeParse({ ...VALID_USER, cpf: "11111111111" }).success).toBe(false);
  });

  it("rejeita email malformado", () => {
    expect(createUserSchema.safeParse({ ...VALID_USER, email: "naoeemail" }).success).toBe(false);
  });

  it("só aceita admin/operator (technician/cashier viraram flags)", () => {
    expect(createUserSchema.safeParse({ ...VALID_USER, role: "admin" }).success).toBe(true);
    for (const role of ["technician", "cashier", "superadmin", "owner", "manager"]) {
      expect(createUserSchema.safeParse({ ...VALID_USER, role }).success).toBe(false);
    }
  });

  it("aceita as flags de função isTechnician/isCashier", () => {
    expect(
      createUserSchema.safeParse({ ...VALID_USER, isTechnician: true, isCashier: true }).success,
    ).toBe(true);
  });
});

describe("updateUserSchema", () => {
  const VALID_UPDATE = {
    userId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    name: "Novo Nome",
    email: "novo@loja.com",
    phone: "11912345678",
    role: "operator" as const,
  };

  it("exige userId, name, email e WhatsApp", () => {
    expect(updateUserSchema.safeParse(VALID_UPDATE).success).toBe(true);
    expect(updateUserSchema.safeParse({ ...VALID_UPDATE, userId: undefined }).success).toBe(false);
    expect(updateUserSchema.safeParse({ ...VALID_UPDATE, email: "" }).success).toBe(false);
    expect(updateUserSchema.safeParse({ ...VALID_UPDATE, phone: "" }).success).toBe(false);
  });
});
