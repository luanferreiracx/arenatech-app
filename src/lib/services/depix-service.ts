/**
 * Integracao com a API oficial DePix (Eulen) — https://docs.eulen.app.
 *
 * Auth: Bearer JWT (`DEPIX_API_KEY`), obtido via Bot do Telegram da Eulen
 * (/apitoken, scope deposit/withdraw). Deposito entrega o DePix no
 * `depixAddress` (carteira LWK do tenant). Sem merchant_id, sem senha.
 *
 * Endpoints (config via env, defaults = Eulen prod):
 *   - DEPIX_API_URL            (default https://depix.eulen.app/api/deposit) — POST cria pix
 *   - DEPIX_DEPOSIT_STATUS_URL (default .../api/deposit-status) — GET ?id= consulta
 *   - DEPIX_SAQUE_URL          (default https://depix.eulen.app/api/withdraw) — POST cria saque
 *   - DEPIX_SAQUE_STATUS_URL   (default .../api/withdraw-status) — GET ?id= consulta
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

/**
 * Mascara CPF/CNPJ para logs (LGPD). Mantem so primeiros 3 e ultimos 2 digitos.
 */
function maskTaxNumber(doc: string): string {
  const d = doc.replace(/\D/g, "");
  if (d.length < 5) return "***";
  return `${d.slice(0, 3)}${"*".repeat(d.length - 5)}${d.slice(-2)}`;
}

function getConfig(): DepixConfig | null {
  const apiKey = process.env.DEPIX_API_KEY;
  if (!apiKey) return null;

  const depositUrl =
    process.env.DEPIX_API_URL?.replace(/\/$/, "") ??
    "https://depix.eulen.app/api/deposit";
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
  options?: { depixAddress?: string; requireDepixAddress?: boolean },
): Promise<DepixCreateResult> {
  const config = getConfig();

  if (options?.requireDepixAddress && !options.depixAddress) {
    logger.error("Depix: deposito wallet sem depixAddress — recusando fallback legado", {
      amount: amountReais,
      description,
      referenceId,
    });
    return {
      success: false,
      error: "Deposito wallet sem endereco LWK; fallback legado bloqueado",
    };
  }

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
  const payload: Record<string, string | number> = { amountInCents };

  if (taxNumber) {
    payload.endUserTaxNumber = taxNumber.replace(/\D/g, "");
  }
  // Override por parametro tem prioridade (modulo LWK multi-tenant manda o
  // masterAddress da carteira do tenant). Fallback pra env DEPIX_ADDRESS
  // (fluxo legacy do PDV/OS/QuickSale).
  const depixAddress = options?.depixAddress ?? config.depixAddress;
  if (depixAddress) {
    payload.depixAddress = depixAddress;
  }
  logger.info("Depix: criando deposit", {
    url: config.depositUrl,
    amountInCents,
    hasEndUserTax: !!payload.endUserTaxNumber,
    taxIdMasked: payload.endUserTaxNumber
      ? maskTaxNumber(String(payload.endUserTaxNumber))
      : undefined,
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

// ────────────────────────────────────────────────────────────────────────────
// Withdraw (saque)
// ────────────────────────────────────────────────────────────────────────────

export interface DepixWithdrawResult {
  success: boolean;
  /** ID retornado pelo provedor de off-ramp. */
  id?: string;
  /** Endereco Liquid de deposito */
  depositAddress?: string;
  /** PNG base64 do QR code do depositAddress, gerado localmente (PixPay nao envia). */
  depositAddressQr?: string;
  depositAmountInCents?: number;
  payoutAmountInCents?: number;
  expiration?: string;
  status?: string;
  receivedAmount?: number;
  fee?: number;
  raw?: unknown;
  error?: string;
}

/**
 * Gera QR Code (PNG base64) a partir de um endereco Liquid (lq1qq...).
 * PixPay nao retorna QR para saque — geramos no backend pra usuario escanear.
 * Retorna a string `data:image/png;base64,...` pronta pra `<img src>`.
 */
export async function generateDepositAddressQr(address: string): Promise<string | null> {
  if (!address || address.trim().length === 0) return null;
  try {
    const QRCode = (await import("qrcode")).default;
    return await QRCode.toDataURL(address, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
    });
  } catch (err) {
    logger.error("Erro ao gerar QR do depositAddress", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Solicita saque de DEPIX (DePix Liquid -> PIX para o destinatario) via PixPay.
 *
 * Off-ramp: PixPay retorna um `depositAddress` Liquid + o valor a depositar
 * (depositAmountInCents); o orquestrador faz o sweep on-chain desse DePix pra
 * la, e o PixPay paga o PIX ao destinatario. Paridade Laravel
 * DepixService::criarSaque. Auth: Bearer `DEPIX_API_KEY` + `senha` no body.
 */
export async function createDepixWithdraw(
  pixKey: string,
  pixKeyType: "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "RANDOM",
  valorReais: number,
  taxId: string,
): Promise<DepixWithdrawResult> {
  const apiKey = process.env.DEPIX_API_KEY;

  if (!apiKey) {
    logger.warn("Depix saque: mock mode (DEPIX_API_KEY ausente)");
    return {
      success: true,
      id: `mock-saque-${Date.now()}`,
      depositAddress: "lq1qq-mock-address",
      payoutAmountInCents: Math.round(valorReais * 100),
      status: "unsent",
    };
  }

  const saqueUrl =
    process.env.DEPIX_SAQUE_URL?.replace(/\/$/, "") ??
    "https://depix.eulen.app/api/withdraw";

  const taxIdDigits = taxId.replace(/\D/g, "");
  let pixKeyFormatted: string;
  try {
    pixKeyFormatted = formatPixKey(pixKey, pixKeyType);
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Chave PIX invalida",
    };
  }

  // Eulen oficial: { pixKey, taxNumber, payoutAmountInCents } — passamos o valor
  // LIQUIDO (o que o destinatario recebe); a Eulen deduz a taxa dela e devolve
  // depositAmountInCents (quanto DePix mandar). Sem senha/tipoChave/valor.
  const payload = {
    pixKey: pixKeyFormatted,
    taxNumber: taxIdDigits,
    payoutAmountInCents: Math.round(valorReais * 100),
  };

  logger.info("Depix saque: chamando API", {
    url: saqueUrl,
    tipoChave: pixKeyType,
    payoutAmountInCents: payload.payoutAmountInCents,
    taxIdMasked: maskTaxNumber(taxIdDigits),
  });

  try {
    const response = await fetch(saqueUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error("Depix saque: erro na API", {
        status: response.status,
        body: body.substring(0, 500),
      });
      let msg = `HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(body) as {
          message?: string;
          error?: string;
          errorMessage?: string;
        };
        msg = parsed.errorMessage ?? parsed.message ?? parsed.error ?? msg;
      } catch {
        msg = `${msg}: ${body.substring(0, 200)}`;
      }
      return { success: false, error: `Erro ao solicitar saque: ${msg}` };
    }

    const body = (await response.json()) as Record<string, unknown>;
    const data = (body.response ?? body) as Record<string, unknown>;

    // Eulen usa `errorMessage`; mantemos `error` por compatibilidade.
    const erroApi =
      (data.errorMessage as string | undefined) ??
      (data.error as string | undefined) ??
      (body.error as string | undefined);
    if (erroApi) {
      logger.error("Depix saque: erro da API", { erro: erroApi });
      return { success: false, error: `Erro da API: ${erroApi}` };
    }

    // Eulen retorna `withdrawalId`; aceitamos `id` como fallback.
    const withdrawalId = (data.withdrawalId as string | undefined) ?? (data.id as string | undefined);
    if (!withdrawalId) {
      logger.error("Depix saque: sem withdrawalId na resposta");
      return { success: false, error: "Resposta invalida: sem id" };
    }

    const depositAmountInCents = (data.depositAmountInCents as number | undefined) ?? undefined;
    const payoutAmountInCents = (data.payoutAmountInCents as number | undefined) ?? undefined;
    const receivedAmount = payoutAmountInCents != null ? payoutAmountInCents / 100 : undefined;
    const fee =
      receivedAmount != null && depositAmountInCents != null
        ? depositAmountInCents / 100 - receivedAmount
        : undefined;

    const depositAddress = (data.depositAddress as string | undefined) ?? undefined;
    const depositAddressQr = depositAddress
      ? ((await generateDepositAddressQr(depositAddress)) ?? undefined)
      : undefined;

    return {
      success: true,
      id: String(withdrawalId),
      depositAddress,
      depositAddressQr,
      depositAmountInCents,
      payoutAmountInCents,
      expiration: (data.expiration as string | undefined) ?? undefined,
      status: (data.status as string | undefined) ?? "unsent",
      receivedAmount,
      fee,
      raw: data,
    };
  } catch (error) {
    logger.error("Depix saque: erro de rede", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao solicitar saque",
    };
  }
}

/**
 * Consulta status de um saque pela API PixPay. Paridade Laravel
 * Eulen: GET /withdraw-status?id=... (sem auth, sem senha). Retorna o status
 * cru (unsent/sending/sent/error/canceled/refunded) + receiptUrl/blockchainTxID.
 */
export async function getDepixWithdrawStatus(
  depixId: string,
): Promise<{ success: boolean; status?: string; raw?: Record<string, unknown>; error?: string }> {
  if (depixId.startsWith("mock-saque-")) return { success: true, status: "pending" };

  const baseUrl =
    process.env.DEPIX_SAQUE_URL?.replace(/\/$/, "") ??
    "https://depix.eulen.app/api/withdraw";
  const statusUrl =
    process.env.DEPIX_SAQUE_STATUS_URL?.replace(/\/$/, "") ??
    baseUrl.replace(/\/withdraw$/, "/withdraw-status");

  try {
    const qs = new URLSearchParams({ id: depixId });
    const response = await fetch(`${statusUrl}?${qs.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      logger.warn("Depix saque: erro ao consultar status", {
        depixId,
        httpStatus: response.status,
      });
      return { success: false, error: `HTTP ${response.status}` };
    }
    const body = (await response.json()) as
      | Record<string, unknown>
      | Array<Record<string, unknown>>;
    let data: Record<string, unknown>;
    if (Array.isArray(body) && body.length > 0) {
      const first = body[0] as Record<string, unknown>;
      data = (first.response as Record<string, unknown>) ?? first;
    } else {
      data =
        ((body as Record<string, unknown>).response as Record<string, unknown>) ??
        (body as Record<string, unknown>);
    }
    return { success: true, status: String(data.status ?? "pending"), raw: data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao consultar status",
    };
  }
}

/**
 * Formata e valida a chave PIX para o endpoint de saque (CPF/CNPJ com
 * pontuacao, telefone com +55, etc). Lanca Error se invalida.
 * Paridade Laravel DepixService::formatarPixKey.
 */
function formatPixKey(
  pixKey: string,
  pixKeyType: "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "RANDOM",
): string {
  const trimmed = pixKey.trim();
  if (!trimmed) throw new Error("Chave PIX vazia");

  if (pixKeyType === "CPF") {
    const d = trimmed.replace(/\D/g, "");
    if (d.length !== 11) throw new Error("CPF invalido (deve ter 11 digitos)");
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (pixKeyType === "CNPJ") {
    const d = trimmed.replace(/\D/g, "");
    if (d.length !== 14) throw new Error("CNPJ invalido (deve ter 14 digitos)");
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  if (pixKeyType === "PHONE") {
    const d = trimmed.replace(/\D/g, "");
    const ddd11 = d.length === 11 || d.length === 10;
    const ddd13 = (d.length === 13 || d.length === 12) && d.startsWith("55");
    if (!ddd11 && !ddd13) {
      throw new Error("Telefone invalido (use DDD + numero, com ou sem +55)");
    }
    return ddd13 ? `+${d}` : `+55${d}`;
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
    // Eulen: GET /deposit-status?id=... (sem body). O Bearer e inofensivo
    // (o endpoint nao exige auth, mas mantemos por consistencia).
    const qs = new URLSearchParams({ id: transactionId });
    const response = await fetch(`${config.statusUrl}?${qs.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      return { success: false, error: `Depix HTTP ${response.status}` };
    }

    const body = (await response.json()) as Record<string, unknown>;
    const data = (body.response ?? body) as Record<string, unknown>;
    // Normaliza status Eulen: pending/under_review/delayed/approved/depix_sent/
    // refunded/will_refund/expired/canceled/error.
    const raw = String(data.status ?? "pending").toLowerCase();
    let normalized: DepixStatusResult["status"];
    if (["approved", "depix_sent", "paid", "completed", "success"].includes(raw)) {
      normalized = "paid";
    } else if (raw === "expired") {
      normalized = "expired";
    } else if (["failed", "cancelled", "canceled", "error"].includes(raw)) {
      normalized = "failed";
    } else if (["refunded", "will_refund"].includes(raw)) {
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
