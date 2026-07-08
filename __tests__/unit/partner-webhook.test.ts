/**
 * partner-webhook.service (ADR 0057, Fase 4): envio best-effort assinado (HMAC).
 * Garante: no-op sem URL/secret; assina X-Signature = HMAC-SHA256(body, secret);
 * nunca lança (best-effort); marca lastDeliveryAt no 2xx. fetch/DB mockados.
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

// DNS determinístico: o guard anti-SSRF resolve o host antes do fetch — sem isto o
// teste bateria na rede real (flaky). parceiro.com → IP público.
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "203.0.113.10", family: 4 }]),
}));

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

beforeEach(() => {
  cfgFindUnique.mockReset();
  cfgUpdate.mockReset();
  cfgUpdate.mockResolvedValue({});
  vi.restoreAllMocks();
});

describe("notifyPartnerWebhook", () => {
  it("no-op sem URL/secret (não chama fetch)", async () => {
    cfgFindUnique.mockResolvedValue({ url: null, secret: null });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await notifyPartnerWebhook(TENANT, event);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("envia POST assinado com X-Signature HMAC correto", async () => {
    cfgFindUnique.mockResolvedValue({ url: "https://parceiro.com/hook", secret: SECRET });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    await notifyPartnerWebhook(TENANT, event);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("https://parceiro.com/hook");
    // redirect:"error" impede bypass de SSRF via 3xx.
    expect((init as RequestInit).redirect).toBe("error");
    const body = (init as RequestInit).body as string;
    const headers = (init as RequestInit).headers as Record<string, string>;
    const expected = "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");
    expect(headers["x-signature"]).toBe(expected);
    expect(headers["x-event-type"]).toBe("deposit.completed");
    // Corpo é o evento serializado.
    expect(JSON.parse(body)).toMatchObject({ type: "deposit.completed", transactionId: "tx-1" });
    // Marca lastDeliveryAt no sucesso.
    expect(cfgUpdate).toHaveBeenCalled();
  });

  it("secret CIFRADO em repouso: decifra antes de assinar (S6)", async () => {
    // O banco guarda o secret cifrado; a assinatura deve usar o PLAINTEXT.
    cfgFindUnique.mockResolvedValue({
      url: "https://parceiro.com/hook",
      secret: sealSecret(SECRET, "partner-webhook"),
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    await notifyPartnerWebhook(TENANT, event);

    const [, init] = fetchSpy.mock.calls[0]!;
    const body = (init as RequestInit).body as string;
    const headers = (init as RequestInit).headers as Record<string, string>;
    // Assinatura usa o secret DECIFRADO, não o ciphertext.
    const expected = "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");
    expect(headers["x-signature"]).toBe(expected);
  });

  it("secret LEGADO em claro ainda funciona (transição sem backfill)", async () => {
    cfgFindUnique.mockResolvedValue({ url: "https://parceiro.com/hook", secret: SECRET });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    await notifyPartnerWebhook(TENANT, event);

    const [, init] = fetchSpy.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    const body = (init as RequestInit).body as string;
    const expected = "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");
    expect(headers["x-signature"]).toBe(expected);
  });

  it("não lança se o parceiro retorna erro (best-effort) e não marca entrega", async () => {
    cfgFindUnique.mockResolvedValue({ url: "https://parceiro.com/hook", secret: SECRET });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("boom", { status: 500 }));
    await expect(notifyPartnerWebhook(TENANT, event)).resolves.toBeUndefined();
    expect(cfgUpdate).not.toHaveBeenCalled();
  });

  it("não lança se o fetch explode (timeout/rede)", async () => {
    cfgFindUnique.mockResolvedValue({ url: "https://parceiro.com/hook", secret: SECRET });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ETIMEDOUT"));
    await expect(notifyPartnerWebhook(TENANT, event)).resolves.toBeUndefined();
  });

  it("anti-SSRF: NÃO entrega para URL interna (e não lança)", async () => {
    cfgFindUnique.mockResolvedValue({ url: "https://127.0.0.1/hook", secret: SECRET });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(notifyPartnerWebhook(TENANT, event)).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
