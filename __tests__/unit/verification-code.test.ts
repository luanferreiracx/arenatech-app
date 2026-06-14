import { describe, it, expect } from "vitest";
import {
  generateVerificationCode,
  hashVerificationCode,
  normalizeCode,
  verifyCodeHash,
  expiresAtFromNow,
  VERIFICATION_CODE_LENGTH,
  VERIFICATION_CODE_TTL_MINUTES,
} from "@/lib/auth/verification-code";

describe("verification-code (OTP NO-KYC)", () => {
  it("gera código numérico de 6 dígitos (com zeros à esquerda)", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateVerificationCode();
      expect(code).toHaveLength(VERIFICATION_CODE_LENGTH);
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it("hash não é o código em claro e é estável/determinístico", () => {
    const code = "012345";
    const h = hashVerificationCode(code);
    expect(h).not.toContain(code);
    expect(h).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
    expect(hashVerificationCode(code)).toBe(h);
  });

  it("verifyCodeHash aceita o código correto e rejeita o errado", () => {
    const code = "654321";
    const h = hashVerificationCode(code);
    expect(verifyCodeHash("654321", h)).toBe(true);
    expect(verifyCodeHash("000000", h)).toBe(false);
  });

  it("verifyCodeHash normaliza espaços/traços do input", () => {
    const h = hashVerificationCode("123456");
    expect(verifyCodeHash("123-456", h)).toBe(true);
    expect(verifyCodeHash("12 34 56", h)).toBe(true);
  });

  it("verifyCodeHash é robusto a hash de tamanho inesperado", () => {
    expect(verifyCodeHash("123456", "deadbeef")).toBe(false);
  });

  it("normalizeCode mantém só dígitos", () => {
    expect(normalizeCode(" 1a2b3-4 ")).toBe("1234");
  });

  it("expiresAtFromNow usa o TTL padrão (10min) a partir do instante dado", () => {
    const now = new Date("2026-06-14T12:00:00.000Z");
    const exp = expiresAtFromNow(VERIFICATION_CODE_TTL_MINUTES, now);
    expect(exp.getTime() - now.getTime()).toBe(VERIFICATION_CODE_TTL_MINUTES * 60_000);
  });
});
