import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "@/lib/logger";
import type { DepixCreateResult, DepixStatusResult } from "@/lib/services/depix-service";

type OrionConfig = {
  apiKey: string;
  baseUrl: string;
  pixEndpoint: string;
  defaultName: string;
  defaultEmail: string;
};

export type OrionWebhookVerificationResult =
  | { success: true; event: string | null; delivery: string | null }
  | { success: false; error: string };

const DEFAULT_BASE_URL = "https://payapi.orion.moe";
const DEFAULT_PIX_ENDPOINT = "/api/v1/pix/personal";
const DEFAULT_PAYER_NAME = "Cliente Arena Tech";
const DEFAULT_PAYER_EMAIL = "pagador@arenatechpi.com.br";

function getConfig(): OrionConfig | null {
  const apiKey = process.env.ORION_PAY_API_KEY;
  if (!apiKey) return null;

  return {
    apiKey,
    baseUrl: process.env.ORION_PAY_API_BASE_URL?.replace(/\/$/, "") ?? DEFAULT_BASE_URL,
    pixEndpoint: process.env.ORION_PAY_PIX_ENDPOINT ?? DEFAULT_PIX_ENDPOINT,
    defaultName: process.env.ORION_PAY_DEFAULT_PAYER_NAME ?? DEFAULT_PAYER_NAME,
    defaultEmail: process.env.ORION_PAY_DEFAULT_PAYER_EMAIL ?? DEFAULT_PAYER_EMAIL,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function maskTaxNumber(doc: string): string {
  const digits = doc.replace(/\D/g, "");
  if (digits.length < 5) return "***";
  return `${digits.slice(0, 3)}${"*".repeat(digits.length - 5)}${digits.slice(-2)}`;
}

function fullUrl(config: OrionConfig, endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  return `${config.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
}

function parseProviderError(status: number, bodyText: string): string {
  let fallback = `HTTP ${status}`;
  if (!bodyText.trim()) return fallback;

  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (!isRecord(parsed)) return `${fallback}: ${bodyText.substring(0, 200)}`;
    const message = readString(parsed, "message") ?? readString(parsed, "error");
    return message ?? fallback;
  } catch {
    fallback = `${fallback}: ${bodyText.substring(0, 200)}`;
  }

  return fallback;
}

function normalizeOrionStatus(rawStatus: string | undefined, paid?: boolean): DepixStatusResult["status"] {
  const raw = rawStatus?.toLowerCase();
  if (paid || raw === "paid" || raw === "payment.success" || raw === "success") return "paid";
  if (raw === "expired" || raw === "payment.expired") return "expired";
  if (raw === "failed" || raw === "payment.failed" || raw === "cancelled" || raw === "canceled") return "failed";
  if (raw === "refunded" || raw === "payment.refunded_med") return "refunded";
  return "pending";
}

function extractPixData(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) return {};
  const data = body.data;
  if (isRecord(data)) return data;
  const payment = body.payment;
  if (isRecord(payment)) return payment;
  const response = body.response;
  if (isRecord(response)) return response;
  return body;
}

export async function createOrionPixPayment(
  amountReais: number,
  description: string,
  referenceId: string,
  taxNumber?: string | null,
  options?: { payerName?: string | null; payerEmail?: string | null; payerPhone?: string | null },
): Promise<DepixCreateResult> {
  const config = getConfig();
  if (!config) {
    logger.warn("Orion Pay: mock mode (ORION_PAY_API_KEY ausente)", {
      amount: amountReais,
      description,
    });
    return {
      success: true,
      transactionId: `mock-orion-${Date.now()}`,
      qrCode: "00020126580014br.gov.bcb.pix0136mock-orion-pix-key-12345678901234567890",
      qrCodeBase64: "",
      pixKey: "mock@orion.pay",
    };
  }

  const cpf = taxNumber?.replace(/\D/g, "") || undefined;
  const phone = options?.payerPhone?.replace(/\D/g, "") || undefined;
  const payload: Record<string, string | number> = {
    name: options?.payerName?.trim() || config.defaultName,
    email: options?.payerEmail?.trim() || config.defaultEmail,
    amount: Number(amountReais.toFixed(2)),
    description,
  };
  if (cpf) payload.cpf = cpf;
  if (phone) payload.phone = phone;

  logger.info("Orion Pay: criando PIX", {
    url: fullUrl(config, config.pixEndpoint),
    amountReais,
    referenceId,
    hasCpf: !!cpf,
    cpfMasked: cpf ? maskTaxNumber(cpf) : undefined,
    hasPhone: !!phone,
  });

  try {
    const response = await fetch(fullUrl(config, config.pixEndpoint), {
      method: "POST",
      headers: {
        "X-API-Key": config.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45_000),
    });

    const bodyText = await response.text();
    if (!response.ok) {
      const message = parseProviderError(response.status, bodyText);
      logger.error("Orion Pay: erro ao criar PIX", {
        status: response.status,
        body: bodyText.substring(0, 500),
      });
      return { success: false, error: `Erro ao gerar PIX: ${message}` };
    }

    const body: unknown = bodyText ? JSON.parse(bodyText) : {};
    const data = extractPixData(body);
    const id =
      readString(data, "transactionId") ??
      readString(data, "eulenDepositId") ??
      readString(data, "purchaseId") ??
      readString(data, "id");

    if (!id) {
      logger.error("Orion Pay: resposta sem transactionId", { body });
      return { success: false, error: "Resposta invalida da API PIX: sem id" };
    }

    const qrCode = readString(data, "qrCode") ?? readString(data, "pixCode") ?? "";
    const qrImage = readString(data, "qrCodeImage") ?? readString(data, "qrImageUrl") ?? "";
    const qrCodeLooksLikeImageUrl = /^https?:\/\//i.test(qrCode);

    return {
      success: true,
      transactionId: id,
      qrCode: qrCodeLooksLikeImageUrl ? (readString(data, "pixCode") ?? "") : qrCode,
      qrCodeBase64: qrImage || (qrCodeLooksLikeImageUrl ? qrCode : ""),
      pixKey: readString(data, "pixKey") ?? "",
    };
  } catch (error) {
    logger.error("Orion Pay: erro de rede", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao gerar PIX",
    };
  }
}

export async function getOrionPixStatus(transactionId: string): Promise<DepixStatusResult> {
  const config = getConfig();
  if (!config || transactionId.startsWith("mock-orion-")) {
    return { success: true, status: "pending", isFinal: false };
  }

  try {
    const response = await fetch(
      `${config.baseUrl}/api/v1/pix/status/${encodeURIComponent(transactionId)}`,
      {
        method: "GET",
        headers: {
          "X-API-Key": config.apiKey,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(30_000),
      },
    );

    const bodyText = await response.text();
    if (!response.ok) {
      return { success: false, error: parseProviderError(response.status, bodyText) };
    }

    const body: unknown = bodyText ? JSON.parse(bodyText) : {};
    const data = extractPixData(body);
    const status = normalizeOrionStatus(readString(data, "status"), data.paid === true);
    return { success: true, status, isFinal: status !== "pending" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao consultar PIX",
    };
  }
}

export function verifyOrionWebhookSignature(
  rawBody: string,
  signature: string | null,
  event: string | null,
  delivery: string | null,
): OrionWebhookVerificationResult {
  const secret = process.env.ORION_PAY_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return { success: false, error: "Webhook Orion sem secret configurado" };
    }
    logger.warn("Orion Pay webhook: sem ORION_PAY_WEBHOOK_SECRET — processando sem auth (dev mode)");
    return { success: true, event, delivery };
  }

  const provided = signature?.replace(/^sha256=/i, "") ?? "";
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const valid =
    provided.length === expected.length &&
    provided.length > 0 &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

  if (!valid) return { success: false, error: "Assinatura Orion invalida" };
  return { success: true, event, delivery };
}

export function extractOrionTransactionId(payload: unknown): string {
  if (!isRecord(payload)) return "";
  const data = extractPixData(payload);
  return String(
    readString(data, "transactionId") ??
      readString(data, "eulenDepositId") ??
      readString(data, "purchaseId") ??
      readString(data, "id") ??
      readString(payload, "transactionId") ??
      readString(payload, "eulenDepositId") ??
      readString(payload, "purchaseId") ??
      readString(payload, "id") ??
      "",
  );
}

export function normalizeOrionWebhookStatus(event: string | null, payload: unknown): DepixStatusResult["status"] {
  const data = extractPixData(payload);
  return normalizeOrionStatus(event ?? readString(data, "status"), data.paid === true);
}

export function extractOrionPaidAmountCents(payload: unknown): number | undefined {
  const data = extractPixData(payload);
  const amount = readNumber(data, "amount");
  if (amount == null) return undefined;
  return Math.round(amount * 100);
}
