import { describe, it, expect } from "vitest";
import { createUserSchema, updateUserSchema } from "@/lib/validators/settings";

// CPF válido (dígitos verificadores corretos) usado nos testes.
const VALID_CPF = "52998224725";

describe("createUserSchema (gestão de usuários do tenant)", () => {
  it("aceita usuário válido com email", () => {
    const r = createUserSchema.safeParse({
      name: "Fulano",
      cpf: VALID_CPF,
      email: "fulano@loja.com",
      role: "operator",
    });
    expect(r.success).toBe(true);
  });

  it("aceita sem email (opcional)", () => {
    expect(createUserSchema.safeParse({ name: "Fulano", cpf: VALID_CPF, role: "operator" }).success).toBe(true);
  });

  it("rejeita CPF com dígito verificador inválido", () => {
    expect(createUserSchema.safeParse({ name: "X", cpf: "11111111111", role: "operator" }).success).toBe(false);
  });

  it("rejeita email malformado", () => {
    const r = createUserSchema.safeParse({ name: "X", cpf: VALID_CPF, email: "naoeemail", role: "operator" });
    expect(r.success).toBe(false);
  });

  it("só aceita admin/operator (technician/cashier viraram flags)", () => {
    expect(createUserSchema.safeParse({ name: "X", cpf: VALID_CPF, role: "admin" }).success).toBe(true);
    expect(createUserSchema.safeParse({ name: "X", cpf: VALID_CPF, role: "operator" }).success).toBe(true);
    for (const role of ["technician", "cashier", "superadmin", "owner", "manager"]) {
      expect(createUserSchema.safeParse({ name: "X", cpf: VALID_CPF, role }).success).toBe(false);
    }
  });

  it("aceita as flags de função isTechnician/isCashier", () => {
    const r = createUserSchema.safeParse({
      name: "X",
      cpf: VALID_CPF,
      role: "operator",
      isTechnician: true,
      isCashier: true,
    });
    expect(r.success).toBe(true);
  });
});

describe("updateUserSchema", () => {
  it("exige userId e name", () => {
    expect(updateUserSchema.safeParse({ name: "Novo Nome", role: "operator" }).success).toBe(false);
    expect(
      updateUserSchema.safeParse({
        userId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        name: "Novo Nome",
        role: "operator",
      }).success,
    ).toBe(true);
  });
});
