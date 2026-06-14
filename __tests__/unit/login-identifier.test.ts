import { describe, it, expect } from "vitest";
import { resolveLoginIdentifier, maskIdentifier } from "@/lib/auth/login-identifier";

const VALID_CPF = "52998224725";

describe("resolveLoginIdentifier (login dual NO-KYC)", () => {
  it("detecta e-mail quando contém @ (normaliza p/ lowercase)", () => {
    expect(resolveLoginIdentifier("User@Loja.COM")).toEqual({ kind: "email", value: "user@loja.com" });
  });

  it("detecta CPF válido e normaliza p/ dígitos", () => {
    expect(resolveLoginIdentifier("529.982.247-25")).toEqual({ kind: "cpf", value: VALID_CPF });
  });

  it("rejeita CPF com dígito verificador inválido", () => {
    expect(resolveLoginIdentifier("11111111111")).toBeNull();
    expect(resolveLoginIdentifier("12345678900")).toBeNull();
  });

  it("rejeita e-mail malformado", () => {
    expect(resolveLoginIdentifier("naoeemail@")).toBeNull();
    expect(resolveLoginIdentifier("@dominio.com")).toBeNull();
  });

  it("rejeita vazio / não-string", () => {
    expect(resolveLoginIdentifier("")).toBeNull();
    expect(resolveLoginIdentifier("   ")).toBeNull();
    expect(resolveLoginIdentifier(undefined)).toBeNull();
    expect(resolveLoginIdentifier(123)).toBeNull();
  });

  it("faz trim do valor", () => {
    expect(resolveLoginIdentifier("  user@x.com ")).toEqual({ kind: "email", value: "user@x.com" });
  });
});

describe("maskIdentifier", () => {
  it("mascara CPF mantendo só os 3 primeiros dígitos", () => {
    expect(maskIdentifier({ kind: "cpf", value: VALID_CPF })).toBe("529***");
  });

  it("mascara e-mail mantendo 2 chars do usuário + domínio", () => {
    expect(maskIdentifier({ kind: "email", value: "fulano@loja.com" })).toBe("fu***@loja.com");
  });
});
