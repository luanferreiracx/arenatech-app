/**
 * Depix (PixPay) integration for PIX QR code generation.
 *
 * Paridade Laravel app/Services/DepixService.php — usa Bearer token (`DEPIX_API_KEY`)
 * + endereco Liquid da loja (`DEPIX_ADDRESS`) para receber. Nao usa merchant_id.
 *
 * Endpoints (config via env):
 *   - DEPIX_API_URL          (default https://api.pixpay.space/v1/deposit) — POST cria pix
 *   - DEPIX_DEPOSIT_STATUS_URL (default https://api.pixpay.space/v1/deposit-status) — POST consulta
 *
 * Quando DEPIX_API_KEY nao configurada, retorna mock para desenvolvimento.
 */

import { logger } from "@/lib/logger";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface DepixCreateResult {
  success: boolean;
  transactionId?: string;
  qrCode?: string;
  qrCodeBase64?: string;
  pixKey?: string;
  error?: string;
}

export interface DepixCancelResult {
  success: boolean;
  error?: string;
}

export interface DepixStatusResult {
  success: boolean;
  /** Status normalizado: "pending" | "paid" | "expired" | "failed" | "refunded" */
  status?: "pending" | "paid" | "expired" | "failed" | "refunded";
  /** Status final (true) significa que nao vai mais mudar. */
  isFinal?: boolean;
  error?: string;
}

interface DepixConfig {
  /** Endpoint completo do POST de criacao (ex.: https://api.pixpay.space/v1/deposit) */
  depositUrl: string;
  /** Endpoint completo do POST de consulta de status */
  statusUrl: string;
  /** Bearer token da API */
  apiKey: string;
  /** Carteira Liquid onde a loja recebe o DEPIX */
  depixAddress?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────────────────────────────

function getConfig(): DepixConfig | null {
  const apiKey = process.env.DEPIX_API_KEY;
  if (!apiKey) return null;

  const depositUrl =
    process.env.DEPIX_API_URL?.replace(/\/$/, "") ??
    "https://api.pixpay.space/v1/deposit";
  const statusUrl =
    process.env.DEPIX_DEPOSIT_STATUS_URL?.replace(/\/$/, "") ??
    depositUrl.replace(/\/deposit$/, "/deposit-status");

  return {
    depositUrl,
    statusUrl,
    apiKey,
    depixAddress: process.env.DEPIX_ADDRESS,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Gera um QR Code PIX para um valor em reais. Paridade Laravel chamarDeposit().
 *
 * @param amountReais valor em reais (float).
 * @param description descricao (nao enviado a API, apenas para log).
 * @param referenceId id local (nao enviado a API).
 * @param taxNumber CPF/CNPJ do pagador — recomendado pela API para evitar
 *   pagamento por terceiros (anti-fraude).
 */
export async function createPixPayment(
  amountReais: number,
  description: string,
  referenceId: string,
  taxNumber?: string | null,
): Promise<DepixCreateResult> {
  const config = getConfig();

  if (!config) {
    logger.warn("Depix: mock mode (DEPIX_API_KEY ausente)", {
      amount: amountReais,
      description,
    });
    return {
      success: true,
      transactionId: `mock-depix-${Date.now()}`,
      qrCode: "00020126580014br.gov.bcb.pix0136mock-pix-key-12345678901234567890",
      qrCodeBase64: "",
      pixKey: "mock@pix.key",
    };
  }

  const amountInCents = Math.round(amountReais * 100);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: Record<string, any> = { amountInCents };

  if (taxNumber) {
    payload.endUserTaxNumber = taxNumber.replace(/\D/g, "");
  }
  if (config.depixAddress) {
    payload.depixAddress = config.depixAddress;
  }

  logger.info("Depix: criando deposit", {
    url: config.depositUrl,
    amountInCents,
    hasEndUserTax: !!payload.endUserTaxNumber,
    hasDepixAddr: !!payload.depixAddress,
    referenceId,
  });

  try {
    const response = await fetch(config.depositUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error("Depix: erro no deposit", {
        status: response.status,
        body: body.substring(0, 500),
      });
      // tenta extrair mensagem JSON
      let msg = `HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(body) as { message?: string; error?: string };
        msg = parsed.message ?? parsed.error ?? msg;
      } catch {
        msg = `${msg}: ${body.substring(0, 200)}`;
      }
      return { success: false, error: `Erro ao gerar PIX: ${msg}` };
    }

    const body = (await response.json()) as Record<string, unknown>;
    // PixPay retorna `response` aninhado ou raiz, igual ao Laravel
    const data = (body.response ?? body) as Record<string, unknown>;
    const id = data.id ?? body.id;

    if (!id) {
      logger.error("Depix: resposta sem id", { body });
      const erroApi =
        (body.error as string | undefined) ??
        (data.error as string | undefined) ??
        (body.message as string | undefined);
      return {
        success: false,
        error: erroApi
          ? `Erro da API PIX: ${erroApi}`
          : "Resposta invalida da API PIX: sem id",
      };
    }

    logger.info("Depix: PIX criado", { transactionId: String(id) });

    return {
      success: true,
      transactionId: String(id),
      qrCode: String(data.qrCopyPaste ?? data.qr_code ?? ""),
      qrCodeBase64: String(data.qrImageUrl ?? data.qr_code_base64 ?? ""),
      pixKey: String(data.pix_key ?? ""),
    };
  } catch (error) {
    logger.error("Depix: erro de rede", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao gerar PIX",
    };
  }
}

/**
 * Cancela um PIX pendente. PixPay nao tem endpoint dedicado de cancelamento —
 * a transacao expira sozinha apos 30 minutos. Implementacao mantida por API
 * consistency mas atualmente apenas loga.
 */
export async function cancelPixPayment(
  transactionId: string,
): Promise<DepixCancelResult> {
  logger.info("Depix: cancelamento solicitado (expira sozinho)", { transactionId });
  return { success: true };
}

/**
 * Consulta status de uma transacao PIX. Paridade Laravel
 * `consultarStatusDeposito` — POST {statusUrl} com {id}.
 */
export async function getPixStatus(
  transactionId: string,
): Promise<DepixStatusResult> {
  const config = getConfig();
  if (!config) {
    return { success: true, status: "pending", isFinal: false };
  }

  // Mock IDs (criados no modo dev) — retorna pending para nao bagunca testes
  if (transactionId.startsWith("mock-depix-")) {
    return { success: true, status: "pending", isFinal: false };
  }

  try {
    const response = await fetch(config.statusUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ id: transactionId }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      return { success: false, error: `Depix HTTP ${response.status}` };
    }

    const body = (await response.json()) as Record<string, unknown>;
    const data = (body.response ?? body) as Record<string, unknown>;
    // Normaliza status — PixPay retorna "depix_sent"/"paid"/"under_review"/"expired"/etc
    const raw = String(data.status ?? "pending").toLowerCase();
    let normalized: DepixStatusResult["status"];
    if (raw === "depix_sent" || raw === "paid" || raw === "completed" || raw === "success") {
      normalized = "paid";
    } else if (raw === "expired") {
      normalized = "expired";
    } else if (raw === "failed" || raw === "cancelled" || raw === "canceled") {
      normalized = "failed";
    } else if (raw === "refunded") {
      normalized = "refunded";
    } else {
      normalized = "pending";
    }
    const isFinal = normalized !== "pending";
    return { success: true, status: normalized, isFinal };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao consultar PIX",
    };
  }
}
