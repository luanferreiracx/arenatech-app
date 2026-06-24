import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createInfinitepayCheckout,
  checkInfinitepayPayment,
  normalizeInfinitepayHandle,
  infinitepayWebhookSchema,
  buildInfinitepayPrefill,
  formatCep,
} from "@/lib/services/infinitepay-service";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function okJson(body: unknown) {
  return { ok: true, status: 200, text: async () => JSON.stringify(body) };
}

describe("normalizeInfinitepayHandle", () => {
  it("remove $, espacos e deixa minusculo", () => {
    expect(normalizeInfinitepayHandle("  $ArenaTech ")).toBe("arenatech");
    expect(normalizeInfinitepayHandle("arenatechthe")).toBe("arenatechthe");
  });
});

describe("createInfinitepayCheckout", () => {
  beforeEach(() => mockFetch.mockReset());

  it("envia payload correto e retorna a url", async () => {
    mockFetch.mockResolvedValueOnce(
      okJson({ url: "https://checkout.infinitepay.io/arenatechthe?lenc=abc" }),
    );

    const res = await createInfinitepayCheckout({
      handle: "$ArenaTechThe",
      orderNsu: "sale-123",
      items: [{ quantity: 1, price: 1000, description: "Venda V-1" }],
      webhookUrl: "https://app.example.com/api/webhooks/infinitepay",
    });

    expect(res.url).toContain("checkout.infinitepay.io");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://api.checkout.infinitepay.io/links");
    const sent = JSON.parse((init as RequestInit).body as string);
    // handle normalizado (sem $, minusculo)
    expect(sent.handle).toBe("arenatechthe");
    expect(sent.order_nsu).toBe("sale-123");
    expect(sent.items[0].price).toBe(1000);
    expect(sent.webhook_url).toBe("https://app.example.com/api/webhooks/infinitepay");
  });

  it("lanca quando handle vazio", async () => {
    await expect(
      createInfinitepayCheckout({
        handle: "  ",
        orderNsu: "s",
        items: [{ quantity: 1, price: 1, description: "x" }],
        webhookUrl: "https://x",
      }),
    ).rejects.toThrow(/handle/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("lanca quando sem itens", async () => {
    await expect(
      createInfinitepayCheckout({
        handle: "tag",
        orderNsu: "s",
        items: [],
        webhookUrl: "https://x",
      }),
    ).rejects.toThrow(/item/i);
  });

  it("lanca quando resposta nao tem url", async () => {
    mockFetch.mockResolvedValueOnce(okJson({ foo: "bar" }));
    await expect(
      createInfinitepayCheckout({
        handle: "tag",
        orderNsu: "s",
        items: [{ quantity: 1, price: 1, description: "x" }],
        webhookUrl: "https://x",
      }),
    ).rejects.toThrow(/link/i);
  });

  it("lanca em erro HTTP", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422, text: async () => "bad" });
    await expect(
      createInfinitepayCheckout({
        handle: "tag",
        orderNsu: "s",
        items: [{ quantity: 1, price: 1, description: "x" }],
        webhookUrl: "https://x",
      }),
    ).rejects.toThrow(/422/);
  });
});

describe("checkInfinitepayPayment", () => {
  beforeEach(() => mockFetch.mockReset());

  it("mapeia a resposta do payment_check", async () => {
    mockFetch.mockResolvedValueOnce(
      okJson({
        success: true,
        paid: true,
        amount: 1500,
        paid_amount: 1510,
        installments: 1,
        capture_method: "pix",
      }),
    );

    const res = await checkInfinitepayPayment({
      handle: "arenatechthe",
      orderNsu: "sale-1",
      transactionNsu: "tx-1",
      slug: "slug-1",
    });

    expect(res).toEqual({
      success: true,
      paid: true,
      amountCents: 1500,
      paidAmountCents: 1510,
      installments: 1,
      captureMethod: "pix",
    });
  });

  it("aceita capture_method credit_card", async () => {
    mockFetch.mockResolvedValueOnce(
      okJson({
        success: true,
        paid: false,
        amount: 1000,
        paid_amount: 0,
        installments: 3,
        capture_method: "credit_card",
      }),
    );
    const res = await checkInfinitepayPayment({
      handle: "tag",
      orderNsu: "s",
      transactionNsu: "t",
      slug: "x",
    });
    expect(res.captureMethod).toBe("credit_card");
    expect(res.paid).toBe(false);
  });
});

describe("formatCep", () => {
  it("retorna 8 digitos sem mascara", () => {
    expect(formatCep("64000-000")).toBe("64000000");
  });
  it("undefined quando invalido", () => {
    expect(formatCep("640")).toBeUndefined();
    expect(formatCep(null)).toBeUndefined();
  });
});

describe("buildInfinitepayPrefill", () => {
  const store = {
    name: "Arena Tech",
    email: "loja@arenatech.com.br",
    phone: "8632000000",
    zipCode: "64000-000",
    street: "Av. Principal",
    streetNumber: "100",
    complement: "Loja 1",
    neighborhood: "Centro",
    city: "Teresina",
    state: "PI",
  };

  it("usa SO o endereco da loja quando nao ha cliente (identidade da loja nunca)", () => {
    const out = buildInfinitepayPrefill({ store });
    // Sem cliente real, nao ha identidade: a da loja dispara codigo de login.
    expect(out.customer).toBeUndefined();
    expect(out.address).toEqual({
      cep: "64000000",
      street: "Av. Principal",
      neighborhood: "Centro",
      number: "100",
      complement: "Loja 1",
      city: "Teresina",
      state: "PI",
    });
  });

  it("nunca usa nome/email da loja como identidade do comprador", () => {
    const out = buildInfinitepayPrefill({
      customer: { name: "Joao", email: null },
      store,
    });
    expect(out.customer?.name).toBe("Joao");
    // email NAO cai para a loja — fica vazio em vez de vazar o email da conta.
    expect(out.customer).not.toHaveProperty("email");
    // Telefone nunca e enviado (o tipo PrefillParty nem aceita).
    expect(out.customer).not.toHaveProperty("phoneNumber");
    // Endereco continua vindo da loja.
    expect(out.address?.cep).toBe("64000000");
  });

  it("envia identidade completa quando o cliente real tem nome+email", () => {
    const out = buildInfinitepayPrefill({
      customer: { name: "Joao", email: "joao@cliente.com" },
      store,
    });
    expect(out.customer).toEqual({ name: "Joao", email: "joao@cliente.com" });
  });

  it("omite address quando nao ha CEP+rua em lugar nenhum", () => {
    const out = buildInfinitepayPrefill({
      customer: { name: "Maria" },
      store: { name: "Loja", email: "x@y.com" },
    });
    expect(out.address).toBeUndefined();
    expect(out.customer?.name).toBe("Maria");
  });

  it("limita o complemento longo para nao travar o checkout", () => {
    const out = buildInfinitepayPrefill({
      store: {
        ...store,
        complement: "x".repeat(500), // lixo de migracao
      },
    });
    expect((out.address?.complement ?? "").length).toBeLessThanOrEqual(40);
  });
});

describe("infinitepayWebhookSchema", () => {
  it("aceita payload valido", () => {
    const parsed = infinitepayWebhookSchema.safeParse({
      invoice_slug: "abc123",
      amount: 1000,
      paid_amount: 1010,
      installments: 1,
      capture_method: "credit_card",
      transaction_nsu: "uuid-tx",
      order_nsu: "uuid-order",
      receipt_url: "https://comprovante.com/123",
      items: [],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejeita sem order_nsu/transaction_nsu/slug", () => {
    expect(infinitepayWebhookSchema.safeParse({ amount: 1 }).success).toBe(false);
  });
});
