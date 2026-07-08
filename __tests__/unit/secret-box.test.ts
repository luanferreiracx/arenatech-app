/**
 * secret-box: cifragem de segredos textuais em repouso (AES-256-GCM) para o
 * webhook-secret de saída (auditoria S6). Round-trip, tolerância a legado em
 * claro, separação por contexto e detecção de formato.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { sealSecret, openSecret, isSealed, canSealSecret } from "@/lib/security/secret-box";

const CTX = "partner-webhook";

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = "test-secret-for-secret-box";
});
afterEach(() => {
  process.env.NEXTAUTH_SECRET = "test-secret-for-secret-box";
});

describe("secret-box", () => {
  it("round-trip: seal → open devolve o plaintext", () => {
    const secret = "abc123def456";
    const sealed = sealSecret(secret, CTX);
    expect(sealed).not.toBe(secret);
    expect(isSealed(sealed)).toBe(true);
    expect(openSecret(sealed, CTX)).toBe(secret);
  });

  it("o ciphertext NÃO contém o plaintext (não vaza num dump)", () => {
    const sealed = sealSecret("segredo-super-sensivel", CTX);
    expect(sealed).not.toContain("segredo-super-sensivel");
  });

  it("IV aleatório: cifrar o mesmo valor 2x dá ciphertexts diferentes", () => {
    expect(sealSecret("x", CTX)).not.toBe(sealSecret("x", CTX));
  });

  it("tolera LEGADO EM CLARO: open de um valor não-cifrado retorna como está", () => {
    // Backfill ainda não rodou — o secret está em claro no banco.
    const legacy = "secret-em-claro-legado";
    expect(isSealed(legacy)).toBe(false);
    expect(openSecret(legacy, CTX)).toBe(legacy);
  });

  it("contexto separa domínios: decifrar com contexto errado FALHA (não vaza cruzado)", () => {
    const sealed = sealSecret("valor", CTX);
    expect(() => openSecret(sealed, "outro-contexto")).toThrow();
  });

  it("adulteração do ciphertext é detectada (GCM authTag)", () => {
    const sealed = sealSecret("valor", CTX);
    const parts = sealed.split(":");
    // corrompe 1 byte do data (última parte), mantendo base64 válido
    const data = Buffer.from(parts[2]!, "base64");
    data[0] = data[0]! ^ 0xff;
    const tampered = [parts[0], parts[1], data.toString("base64")].join(":");
    expect(() => openSecret(tampered, CTX)).toThrow();
  });

  it("canSealSecret reflete a presença do NEXTAUTH_SECRET", () => {
    expect(canSealSecret()).toBe(true);
    delete process.env.NEXTAUTH_SECRET;
    expect(canSealSecret()).toBe(false);
  });
});
