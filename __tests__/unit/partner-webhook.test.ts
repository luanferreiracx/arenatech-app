/**
 * partner-webhook.service (ADR 0057, Fase 4): envio best-effort assinado (HMAC).
 * Garante: no-op sem URL/secret; assina X-Signature = HMAC-SHA256(body, secret);
 * nunca lança (best-effort); marca lastDeliveryAt no 2xx; NÃO entrega p/ host
 * interno. A entrega usa postSignedJson (node:https + IP-pinning anti-rebinding) —
 * mockado aqui; assertPublicHttpsUrl (o bloqueio literal de SSRF) fica REAL.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

const cfgFindUnique = vi.fn();
const cfgUpdate = vi.fn();

const db = {
  partnerWebhookConfig: { findUnique: cfgFindUnique, update: cfgUpdate },
};
vi.mock("@/server/db", () => ({
  withTenant: (_t: string, fn: (d: typeof db) => unknown) => fn(db),
}));

// Mocka SÓ a entrega (postSignedJson); mantém assertPublicHttpsUrl REAL (bloqueio
// literal de host interno) via importActual.
const postSignedJson = vi.fn();
vi.mock("@/lib/security/ssrf", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/security/ssrf")>();
  return { ...actual, postSignedJson: (...a: unknown[]) => postSignedJson(...a) };
});

import { notifyPartnerWebhook } from "@/server/services/partner-webhook.service";
import { sealSecret } from "@/lib/security/secret-box";

const TENANT = "11111111-1111-1111-1111-111111111111";
const SECRET = "supersecret";

// secret-box deriva a chave do NEXTAUTH_SECRET.
process.env.NEXTAUTH_SECRET = "test-secret-for-partner-webhook";

const event = {
  type: "deposit.completed" as const,
  transactionId: "tx-1",
  number: "TXD-1",
  status: "COMPLETED",
  amountCents: 9751,
  occurredAt: "2026-06-30T10:00:00.000Z",
};

type SignedArgs = { url: URL; body: string; headers: Record<string, string>; timeoutMs: number };

beforeEach(() => {
  cfgFindUnique.mockReset();
  cfgUpdate.mockReset();
  cfgUpdate.mockResolvedValue({});
  postSignedJson.mockReset();
  postSignedJson.mockResolvedValue({ status: 200, ok: true });
});

describe("notifyPartnerWebhook", () => {
  it("no-op sem URL/secret (não entrega)", async () => {
    cfgFindUnique.mockResolvedValue({ url: null, secret: null });
    await notifyPartnerWebhook(TENANT, event);
    expect(postSignedJson).not.toHaveBeenCalled();
  });

  it("envia POST assinado com X-Signature HMAC correto", async () => {
    cfgFindUnique.mockResolvedValue({ url: "https://parceiro.com/hook", secret: SECRET });

    await notifyPartnerWebhook(TENANT, event);

    expect(postSignedJson).toHaveBeenCalledTimes(1);
    const args = postSignedJson.mock.calls[0]![0] as SignedArgs;
    expect(String(args.url)).toBe("https://parceiro.com/hook");
    const expected = "sha256=" + createHmac("sha256", SECRET).update(args.body).digest("hex");
    expect(args.headers["x-signature"]).toBe(expected);
    expect(args.headers["x-event-type"]).toBe("deposit.completed");
    expect(JSON.parse(args.body)).toMatchObject({ type: "deposit.completed", transactionId: "tx-1" });
    // Marca lastDeliveryAt no sucesso.
    expect(cfgUpdate).toHaveBeenCalled();
  });

  it("secret CIFRADO em repouso: decifra antes de assinar (S6)", async () => {
    cfgFindUnique.mockResolvedValue({
      url: "https://parceiro.com/hook",
      secret: sealSecret(SECRET, "partner-webhook"),
    });

    await notifyPartnerWebhook(TENANT, event);

    const args = postSignedJson.mock.calls[0]![0] as SignedArgs;
    const expected = "sha256=" + createHmac("sha256", SECRET).update(args.body).digest("hex");
    expect(args.headers["x-signature"]).toBe(expected);
  });

  it("secret LEGADO em claro ainda funciona (transição sem backfill)", async () => {
    cfgFindUnique.mockResolvedValue({ url: "https://parceiro.com/hook", secret: SECRET });

    await notifyPartnerWebhook(TENANT, event);

    const args = postSignedJson.mock.calls[0]![0] as SignedArgs;
    const expected = "sha256=" + createHmac("sha256", SECRET).update(args.body).digest("hex");
    expect(args.headers["x-signature"]).toBe(expected);
  });

  it("não lança se o parceiro retorna erro (best-effort) e não marca entrega", async () => {
    cfgFindUnique.mockResolvedValue({ url: "https://parceiro.com/hook", secret: SECRET });
    postSignedJson.mockResolvedValue({ status: 500, ok: false });
    await expect(notifyPartnerWebhook(TENANT, event)).resolves.toBeUndefined();
    expect(cfgUpdate).not.toHaveBeenCalled();
  });

  it("não lança se a entrega explode (timeout/rede)", async () => {
    cfgFindUnique.mockResolvedValue({ url: "https://parceiro.com/hook", secret: SECRET });
    postSignedJson.mockRejectedValue(new Error("ETIMEDOUT"));
    await expect(notifyPartnerWebhook(TENANT, event)).resolves.toBeUndefined();
  });

  it("anti-SSRF: NÃO entrega para URL interna literal (e não lança)", async () => {
    cfgFindUnique.mockResolvedValue({ url: "https://127.0.0.1/hook", secret: SECRET });
    await expect(notifyPartnerWebhook(TENANT, event)).resolves.toBeUndefined();
    expect(postSignedJson).not.toHaveBeenCalled();
  });
});
