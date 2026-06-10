import { describe, it, expect, beforeEach } from "vitest";
import * as OTPAuth from "otpauth";
import {
  buildOtpAuthUrl,
  consumeBackupCode,
  decryptSecret,
  encryptSecret,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  isTwoFactorConfigured,
  verifyTotp,
} from "@/lib/auth/two-factor";

// Token TOTP atual para um segredo, espelhando os parâmetros da lib (SHA1/6/30).
function currentToken(base32: string): string {
  return new OTPAuth.TOTP({
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(base32),
  }).generate();
}

describe("two-factor", () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = "test-secret-for-2fa-encryption";
  });

  it("isTwoFactorConfigured reflete NEXTAUTH_SECRET", () => {
    expect(isTwoFactorConfigured()).toBe(true);
    delete process.env.NEXTAUTH_SECRET;
    expect(isTwoFactorConfigured()).toBe(false);
  });

  describe("encriptação do segredo", () => {
    it("round-trip recupera o texto puro", () => {
      const secret = generateTotpSecret();
      const enc = encryptSecret(secret);
      expect(enc).not.toContain(secret); // não vaza o segredo em claro
      expect(decryptSecret(enc)).toBe(secret);
    });

    it("cada cifragem usa IV novo (ciphertexts diferentes)", () => {
      const secret = generateTotpSecret();
      expect(encryptSecret(secret)).not.toBe(encryptSecret(secret));
    });

    it("payload corrompido falha ao decifrar (GCM autentica)", () => {
      const enc = encryptSecret("HELLO");
      const tampered = enc.slice(0, -2) + (enc.endsWith("A") ? "B" : "A");
      expect(() => decryptSecret(tampered)).toThrow();
    });
  });

  describe("TOTP", () => {
    it("gera segredo base32 e URL otpauth", () => {
      const secret = generateTotpSecret();
      expect(secret).toMatch(/^[A-Z2-7]+$/);
      const url = buildOtpAuthUrl(secret, "12345678909");
      expect(url).toContain("otpauth://totp/");
      expect(url).toContain("Arena%20Tech");
    });

    it("valida o token corrente e rejeita um errado", () => {
      const secret = generateTotpSecret();
      expect(verifyTotp(secret, currentToken(secret))).toBe(true);
      expect(verifyTotp(secret, "000000")).toBe(false);
    });

    it("rejeita formatos inválidos sem lançar", () => {
      const secret = generateTotpSecret();
      expect(verifyTotp(secret, "")).toBe(false);
      expect(verifyTotp(secret, "12345")).toBe(false);
      expect(verifyTotp(secret, "ABCDEF")).toBe(false);
    });
  });

  describe("backup codes", () => {
    it("gera N códigos + hashes; texto puro não é o hash", () => {
      const { codes, hashes } = generateBackupCodes(10);
      expect(codes).toHaveLength(10);
      expect(hashes).toHaveLength(10);
      expect(hashes[0]).not.toBe(codes[0]);
      expect(hashes[0]).toMatch(/^[0-9a-f]{64}$/);
    });

    it("hashBackupCode normaliza traço/caixa/espaços", () => {
      const h = hashBackupCode("abcde-fghjk");
      expect(hashBackupCode("ABCDE FGHJK")).toBe(h);
      expect(hashBackupCode("ABCDEFGHJK")).toBe(h);
    });

    it("consumeBackupCode remove o hash usado (uso único)", () => {
      const { codes, hashes } = generateBackupCodes(3);
      const remaining = consumeBackupCode(codes[0]!, hashes);
      expect(remaining).not.toBeNull();
      expect(remaining).toHaveLength(2);
      expect(remaining).not.toContain(hashBackupCode(codes[0]!));
    });

    it("consumeBackupCode retorna null para código inexistente", () => {
      const { hashes } = generateBackupCodes(3);
      expect(consumeBackupCode("ZZZZZ-ZZZZZ", hashes)).toBeNull();
    });
  });
});
