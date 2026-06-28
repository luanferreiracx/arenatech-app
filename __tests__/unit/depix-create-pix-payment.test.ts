/**
 * createPixPayment (POST /deposit): trava o corpo enviado a Eulen. Foco no
 * `whitelist: true` (libera depositos > R$500 sem retencao) e no
 * `endUserTaxNumber` quando ha CPF. `fetch` mockado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPixPayment } from "@/lib/services/depix-service";

const ORIGINAL_KEY = process.env.DEPIX_API_KEY;

function lastFetchBody(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const call = spy.mock.calls[0]!;
  const init = call[1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

beforeEach(() => {
  process.env.DEPIX_API_KEY = "jwt-test";
  vi.restoreAllMocks();
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.DEPIX_API_KEY;
  else process.env.DEPIX_API_KEY = ORIGINAL_KEY;
});

describe("createPixPayment — payload do POST /deposit", () => {
  it("envia whitelist=true (libera > R$500)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ response: { id: "qr-1", qrCopyPaste: "00020...", qrImageUrl: "" } }), {
        status: 200,
      }),
    );

    const res = await createPixPayment(1000, "deposito", "nonce-1", "12345678909", {
      depixAddress: "lq1tenant",
      requireDepixAddress: true,
    });

    expect(res.success).toBe(true);
    const body = lastFetchBody(fetchSpy);
    expect(body.whitelist).toBe(true);
    expect(body.endUserTaxNumber).toBe("12345678909");
    expect(body.amountInCents).toBe(100000);
    expect(body.depixAddress).toBe("lq1tenant");
  });

  it("whitelist=true mesmo sem CPF do pagador", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ response: { id: "qr-2" } }), { status: 200 }),
    );
    await createPixPayment(800, "deposito", "nonce-2", null, {
      depixAddress: "lq1tenant",
      requireDepixAddress: true,
    });
    const body = lastFetchBody(fetchSpy);
    expect(body.whitelist).toBe(true);
    expect(body.endUserTaxNumber).toBeUndefined();
  });

  it("sem DEPIX_API_KEY -> mock mode (nao chama fetch)", async () => {
    delete process.env.DEPIX_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await createPixPayment(100, "deposito", "nonce-3", null);
    expect(res.success).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
