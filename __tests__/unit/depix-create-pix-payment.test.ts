/**
 * createPixPayment (POST /deposit): trava o corpo enviado a Eulen. Garante que
 * NAO enviamos `whitelist` (permissao qrcodewhitelist nao habilitada -> Eulen
 * rejeita) e que o `endUserTaxNumber` (CPF/CNPJ) vai quando presente — o CPF e o
 * mecanismo correto para liberar depositos > R$500. `fetch` mockado.
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
  it("NAO envia whitelist; manda o CPF como endUserTaxNumber (libera > R$500)", async () => {
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
    // whitelist NUNCA vai (a Eulen rejeita: permissao nao habilitada).
    expect(body).not.toHaveProperty("whitelist");
    expect(body.endUserTaxNumber).toBe("12345678909");
    expect(body.amountInCents).toBe(100000);
    expect(body.depixAddress).toBe("lq1tenant");
  });

  it("sem CPF/CNPJ: recusa antes de chamar a Eulen (obrigatorio pra qualquer valor)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await createPixPayment(800, "deposito", "nonce-2", null, {
      depixAddress: "lq1tenant",
      requireDepixAddress: true,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/CPF\/CNPJ/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sem DEPIX_API_KEY -> mock mode (nao chama fetch)", async () => {
    delete process.env.DEPIX_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await createPixPayment(100, "deposito", "nonce-3", null);
    expect(res.success).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
