import { describe, it, expect, beforeEach } from "vitest";
import * as OTPAuth from "otpauth";
import {
  buildOtpAuthUrl,
  canDisableTwoFactor,
  consumeBackupCode,
  decryptSecret,
  diagnoseTotpFailure,
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
      // Formato: iv_b64:authTag_b64:ciphertext_b64. Corrompe um byte do authTag
      // (flip do bit menos significativo do primeiro byte) — adulteracao
      // deterministica que o GCM sempre detecta. Mexer no ultimo char do
      // ciphertext base64 era flaky: o ultimo char carrega poucos bits uteis,
      // entao trocar A<->B as vezes nao alterava nenhum byte.
      const parts = enc.split(":");
      const authTag = Buffer.from(parts[1]!, "base64");
      authTag[0]! ^= 0x01;
      const tampered = [parts[0], authTag.toString("base64"), parts[2]].join(":");
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

    it("tolera dessincronia de ~1min (janela ±2)", () => {
      const secret = generateTotpSecret();
      const totp = new OTPAuth.TOTP({
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
      });
      // Código gerado 50s atrás (t-2 steps) — rejeitado com window=1, aceito com ±2.
      const skewed = totp.generate({ timestamp: Date.now() - 50_000 });
      expect(verifyTotp(secret, skewed)).toBe(true);
    });

    describe("diagnoseTotpFailure", () => {
      function totpFor(secret: string) {
        return new OTPAuth.TOTP({
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          secret: OTPAuth.Secret.fromBase32(secret),
        });
      }

      it("detecta clock skew: código fora da janela, mas casa com o segredo", () => {
        const secret = generateTotpSecret();
        // ~2min atrás: fora do ±2 do verifyTotp, mas dentro do ±5min do diagnóstico.
        const stale = totpFor(secret).generate({ timestamp: Date.now() - 120_000 });
        expect(verifyTotp(secret, stale)).toBe(false);
        const diag = diagnoseTotpFailure(secret, stale);
        expect(diag).not.toBeNull();
        expect(diag!.skewSteps).toBeLessThan(0); // código atrasado
      });

      it("retorna null quando o código é de outro segredo (entrada antiga no app)", () => {
        const secret = generateTotpSecret();
        const otherSecret = generateTotpSecret();
        const codeFromOther = totpFor(otherSecret).generate();
        expect(diagnoseTotpFailure(secret, codeFromOther)).toBeNull();
      });
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

  describe("canDisableTwoFactor (recuperação do beco)", () => {
    it("segredo VÁLIDO exige código correto (TOTP ou backup)", () => {
      // senha já validada; sem código bom → não desativa.
      expect(canDisableTwoFactor({ secretUsable: true, totpOk: false, backupOk: false })).toBe(false);
      expect(canDisableTwoFactor({ secretUsable: true, totpOk: true, backupOk: false })).toBe(true);
      expect(canDisableTwoFactor({ secretUsable: true, totpOk: false, backupOk: true })).toBe(true);
    });

    it("segredo INUTILIZÁVEL (null/indecifrável) → senha basta (recupera)", () => {
      // 2FA morto: o dono não consegue gerar código; senha destrava.
      expect(canDisableTwoFactor({ secretUsable: false, totpOk: false, backupOk: false })).toBe(true);
    });

    it("segredo cifrado com NEXTAUTH_SECRET ANTIGO é indecifrável → recovery", () => {
      // Cifra com uma chave; tenta decifrar com outra (rotação) → throw.
      const secret = generateTotpSecret();
      const enc = encryptSecret(secret);
      process.env.NEXTAUTH_SECRET = "uma-chave-totalmente-diferente";
      let usable = true;
      try {
        decryptSecret(enc);
      } catch {
        usable = false;
      }
      expect(usable).toBe(false);
      // Com o segredo inutilizável, a senha sozinha desativa (sai do beco).
      expect(canDisableTwoFactor({ secretUsable: usable, totpOk: false, backupOk: false })).toBe(true);
    });
  });
});
