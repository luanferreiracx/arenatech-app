import { describe, it, expect, beforeEach } from "vitest";
import { resolveLoginIdentifier, maskIdentifier, loginRateLimitKey } from "@/lib/auth/login-identifier";
import { recordFailedAttempt, getFailedAttempts, _resetAllBuckets } from "@/lib/utils/rate-limit";

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

describe("loginRateLimitKey — chave única captcha↔lockout (P1-20)", () => {
  beforeEach(() => _resetAllBuckets());

  it("monta a chave com kind:value (formato do authorize)", () => {
    expect(loginRateLimitKey({ kind: "cpf", value: VALID_CPF })).toBe(`login:cpf:${VALID_CPF}`);
    expect(loginRateLimitKey({ kind: "email", value: "a@b.com" })).toBe("login:email:a@b.com");
  });

  it("as falhas registradas pelo authorize são LIDAS pelo gate do captcha (mesma chave)", () => {
    // Antes o bug: authorize gravava em `login:cpf:<x>` e o captcha lia `login:<x>`
    // → contador sempre 0, captcha nunca disparava. Agora ambos usam loginRateLimitKey.
    const identifier = resolveLoginIdentifier(VALID_CPF)!;
    const key = loginRateLimitKey(identifier);
    recordFailedAttempt(key);
    recordFailedAttempt(key);
    recordFailedAttempt(key);
    // O gate do captcha lê pela MESMA chave e enxerga as 3 falhas.
    expect(getFailedAttempts(loginRateLimitKey(resolveLoginIdentifier(VALID_CPF)!))).toBe(3);
  });
});
