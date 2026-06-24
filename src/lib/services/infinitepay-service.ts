import { z } from "zod";
import { logger } from "@/lib/logger";

/**
 * Cliente da API de Checkout da InfinitePay.
 *
 * Doc: https://www.infinitepay.io/checkout-documentacao
 *
 * Modelo (confirmado contra a API real):
 * - Autenticacao: NAO ha API key/token. A unica credencial e o `handle`
 *   (InfiniteTag do lojista, sem o `$`). O dinheiro cai na conta desse handle,
 *   entao gerar link e "publico"; o risco esta na CONFIRMACAO. Por isso todo
 *   pagamento e revalidado via `/payment_check` antes de ser aceito (o webhook
 *   nao tem assinatura — ver `src/app/api/webhooks/infinitepay`).
 * - `POST /links` cria um link de checkout HOSPEDADO e retorna `{ url }`. A
 *   pagina aceita PIX e cartao (nao da pra forcar so PIX); o meio real vem em
 *   `capture_method` na confirmacao.
 * - `POST /payment_check` confirma um pagamento (precisa de `transaction_nsu` +
 *   `slug`, que so existem APOS o pagamento — chegam pelo webhook).
 *
 * Valores sempre em CENTAVOS (R$ 10,00 = 1000).
 */

const INFINITEPAY_BASE_URL = "https://api.checkout.infinitepay.io";
const REQUEST_TIMEOUT_MS = 15_000;

export type InfinitepayCaptureMethod = "pix" | "credit_card";

export type InfinitepayCheckoutItem = {
  quantity: number;
  /** Preco unitario em centavos. */
  price: number;
  description: string;
};

export type InfinitepayCustomer = {
  name?: string;
  email?: string;
  phoneNumber?: string;
};

export type InfinitepayAddress = {
  cep?: string;
  street?: string;
  neighborhood?: string;
  number?: string;
  complement?: string;
  city?: string;
  state?: string;
};

export type CreateInfinitepayCheckoutInput = {
  /** InfiniteTag do lojista, sem o `$`. */
  handle: string;
  /** Identificador do pedido no nosso sistema (usamos o id da venda). */
  orderNsu: string;
  items: InfinitepayCheckoutItem[];
  /** URL que recebe o webhook de pagamento aprovado. */
  webhookUrl: string;
  /** URL de sucesso (para onde o cliente volta apos pagar). Opcional. */
  redirectUrl?: string;
  /**
   * Dados do comprador pre-preenchidos no checkout. Enviar isso evita que a
   * pagina hospedada peca nome/email/telefone antes do PIX (gargalo no balcao).
   */
  customer?: InfinitepayCustomer;
  /** Endereco pre-preenchido — idem: evita o formulario de endereco no checkout. */
  address?: InfinitepayAddress;
};

const createLinkResponseSchema = z.object({
  url: z.string().url(),
});

export type CheckInfinitepayPaymentInput = {
  handle: string;
  orderNsu: string;
  transactionNsu: string;
  slug: string;
};

const paymentCheckResponseSchema = z.object({
  success: z.boolean(),
  paid: z.boolean(),
  /** Valor esperado em centavos. */
  amount: z.number().int().nonnegative(),
  /** Valor efetivamente pago em centavos (pode diferir por acrescimo). */
  paid_amount: z.number().int().nonnegative(),
  installments: z.number().int().positive(),
  capture_method: z.enum(["pix", "credit_card"]),
});

export type InfinitepayPaymentCheck = {
  success: boolean;
  paid: boolean;
  amountCents: number;
  paidAmountCents: number;
  installments: number;
  captureMethod: InfinitepayCaptureMethod;
};

async function postJson(path: string, body: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${INFINITEPAY_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      logger.error("InfinitePay: HTTP error", { path, status: res.status, body: text.slice(0, 500) });
      throw new Error(`InfinitePay respondeu ${res.status}`);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      logger.error("InfinitePay: resposta nao-JSON", { path, body: text.slice(0, 500) });
      throw new Error("Resposta invalida da InfinitePay");
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      logger.error("InfinitePay: timeout", { path });
      throw new Error("InfinitePay nao respondeu a tempo");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/** Normaliza o handle: remove `$`, espacos e deixa minusculo. */
export function normalizeInfinitepayHandle(raw: string): string {
  return raw.trim().replace(/^\$/, "").toLowerCase();
}

/**
 * Cria um link de checkout. Retorna a URL hospedada (PIX + cartao).
 * Paridade conceitual com `gerarPixDepix`, mas a InfinitePay devolve um link,
 * nao um QR cru — o QR e gerado a partir dessa URL no frontend.
 */
export async function createInfinitepayCheckout(
  input: CreateInfinitepayCheckoutInput,
): Promise<{ url: string }> {
  const handle = normalizeInfinitepayHandle(input.handle);
  if (!handle) throw new Error("InfiniteTag (handle) nao configurada.");
  if (input.items.length === 0) throw new Error("Checkout precisa de ao menos 1 item.");

  const payload = {
    handle,
    order_nsu: input.orderNsu,
    items: input.items.map((i) => ({
      quantity: i.quantity,
      price: i.price,
      description: i.description,
    })),
    webhook_url: input.webhookUrl,
    ...(input.redirectUrl ? { redirect_url: input.redirectUrl } : {}),
    ...(input.customer
      ? {
          customer: {
            ...(input.customer.name ? { name: input.customer.name } : {}),
            ...(input.customer.email ? { email: input.customer.email } : {}),
            ...(input.customer.phoneNumber ? { phone_number: input.customer.phoneNumber } : {}),
          },
        }
      : {}),
    ...(input.address
      ? {
          address: {
            ...(input.address.cep ? { cep: input.address.cep } : {}),
            ...(input.address.street ? { street: input.address.street } : {}),
            ...(input.address.neighborhood ? { neighborhood: input.address.neighborhood } : {}),
            ...(input.address.number ? { number: input.address.number } : {}),
            ...(input.address.complement ? { complement: input.address.complement } : {}),
            ...(input.address.city ? { city: input.address.city } : {}),
            ...(input.address.state ? { state: input.address.state } : {}),
          },
        }
      : {}),
  };

  const raw = await postJson("/links", payload);
  const parsed = createLinkResponseSchema.safeParse(raw);
  if (!parsed.success) {
    logger.error("InfinitePay: /links resposta inesperada", { raw });
    throw new Error("InfinitePay nao retornou o link de checkout.");
  }
  logger.info("InfinitePay: link criado", { orderNsu: input.orderNsu });
  return { url: parsed.data.url };
}

/**
 * Confirma um pagamento via `/payment_check`. Fonte de verdade da liquidacao —
 * usado pelo webhook (que nao tem assinatura) e como guarda no finalize.
 */
export async function checkInfinitepayPayment(
  input: CheckInfinitepayPaymentInput,
): Promise<InfinitepayPaymentCheck> {
  const handle = normalizeInfinitepayHandle(input.handle);
  const raw = await postJson("/payment_check", {
    handle,
    order_nsu: input.orderNsu,
    transaction_nsu: input.transactionNsu,
    slug: input.slug,
  });
  const parsed = paymentCheckResponseSchema.safeParse(raw);
  if (!parsed.success) {
    logger.error("InfinitePay: /payment_check resposta inesperada", { raw });
    throw new Error("Resposta invalida do payment_check da InfinitePay.");
  }
  return {
    success: parsed.data.success,
    paid: parsed.data.paid,
    amountCents: parsed.data.amount,
    paidAmountCents: parsed.data.paid_amount,
    installments: parsed.data.installments,
    captureMethod: parsed.data.capture_method,
  };
}

/** So digitos do CEP (InfinitePay usa 8 digitos sem mascara). */
export function formatCep(raw: string | null | undefined): string | undefined {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length === 8 ? digits : undefined;
}

type PrefillParty = {
  name?: string | null;
  email?: string | null;
  zipCode?: string | null;
  street?: string | null;
  streetNumber?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
};

const firstNonEmpty = (...vals: (string | null | undefined)[]): string | undefined => {
  for (const v of vals) {
    const t = (v ?? "").trim();
    if (t) return t;
  }
  return undefined;
};

/**
 * Monta `customer` + `address` pre-preenchidos para o checkout, com fallback:
 * cliente da venda > dados da loja. Objetivo: o cliente de balcao nao precisar
 * digitar email/endereco para pagar PIX. So inclui `address` quando ha CEP +
 * rua (parcial nao adianta — a pagina pediria o resto).
 *
 * NAO enviamos `phone_number`: a InfinitePay reconhece um numero ligado a uma
 * conta dela e dispara um codigo de login/confirmacao para esse numero (a
 * InfiniteTag da loja sempre bate; o do cliente pode bater), travando o PIX no
 * balcao. O telefone e opcional na API — sem ele, a pagina gera o QR direto.
 */
export function buildInfinitepayPrefill(input: {
  customer?: PrefillParty | null;
  store?: PrefillParty | null;
  /** Email padrao configurado na integracao — cobre a loja sem email cadastrado. */
  defaultEmail?: string | null;
}): { customer?: InfinitepayCustomer; address?: InfinitepayAddress } {
  const c = input.customer ?? null;
  const s = input.store ?? null;

  const name = firstNonEmpty(c?.name, s?.name);
  const email = firstNonEmpty(c?.email, s?.email, input.defaultEmail);

  const customer: InfinitepayCustomer = {
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
  };

  const cep = formatCep(firstNonEmpty(c?.zipCode, s?.zipCode));
  const street = firstNonEmpty(c?.street, s?.street);
  const neighborhood = firstNonEmpty(c?.neighborhood, s?.neighborhood);
  const number = firstNonEmpty(c?.streetNumber, s?.streetNumber);
  const complement = firstNonEmpty(c?.complement, s?.complement);
  const city = firstNonEmpty(c?.city, s?.city);
  const state = firstNonEmpty(c?.state, s?.state);

  // Limita o tamanho de cada campo — o checkout da InfinitePay rejeita valores
  // longos demais (ex.: complemento com lixo de migracao trava o pagamento).
  const clamp = (v: string | undefined, max: number): string | undefined =>
    v ? v.slice(0, max) : v;

  const hasUsableAddress = !!cep && !!street;
  const address: InfinitepayAddress | undefined = hasUsableAddress
    ? {
        cep,
        street: clamp(street, 100)!,
        ...(neighborhood ? { neighborhood: clamp(neighborhood, 60) } : {}),
        ...(number ? { number: clamp(number, 15) } : {}),
        ...(complement ? { complement: clamp(complement, 40) } : {}),
        ...(city ? { city: clamp(city, 60) } : {}),
        ...(state ? { state: clamp(state, 2) } : {}),
      }
    : undefined;

  return {
    ...(Object.keys(customer).length > 0 ? { customer } : {}),
    ...(address ? { address } : {}),
  };
}

/** Payload do webhook de pagamento aprovado (sem assinatura — revalidar). */
export const infinitepayWebhookSchema = z.object({
  invoice_slug: z.string().min(1),
  amount: z.number().int().nonnegative().optional(),
  paid_amount: z.number().int().nonnegative().optional(),
  installments: z.number().int().positive().optional(),
  capture_method: z.enum(["pix", "credit_card"]).optional(),
  transaction_nsu: z.string().min(1),
  order_nsu: z.string().min(1),
  receipt_url: z.string().optional(),
  items: z.array(z.unknown()).optional(),
});

export type InfinitepayWebhookPayload = z.infer<typeof infinitepayWebhookSchema>;
