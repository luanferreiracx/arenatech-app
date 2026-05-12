/**
 * Depix (PixPay) integration for PIX QR code generation.
 *
 * When DEPIX_API_URL and DEPIX_API_KEY are configured, makes real API requests.
 * Otherwise logs and returns mock success for development.
 *
 * @see api.pixpay.space
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

interface DepixConfig {
  apiUrl: string;
  apiKey: string;
  merchantId: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────────────────────────────

function getConfig(): DepixConfig | null {
  const apiUrl = process.env.DEPIX_API_URL;
  const apiKey = process.env.DEPIX_API_KEY;
  const merchantId = process.env.DEPIX_MERCHANT_ID;

  if (!apiUrl || !apiKey || !merchantId) return null;

  return { apiUrl: apiUrl.replace(/\/$/, ""), apiKey, merchantId };
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Generate a PIX QR code for an order.
 */
export async function createPixPayment(
  amount: number,
  description: string,
  referenceId: string,
): Promise<DepixCreateResult> {
  const config = getConfig();

  if (!config) {
    logger.info("Depix: mock mode (no credentials)", { amount, description });
    return {
      success: true,
      transactionId: `mock-depix-${Date.now()}`,
      qrCode: "00020126580014br.gov.bcb.pix0136mock-pix-key-12345678901234567890",
      qrCodeBase64: "",
      pixKey: "mock@pix.key",
    };
  }

  logger.info("Depix: creating PIX payment", { amount, description, referenceId });

  try {
    const response = await fetch(`${config.apiUrl}/transactions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        merchant_id: config.merchantId,
        amount: Math.round(amount * 100), // cents
        description,
        reference_id: referenceId,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        success: false,
        error: `Depix HTTP ${response.status}: ${body.substring(0, 200)}`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;
    const transaction = data["transaction"] as Record<string, unknown> | undefined;

    logger.info("Depix: PIX created", { transactionId: transaction?.["id"] });

    return {
      success: true,
      transactionId: String(transaction?.["id"] ?? data["id"] ?? ""),
      qrCode: String(transaction?.["qr_code"] ?? data["qr_code"] ?? ""),
      qrCodeBase64: String(transaction?.["qr_code_base64"] ?? data["qr_code_base64"] ?? ""),
      pixKey: String(transaction?.["pix_key"] ?? data["pix_key"] ?? ""),
    };
  } catch (error) {
    logger.error("Depix: create error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao gerar PIX",
    };
  }
}

/**
 * Cancel a pending PIX payment.
 */
export async function cancelPixPayment(
  transactionId: string,
): Promise<DepixCancelResult> {
  const config = getConfig();

  if (!config) {
    logger.info("Depix: mock cancel", { transactionId });
    return { success: true };
  }

  logger.info("Depix: cancelling PIX", { transactionId });

  try {
    const response = await fetch(`${config.apiUrl}/transactions/${transactionId}/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        success: false,
        error: `Depix HTTP ${response.status}: ${body.substring(0, 200)}`,
      };
    }

    logger.info("Depix: PIX cancelled", { transactionId });
    return { success: true };
  } catch (error) {
    logger.error("Depix: cancel error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao cancelar PIX",
    };
  }
}
