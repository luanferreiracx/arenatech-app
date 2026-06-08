import { logger } from "@/lib/logger";

export type LiquidXPixKeyType = "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "RANDOM";

export type LiquidXWithdrawResult = {
  success: boolean;
  id?: string;
  depositAddress?: string;
  depositAddressQr?: string;
  depositAmountInCents?: number;
  payoutAmountInCents?: number;
  expiration?: string;
  status?: string;
  receivedAmount?: number;
  fee?: number;
  raw?: unknown;
  error?: string;
};

export type LiquidXWithdrawStatusResult = {
  success: boolean;
  status?: string;
  raw?: Record<string, unknown>;
  error?: string;
};

type LiquidXConfig = {
  withdrawUrl: string;
  withdrawStatusUrl: string;
  apiKey: string;
};

const DEFAULT_WITHDRAW_URL = "https://liquidx.pro/api/withdraw";
const DEFAULT_WITHDRAW_STATUS_URL = "https://liquidx.pro/api/withdraw/status";

function getConfig(): LiquidXConfig | null {
  const apiKey = process.env.LIQUIDX_API_KEY;
  if (!apiKey) return null;

  const baseUrl = process.env.LIQUIDX_API_BASE_URL?.replace(/\/$/, "");
  const withdrawUrl =
    process.env.LIQUIDX_WITHDRAW_URL?.replace(/\/$/, "") ??
    (baseUrl ? `${baseUrl}/withdraw` : DEFAULT_WITHDRAW_URL);
  const withdrawStatusUrl =
    process.env.LIQUIDX_WITHDRAW_STATUS_URL?.replace(/\/$/, "") ??
    (baseUrl ? `${baseUrl}/withdraw/status` : DEFAULT_WITHDRAW_STATUS_URL);

  return { withdrawUrl, withdrawStatusUrl, apiKey };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNestedRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = record[key];
  return isRecord(value) ? value : null;
}

function unwrapLiquidXResponse(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) return {};

  const data = getNestedRecord(body, "data");
  if (data) {
    const response = getNestedRecord(data, "response");
    if (response) return response;
    return data;
  }

  const response = getNestedRecord(body, "response");
  if (response) return response;

  return body;
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

async function generateDepositAddressQr(address: string): Promise<string | undefined> {
  if (!address.trim()) return undefined;

  try {
    const QRCode = (await import("qrcode")).default;
    return await QRCode.toDataURL(address, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
    });
  } catch (error) {
    logger.error("LiquidX saque: erro ao gerar QR do depositAddress", {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

function formatPixKey(
  pixKey: string,
  pixKeyType: LiquidXPixKeyType,
): string {
  const trimmed = pixKey.trim();
  if (!trimmed) throw new Error("Chave PIX vazia");

  if (pixKeyType === "CPF") {
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length !== 11) throw new Error("CPF invalido (deve ter 11 digitos)");
    return digits;
  }

  if (pixKeyType === "CNPJ") {
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length !== 14) throw new Error("CNPJ invalido (deve ter 14 digitos)");
    return digits;
  }

  if (pixKeyType === "PHONE") {
    const digits = trimmed.replace(/\D/g, "");
    const localPhone = digits.length === 10 || digits.length === 11;
    const phoneWithCountry = (digits.length === 12 || digits.length === 13) && digits.startsWith("55");
    if (!localPhone && !phoneWithCountry) {
      throw new Error("Telefone invalido (use DDD + numero, com ou sem +55)");
    }
    return phoneWithCountry ? `+${digits}` : `+55${digits}`;
  }

  if (pixKeyType === "EMAIL") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) throw new Error("Email invalido");
    return trimmed.toLowerCase();
  }

  if (pixKeyType === "RANDOM") {
    const stripped = trimmed.replace(/-/g, "");
    if (!/^[0-9a-f]{32}$/i.test(stripped)) {
      throw new Error("Chave aleatoria invalida (deve ser UUID)");
    }
    return trimmed;
  }

  return trimmed;
}

export async function createLiquidXWithdraw(
  pixKey: string,
  pixKeyType: LiquidXPixKeyType,
  payoutAmountInCents: number,
  taxId: string,
): Promise<LiquidXWithdrawResult> {
  const config = getConfig();

  if (!config) {
    logger.warn("LiquidX saque: mock mode (LIQUIDX_API_KEY ausente)");
    return {
      success: true,
      id: `mock-liquidx-saque-${Date.now()}`,
      depositAddress: "lq1qq-mock-liquidx-address",
      payoutAmountInCents,
      depositAmountInCents: payoutAmountInCents,
      status: "pending",
    };
  }

  let pixKeyFormatted: string;
  try {
    pixKeyFormatted = formatPixKey(pixKey, pixKeyType);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Chave PIX invalida",
    };
  }

  const payload = {
    code: config.apiKey,
    pixKey: pixKeyFormatted,
    payoutAmountInCents,
  };

  logger.info("LiquidX saque: criando withdraw", {
    url: config.withdrawUrl,
    pixKeyType,
    payoutAmountInCents,
    taxIdMasked: maskTaxNumber(taxId),
  });

  try {
    const response = await fetch(config.withdrawUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45_000),
    });

    const bodyText = await response.text();
    if (!response.ok) {
      const message = parseProviderError(response.status, bodyText);
      logger.error("LiquidX saque: erro na API", {
        status: response.status,
        body: bodyText.substring(0, 500),
      });
      return { success: false, error: `Erro ao solicitar saque: ${message}` };
    }

    const body: unknown = bodyText ? JSON.parse(bodyText) : {};
    const data = unwrapLiquidXResponse(body);
    const providerSuccess = isRecord(body) ? body.success : undefined;
    const providerMessage = isRecord(body) ? readString(body, "message") : undefined;

    if (providerSuccess === false) {
      logger.error("LiquidX saque: resposta sem sucesso", { body });
      return { success: false, error: providerMessage ?? "LiquidX recusou o saque" };
    }

    const id = readString(data, "id");
    if (!id) {
      logger.error("LiquidX saque: sem id", { body });
      return { success: false, error: "Resposta invalida: sem id" };
    }

    const depositAddress = readString(data, "depositAddress");
    const depositAmountInCents = readNumber(data, "depositAmountInCents");
    const returnedPayoutAmountInCents = readNumber(data, "payoutAmountInCents");
    const receivedAmount = returnedPayoutAmountInCents != null ? returnedPayoutAmountInCents / 100 : undefined;
    const fee =
      depositAmountInCents != null && returnedPayoutAmountInCents != null
        ? (depositAmountInCents - returnedPayoutAmountInCents) / 100
        : undefined;

    return {
      success: true,
      id,
      depositAddress,
      depositAddressQr: depositAddress ? await generateDepositAddressQr(depositAddress) : undefined,
      depositAmountInCents,
      payoutAmountInCents: returnedPayoutAmountInCents,
      expiration: readString(data, "expiration"),
      status: readString(data, "status") ?? "pending",
      receivedAmount,
      fee,
      raw: body,
    };
  } catch (error) {
    logger.error("LiquidX saque: erro de rede", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao solicitar saque",
    };
  }
}

export async function getLiquidXWithdrawStatus(
  withdrawId: string,
): Promise<LiquidXWithdrawStatusResult> {
  const config = getConfig();
  if (!config || withdrawId.startsWith("mock-liquidx-saque-")) {
    return { success: true, status: "pending" };
  }

  try {
    const searchParams = new URLSearchParams({ id: withdrawId });
    const response = await fetch(`${config.withdrawStatusUrl}?${searchParams.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });

    const bodyText = await response.text();
    if (!response.ok) {
      logger.warn("LiquidX saque: erro ao consultar status", {
        withdrawId,
        httpStatus: response.status,
        body: bodyText.substring(0, 300),
      });
      return { success: false, error: parseProviderError(response.status, bodyText) };
    }

    const body: unknown = bodyText ? JSON.parse(bodyText) : {};
    const data = unwrapLiquidXResponse(body);
    return {
      success: true,
      status: readString(data, "status") ?? "pending",
      raw: data,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao consultar status",
    };
  }
}
