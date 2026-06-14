import { describe, it, expect } from "vitest";
import {
  startNoKycRegistrationSchema,
  verifyNoKycEmailSchema,
  resendNoKycCodeSchema,
} from "@/lib/validators/no-kyc";

const base = {
  ownerName: "Fulano",
  email: "fulano@loja.com",
  phone: "86999990000",
  password: "senha1234",
  confirmPassword: "senha1234",
};

describe("startNoKycRegistrationSchema", () => {
  it("aceita cadastro válido (tradeName opcional)", () => {
    expect(startNoKycRegistrationSchema.safeParse(base).success).toBe(true);
    expect(startNoKycRegistrationSchema.safeParse({ ...base, tradeName: "Minha Loja" }).success).toBe(true);
  });

  it("rejeita senha sem número", () => {
    const r = startNoKycRegistrationSchema.safeParse({ ...base, password: "senhasenha", confirmPassword: "senhasenha" });
    expect(r.success).toBe(false);
  });

  it("rejeita senha curta (< 8)", () => {
    expect(startNoKycRegistrationSchema.safeParse({ ...base, password: "ab12", confirmPassword: "ab12" }).success).toBe(false);
  });

  it("rejeita senhas que não coincidem (erro no confirmPassword)", () => {
    const r = startNoKycRegistrationSchema.safeParse({ ...base, confirmPassword: "outra1234" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("confirmPassword"))).toBe(true);
    }
  });

  it("rejeita e-mail malformado", () => {
    expect(startNoKycRegistrationSchema.safeParse({ ...base, email: "naoeemail" }).success).toBe(false);
  });

  it("rejeita telefone com menos de 10 dígitos", () => {
    expect(startNoKycRegistrationSchema.safeParse({ ...base, phone: "1234" }).success).toBe(false);
  });
});

describe("verifyNoKycEmailSchema", () => {
  it("exige uuid + código", () => {
    expect(verifyNoKycEmailSchema.safeParse({ preRegistrationId: "x", code: "123456" }).success).toBe(false);
    expect(
      verifyNoKycEmailSchema.safeParse({
        preRegistrationId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        code: "123456",
      }).success,
    ).toBe(true);
  });
});

describe("resendNoKycCodeSchema", () => {
  it("só aceita canais EMAIL/WHATSAPP", () => {
    const id = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
    expect(resendNoKycCodeSchema.safeParse({ preRegistrationId: id, channel: "EMAIL" }).success).toBe(true);
    expect(resendNoKycCodeSchema.safeParse({ preRegistrationId: id, channel: "WHATSAPP" }).success).toBe(true);
    expect(resendNoKycCodeSchema.safeParse({ preRegistrationId: id, channel: "SMS" }).success).toBe(false);
  });
});
