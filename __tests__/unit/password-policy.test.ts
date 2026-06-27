/**
 * validatePasswordPolicy (D4): aplica a politica de senha do tenant
 * (TenantSecuritySettings) nas trocas de senha. Antes a config era salva mas
 * ignorada — o sistema aceitava 6 chars independentemente.
 */
import { describe, it, expect } from "vitest";
import { validatePasswordPolicy, type PasswordPolicy } from "@/lib/password";

const base: PasswordPolicy = {
  minPasswordLength: 8,
  requireUppercase: false,
  requireNumber: false,
  requireSpecialChar: false,
};

describe("validatePasswordPolicy", () => {
  it("aceita senha que cumpre a politica (OK = null)", () => {
    expect(validatePasswordPolicy("abcdefgh", base)).toBeNull();
  });

  it("rejeita abaixo do tamanho minimo", () => {
    expect(validatePasswordPolicy("abc", base)).toMatch(/ao menos 8 caracteres/);
    // limite exato: 8 passa, 7 nao.
    expect(validatePasswordPolicy("1234567", { ...base, minPasswordLength: 8 })).toMatch(/8 caracteres/);
    expect(validatePasswordPolicy("12345678", { ...base, minPasswordLength: 8 })).toBeNull();
  });

  it("exige maiuscula quando requireUppercase", () => {
    const p = { ...base, requireUppercase: true };
    expect(validatePasswordPolicy("semmaiuscula1", p)).toMatch(/maiuscula/);
    expect(validatePasswordPolicy("ComMaiuscula", p)).toBeNull();
  });

  it("exige numero quando requireNumber", () => {
    const p = { ...base, requireNumber: true };
    expect(validatePasswordPolicy("semnumeros", p)).toMatch(/numero/);
    expect(validatePasswordPolicy("comnumero1", p)).toBeNull();
  });

  it("exige caractere especial quando requireSpecialChar", () => {
    const p = { ...base, requireSpecialChar: true };
    expect(validatePasswordPolicy("semespecial1", p)).toMatch(/especial/);
    expect(validatePasswordPolicy("comespecial!", p)).toBeNull();
  });

  it("politica completa: tudo exigido", () => {
    const strict: PasswordPolicy = {
      minPasswordLength: 12,
      requireUppercase: true,
      requireNumber: true,
      requireSpecialChar: true,
    };
    expect(validatePasswordPolicy("Abc1!", strict)).toMatch(/12 caracteres/); // curta primeiro
    expect(validatePasswordPolicy("abcdefghijk1!", strict)).toMatch(/maiuscula/);
    expect(validatePasswordPolicy("Abcdefghijkl!", strict)).toMatch(/numero/);
    expect(validatePasswordPolicy("Abcdefghijkl1", strict)).toMatch(/especial/);
    expect(validatePasswordPolicy("Abcdefghijk1!", strict)).toBeNull();
  });
});
