/**
 * createPixPayment (POST /deposit): trava o corpo enviado a Eulen. Garante que
 * `whitelist` so vai quando DEPIX_QRCODE_WHITELIST_ENABLED=true (a permissao
 * qrcodewhitelist precisa estar habilitada no parceiro; senao a Eulen rejeita),
 * e que o `endUserTaxNumber` (CPF/CNPJ) vai quando presente. `fetch` mockado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPixPayment } from "@/lib/services/depix-service";

const ORIGINAL_KEY = process.env.DEPIX_API_KEY;
const ORIGINAL_WHITELIST = process.env.DEPIX_QRCODE_WHITELIST_ENABLED;

function lastFetchBody(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const call = spy.mock.calls[0]!;
  const init = call[1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

beforeEach(() => {
  process.env.DEPIX_API_KEY = "jwt-test";
  delete process.env.DEPIX_QRCODE_WHITELIST_ENABLED;
  vi.restoreAllMocks();
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.DEPIX_API_KEY;
  else process.env.DEPIX_API_KEY = ORIGINAL_KEY;
  if (ORIGINAL_WHITELIST === undefined) delete process.env.DEPIX_QRCODE_WHITELIST_ENABLED;
  else process.env.DEPIX_QRCODE_WHITELIST_ENABLED = ORIGINAL_WHITELIST;
});

describe("createPixPayment — payload do POST /deposit", () => {
  it("por padrao NAO envia whitelist; manda o CPF como endUserTaxNumber", async () => {
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
    // whitelist so vai com a env ligada (permissao habilitada no parceiro).
    expect(body).not.toHaveProperty("whitelist");
    expect(body.endUserTaxNumber).toBe("12345678909");
    expect(body.amountInCents).toBe(100000);
    expect(body.depixAddress).toBe("lq1tenant");
  });

  it("com DEPIX_QRCODE_WHITELIST_ENABLED=true envia whitelist:true (libera > R$500)", async () => {
    process.env.DEPIX_QRCODE_WHITELIST_ENABLED = "true";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ response: { id: "qr-1", qrCopyPaste: "00020...", qrImageUrl: "" } }), {
        status: 200,
      }),
    );

    const res = await createPixPayment(1200, "deposito", "nonce-wl", "12345678909", {
      depixAddress: "lq1tenant",
      requireDepixAddress: true,
    });

    expect(res.success).toBe(true);
    const body = lastFetchBody(fetchSpy);
    expect(body.whitelist).toBe(true);
    expect(body.endUserTaxNumber).toBe("12345678909");
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

/**
 * REGRESSAO (2026-08-01): a Eulen passou a exigir uma janela minima de atraso
 * PIX->DePix do nosso parceiro. Sem `delayDepixInHours` ela responde 520 e
 * NENHUM PIX e gerado — o PDV quebrou inteiro (uma venda de R$4.499,99 nao
 * conseguiu cobrar). Estes testes travam o parametro no corpo.
 */
describe("createPixPayment — delayDepixInHours (exigido pela Eulen)", () => {
  const ORIGINAL_DELAY = process.env.DEPIX_DELAY_HOURS;

  afterEach(() => {
    if (ORIGINAL_DELAY === undefined) delete process.env.DEPIX_DELAY_HOURS;
    else process.env.DEPIX_DELAY_HOURS = ORIGINAL_DELAY;
  });

  async function bodyOf(): Promise<Record<string, unknown>> {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ response: { id: "qr-d", qrCopyPaste: "0002", qrImageUrl: "" } }), {
        status: 200,
      }),
    );
    const res = await createPixPayment(1000, "deposito", "nonce-delay", "12345678909", {
      depixAddress: "lq1tenant",
      requireDepixAddress: true,
    });
    expect(res.success).toBe(true);
    return lastFetchBody(fetchSpy);
  }

  it("envia sempre, com o minimo de 24h do parceiro por padrao", async () => {
    delete process.env.DEPIX_DELAY_HOURS;
    expect((await bodyOf()).delayDepixInHours).toBe(24);
  });

  it("respeita DEPIX_DELAY_HOURS quando dentro da faixa 1..720 da Eulen", async () => {
    process.env.DEPIX_DELAY_HOURS = "48";
    expect((await bodyOf()).delayDepixInHours).toBe(48);
  });

  // Valor invalido nao pode virar payload invalido: cairia no mesmo 520 que
  // quebrou a producao. Cai no default.
  it.each(["0", "721", "abc", "24.5", ""])(
    "DEPIX_DELAY_HOURS=%s (invalido) volta pro default de 24",
    async (value) => {
      process.env.DEPIX_DELAY_HOURS = value;
      expect((await bodyOf()).delayDepixInHours).toBe(24);
    },
  );
});
