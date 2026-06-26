/**
 * Auth Basic do webhook da Eulen: valida a senha (parte apos `:`), ignora o
 * username, e e fail-closed em prod sem secret.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { verifyEulenWebhookAuth } from "@/lib/webhooks/eulen-auth";

const ORIGINAL = { ...process.env };

function basic(user: string, secret: string): string {
  return "Basic " + Buffer.from(`${user}:${secret}`).toString("base64");
}

beforeEach(() => {
  process.env = { ...ORIGINAL, NODE_ENV: "production", EULEN_WEBHOOK_SECRET: "s3cr3t-xyz" };
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("verifyEulenWebhookAuth", () => {
  it("aceita Basic com a senha correta (qualquer username)", () => {
    expect(verifyEulenWebhookAuth(basic("partner", "s3cr3t-xyz")).ok).toBe(true);
    expect(verifyEulenWebhookAuth(basic("pdvdepixapp", "s3cr3t-xyz")).ok).toBe(true);
  });

  it("rejeita senha errada", () => {
    const r = verifyEulenWebhookAuth(basic("partner", "errada"));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("secret_mismatch");
  });

  it("rejeita header ausente ou nao-Basic", () => {
    expect(verifyEulenWebhookAuth(null).ok).toBe(false);
    expect(verifyEulenWebhookAuth("Bearer abc").ok).toBe(false);
  });

  it("aceita senha que contem `:` (pega tudo apos o 1o separador)", () => {
    process.env.EULEN_WEBHOOK_SECRET = "ab:cd:ef";
    expect(verifyEulenWebhookAuth(basic("u", "ab:cd:ef")).ok).toBe(true);
  });

  it("fail-closed em prod sem EULEN_WEBHOOK_SECRET", () => {
    delete process.env.EULEN_WEBHOOK_SECRET;
    const r = verifyEulenWebhookAuth(basic("u", "x"));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("secret_not_configured");
  });

  it("dev sem secret: processa com warn (ok)", () => {
    process.env = { ...ORIGINAL, NODE_ENV: "development" };
    delete process.env.EULEN_WEBHOOK_SECRET;
    expect(verifyEulenWebhookAuth(null).ok).toBe(true);
  });
});
