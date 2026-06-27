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
 * Contrato (docs.eulen.app):
 *   - Auth: `Authorization: Bearer <jwt>` em TODAS as chamadas (inclusive status).
 *   - Idempotencia: header `X-Nonce: <uuid>` — MESMO nonce no retry da mesma
 *     intencao evita duplicar a operacao (critico no saque). Nonce novo = nova
 *     intencao.
 *   - Envelope: resposta sincrona vem `{ response: {...}, async: false }`. Se
 *     `async: true`, a acao ainda esta na fila — repetir a chamada com o MESMO
 *     nonce ate virar sincrona (NAO e erro).
 *   - Erro: `response.errorMessage`.
 *
 * Quando DEPIX_API_KEY nao configurada, retorna mock para desenvolvimento.
 */

import { randomUUID } from "node:crypto";
import { logger } from "@/lib/logger";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface DepixCreateResult {
  success: boolean;
  transactionId?: string;
  qrCode?: string;
  qrCodeBase64?: string;
  error?: string;
}

export interface DepixCancelResult {
  success: boolean;
  error?: string;
}

export interface DepixStatusResult {
  success: boolean;
  /**
   * Status normalizado. `pix_received` = PIX caiu mas o DePix ainda NAO foi
   * enviado on-chain (status Eulen `approved`) — NAO e creditavel ainda. `paid`
   * = DePix enviado on-chain (status `depix_sent`).
   */
  status?: "pending" | "pix_received" | "paid" | "expired" | "failed" | "refunded";
  /** Status final (true) significa que nao vai mais mudar. */
  isFinal?: boolean;
  /** Nome do pagador (Eulen `payerName`), disponivel apos o PIX ser pago. */
  payerName?: string;
  error?: string;
}

interface DepixConfig {
  /** Endpoint completo do POST de criacao (https://depix.eulen.app/api/deposit) */
  depositUrl: string;
  /** Endpoint completo do GET de consulta de status */
  statusUrl: string;
  /** Bearer token da API (JWT da Eulen) */
  apiKey: string;
  /** Carteira Liquid onde a loja recebe o DePix */
  depixAddress?: string;
}

/** Envelope padrao da Eulen: { response, async }. */
interface EulenEnvelope {
  response?: Record<string, unknown>;
  async?: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Mascara CPF/CNPJ para logs (LGPD). Mantem so primeiros 3 e ultimos 2 digitos.
 */
function maskTaxNumber(doc: string): string {
  const d = doc.replace(/\D/g, "");
  if (d.length < 5) return "***";
  return `${d.slice(0, 3)}${"*".repeat(d.length - 5)}${d.slice(-2)}`;
}

/** Headers padrao da Eulen: Bearer + JSON + nonce de idempotencia. */
function eulenHeaders(apiKey: string, nonce: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Nonce": nonce,
  };
}

/**
 * Le o envelope `{ response, async }` da Eulen. Retorna o objeto `response` e se
 * a chamada foi processada (sincrona) ou ainda esta na fila (assincrona).
 */
function parseEnvelope(body: unknown): { data: Record<string, unknown>; isAsync: boolean } {
  const env = (body ?? {}) as EulenEnvelope;
  const data = (env.response ?? (body as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  // `async: true` => ainda na fila. Ausente/false => processado.
  const isAsync = env.async === true;
  return { data, isAsync };
}

/** Extrai a mensagem de erro do corpo da Eulen (`response.errorMessage`). */
function extractEulenError(body: unknown): string | undefined {
  const { data } = parseEnvelope(body);
  const top = (body ?? {}) as Record<string, unknown>;
  return (
    (data.errorMessage as string | undefined) ??
    (top.errorMessage as string | undefined) ??
    (top.error as string | undefined) ??
    (top.message as string | undefined)
  );
}

function getConfig(): DepixConfig | null {
  const apiKey = process.env.DEPIX_API_KEY;
  if (!apiKey) return null;

  const depositUrl =
    process.env.DEPIX_API_URL?.replace(/\/$/, "") ?? "https://depix.eulen.app/api/deposit";
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
// Deposit (PIX -> DePix)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Gera um QR Code PIX para um valor em reais (POST /deposit).
 *
 * @param amountReais valor em reais (float).
 * @param description descricao (apenas para log; nao enviado a API).
 * @param nonce UUID de idempotencia (use o id da transacao local — estavel por
 *   intencao). Reenviar a mesma chamada com o mesmo nonce nao duplica.
 * @param taxNumber CPF/CNPJ do pagador. OBRIGATORIO pela Eulen
 *   (`endUserTaxNumber` required) — alem de anti-fraude (evita pagamento por
 *   terceiros).
 */
export async function createPixPayment(
  amountReais: number,
  description: string,
  nonce: string,
  taxNumber?: string | null,
  options?: { depixAddress?: string; requireDepixAddress?: boolean },
): Promise<DepixCreateResult> {
  const config = getConfig();

  if (options?.requireDepixAddress && !options.depixAddress) {
    logger.error("Depix: deposito wallet sem depixAddress — recusando fallback legado", {
      amount: amountReais,
      description,
      nonce,
    });
    return {
      success: false,
      error: "Deposito wallet sem endereco LWK; fallback legado bloqueado",
    };
  }

  // CPF/CNPJ do pagador: enviado quando disponivel (anti-fraude — evita
  // pagamento por terceiros). NAO bloqueamos quando ausente: a API da Eulen em
  // producao aceita deposito sem `endUserTaxNumber` (apesar de o schema marcar
  // como required), e fluxos do PDV/wallet nem sempre coletam o CPF do pagador.
  const taxDigits = taxNumber?.replace(/\D/g, "") ?? "";

  if (!config) {
    logger.warn("Depix: mock mode (DEPIX_API_KEY ausente)", { amount: amountReais, description });
    return {
      success: true,
      transactionId: `mock-depix-${Date.now()}`,
      qrCode: "00020126580014br.gov.bcb.pix0136mock-pix-key-12345678901234567890",
      qrCodeBase64: "",
    };
  }

  const amountInCents = Math.round(amountReais * 100);
  const payload: Record<string, string | number> = { amountInCents };
  if (taxDigits) {
    payload.endUserTaxNumber = taxDigits;
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
    taxIdMasked: taxDigits ? maskTaxNumber(taxDigits) : null,
    hasDepixAddr: !!payload.depixAddress,
    nonce,
  });

  try {
    const response = await fetch(config.depositUrl, {
      method: "POST",
      headers: eulenHeaders(config.apiKey, nonce),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error("Depix: erro no deposit", {
        status: response.status,
        body: body.substring(0, 500),
      });
      let msg = `HTTP ${response.status}`;
      try {
        msg = extractEulenError(JSON.parse(body)) ?? msg;
      } catch {
        msg = `${msg}: ${body.substring(0, 200)}`;
      }
      return { success: false, error: `Erro ao gerar PIX: ${msg}` };
    }

    const raw = (await response.json()) as unknown;
    const apiError = extractEulenError(raw);
    if (apiError) {
      logger.error("Depix: erro da API no deposit", { erro: apiError });
      return { success: false, error: `Erro da API PIX: ${apiError}` };
    }

    const { data, isAsync } = parseEnvelope(raw);
    if (isAsync) {
      // Deposit so retorna o id de forma sincrona; async aqui e raro (servidor
      // ocupado). Sem id nao da pra prosseguir — o caller pode retentar.
      logger.warn("Depix: deposit retornou async (sem id) — retentar com mesmo nonce", { nonce });
      return { success: false, error: "API PIX ocupada; tente novamente" };
    }

    const id = data.id;
    if (!id) {
      logger.error("Depix: resposta sem id", { data });
      return { success: false, error: "Resposta invalida da API PIX: sem id" };
    }

    logger.info("Depix: PIX criado", { transactionId: String(id) });
    return {
      success: true,
      transactionId: String(id),
      qrCode: String(data.qrCopyPaste ?? ""),
      qrCodeBase64: String(data.qrImageUrl ?? ""),
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
 * Cancela um PIX pendente. A Eulen nao tem endpoint dedicado de cancelamento —
 * a transacao expira sozinha. Mantido por consistencia de API; apenas loga.
 */
export async function cancelPixPayment(transactionId: string): Promise<DepixCancelResult> {
  logger.info("Depix: cancelamento solicitado (expira sozinho)", { transactionId });
  return { success: true };
}

// ────────────────────────────────────────────────────────────────────────────
// Withdraw (saque)
// ────────────────────────────────────────────────────────────────────────────

export interface DepixWithdrawResult {
  success: boolean;
  /** ID retornado pela Eulen (withdrawalId). */
  id?: string;
  /** Endereco Liquid de deposito (onde fazemos o sweep on-chain). */
  depositAddress?: string;
  /** PNG base64 do QR code do depositAddress, gerado localmente (Eulen nao envia). */
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
 * A Eulen nao retorna QR para saque — geramos no backend pra usuario escanear.
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
 * Solicita saque de DePix (DePix Liquid -> PIX para o destinatario) — POST
 * /withdraw.
 *
 * Off-ramp: a Eulen retorna um `depositAddress` Liquid + `depositAmountInCents`
 * (quanto DePix mandar); o orquestrador faz o sweep on-chain desse DePix pra la,
 * e a Eulen paga o PIX ao destinatario.
 *
 * Enviamos `payoutAmountInCents` (valor LIQUIDO que o destinatario recebe) — a
 * Eulen calcula o `depositAmountInCents` deduzindo a taxa dela. NUNCA enviar os
 * dois (a doc proibe).
 *
 * @param nonce UUID de idempotencia (id da transacao local). Reenviar a mesma
 *   chamada com o mesmo nonce NAO duplica o saque — essencial: duplicar = perda.
 */
export async function createDepixWithdraw(
  pixKey: string,
  pixKeyType: "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "RANDOM",
  valorReais: number,
  taxId: string,
  nonce: string,
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
    process.env.DEPIX_SAQUE_URL?.replace(/\/$/, "") ?? "https://depix.eulen.app/api/withdraw";

  const taxIdDigits = taxId.replace(/\D/g, "");
  if (!taxIdDigits) {
    return { success: false, error: "CPF/CNPJ do destinatario e obrigatorio" };
  }

  let pixKeyFormatted: string;
  try {
    pixKeyFormatted = formatPixKey(pixKey, pixKeyType);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Chave PIX invalida" };
  }

  // Eulen oficial: { pixKey, taxNumber, payoutAmountInCents }. Passamos o valor
  // LIQUIDO (o que o destinatario recebe); a Eulen deduz a taxa dela e devolve
  // depositAmountInCents (quanto DePix mandar).
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
    nonce,
  });

  try {
    // Forca modo sincrono. Se mesmo assim vier async (servidor ocupado),
    // retenta com o MESMO nonce ate virar sincrono (sem risco de duplicar).
    const raw = await postWithdrawSync(saqueUrl, apiKey, nonce, payload);
    if (!raw.ok) {
      return { success: false, error: raw.error };
    }

    const data = raw.data;
    const apiError = extractEulenError({ response: data });
    if (apiError) {
      logger.error("Depix saque: erro da API", { erro: apiError });
      return { success: false, error: `Erro da API: ${apiError}` };
    }

    const withdrawalId = data.withdrawalId as string | undefined;
    const depositAddress = data.depositAddress as string | undefined;
    if (!withdrawalId || !depositAddress) {
      logger.error("Depix saque: resposta sem withdrawalId/depositAddress", { data });
      return { success: false, error: "Resposta invalida do provedor de saque" };
    }

    const depositAmountInCents = data.depositAmountInCents as number | undefined;
    const payoutAmountInCents = data.payoutAmountInCents as number | undefined;
    const receivedAmount = payoutAmountInCents != null ? payoutAmountInCents / 100 : undefined;
    const fee =
      receivedAmount != null && depositAmountInCents != null
        ? depositAmountInCents / 100 - receivedAmount
        : undefined;

    const depositAddressQr = (await generateDepositAddressQr(depositAddress)) ?? undefined;

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
 * POST /withdraw forcando modo sincrono (`X-Async: false`). Se a Eulen ainda
 * responder `async: true` (sem o resultado), retenta com o MESMO nonce ate o
 * resultado ficar sincrono. Reusar o nonce e SEGURO — a Eulen garante que a
 * mesma chamada com o mesmo nonce nao duplica a operacao.
 */
async function postWithdrawSync(
  saqueUrl: string,
  apiKey: string,
  nonce: string,
  payload: Record<string, unknown>,
): Promise<
  { ok: true; data: Record<string, unknown> } | { ok: false; error: string }
> {
  const MAX_ATTEMPTS = 4;
  const RETRY_DELAY_MS = 1_500;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(saqueUrl, {
      method: "POST",
      headers: { ...eulenHeaders(apiKey, nonce), "X-Async": "false" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error("Depix saque: erro na API", {
        status: response.status,
        attempt,
        body: text.substring(0, 500),
      });
      let msg = `HTTP ${response.status}`;
      try {
        msg = extractEulenError(JSON.parse(text)) ?? msg;
      } catch {
        msg = `${msg}: ${text.substring(0, 200)}`;
      }
      return { ok: false, error: `Erro ao solicitar saque: ${msg}` };
    }

    const raw = (await response.json()) as unknown;
    const { data, isAsync } = parseEnvelope(raw);

    if (!isAsync) {
      return { ok: true, data };
    }

    // Ainda na fila: retenta com o MESMO nonce (idempotente).
    logger.warn("Depix saque: resposta async — retentando com mesmo nonce", {
      attempt,
      nonce,
    });
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  return {
    ok: false,
    error: "Provedor de saque ocupado (resposta assincrona). Tente novamente em instantes.",
  };
}

/**
 * Consulta status de um saque (GET /withdraw-status?id=). Auth Bearer + nonce
 * novo (leitura). Retorna o status cru (unsent/sending/sent/error/canceled/
 * refunded) + receiptUrl/blockchainTxID no `raw`.
 */
export async function getDepixWithdrawStatus(
  depixId: string,
): Promise<{ success: boolean; status?: string; raw?: Record<string, unknown>; error?: string }> {
  if (depixId.startsWith("mock-saque-")) return { success: true, status: "pending" };

  const apiKey = process.env.DEPIX_API_KEY;
  if (!apiKey) return { success: true, status: "pending" };

  const baseUrl =
    process.env.DEPIX_SAQUE_URL?.replace(/\/$/, "") ?? "https://depix.eulen.app/api/withdraw";
  const statusUrl =
    process.env.DEPIX_SAQUE_STATUS_URL?.replace(/\/$/, "") ??
    baseUrl.replace(/\/withdraw$/, "/withdraw-status");

  try {
    const qs = new URLSearchParams({ id: depixId });
    const response = await fetch(`${statusUrl}?${qs.toString()}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json", "X-Nonce": randomUUID() },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      logger.warn("Depix saque: erro ao consultar status", {
        depixId,
        httpStatus: response.status,
      });
      return { success: false, error: `HTTP ${response.status}` };
    }
    const { data } = parseEnvelope((await response.json()) as unknown);
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

// ────────────────────────────────────────────────────────────────────────────
// Deposit status
// ────────────────────────────────────────────────────────────────────────────

/**
 * Consulta status de uma transacao PIX (GET /deposit-status?id=). Auth Bearer +
 * nonce novo (leitura).
 *
 * Normaliza os status Eulen: `approved` = PIX recebido mas DePix ainda nao
 * enviado on-chain -> `pix_received` (NAO creditavel). `depix_sent` = DePix
 * on-chain -> `paid` (creditavel).
 */
export async function getPixStatus(transactionId: string): Promise<DepixStatusResult> {
  const config = getConfig();
  if (!config) {
    return { success: true, status: "pending", isFinal: false };
  }

  if (transactionId.startsWith("mock-depix-")) {
    return { success: true, status: "pending", isFinal: false };
  }

  try {
    const qs = new URLSearchParams({ id: transactionId });
    const response = await fetch(`${config.statusUrl}?${qs.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: "application/json",
        "X-Nonce": randomUUID(),
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      return { success: false, error: `Depix HTTP ${response.status}` };
    }

    const { data } = parseEnvelope((await response.json()) as unknown);
    const raw = String(data.status ?? "pending").toLowerCase();
    const normalized = normalizeDepositStatus(raw);
    // `pix_received` ainda nao e final — o DePix pode ser enviado on-chain.
    const isFinal = normalized !== "pending" && normalized !== "pix_received";
    const payerName = typeof data.payerName === "string" ? data.payerName.trim() : undefined;
    return { success: true, status: normalized, isFinal, payerName: payerName || undefined };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao consultar PIX",
    };
  }
}

/** Status Eulen de deposito -> status normalizado. */
function normalizeDepositStatus(raw: string): NonNullable<DepixStatusResult["status"]> {
  if (raw === "depix_sent") return "paid";
  if (raw === "approved") return "pix_received";
  if (raw === "expired") return "expired";
  if (["refunded", "will_refund"].includes(raw)) return "refunded";
  if (["canceled", "cancelled", "error"].includes(raw)) return "failed";
  // pending / under_review / delayed
  return "pending";
}

// ────────────────────────────────────────────────────────────────────────────
// Deposits (extrato / conciliacao) — GET /deposits
// ────────────────────────────────────────────────────────────────────────────

/** Status cru da Eulen aceitos no filtro do extrato. */
export type EulenDepositStatus =
  | "pending"
  | "under_review"
  | "approved"
  | "depix_sent"
  | "delayed"
  | "refunded"
  | "canceled"
  | "expired"
  | "error";

/**
 * Linha compacta retornada por GET /deposits. A Eulen NAO devolve valor/pagador
 * aqui (so qrId/status/bankTxId) — e um indice de conciliacao: descobre-se a
 * divergencia e busca-se o detalhe por id (`getPixStatus`).
 */
export interface EulenDepositRow {
  qrId: string;
  status: string;
  bankTxId: string | null;
}

export interface ListEulenDepositsResult {
  success: boolean;
  rows: EulenDepositRow[];
  error?: string;
}

/**
 * Lista depositos da Eulen num intervalo (GET /deposits?start&end&status) — ate
 * 200 linhas, forma compacta. Rede de seguranca de conciliacao quando o
 * webhook/monitor falham (a doc recomenda usar como fallback, nao como fonte
 * primaria). Janela: `start` incluido, `end` excluido (datas YYYY-MM-DD ou
 * RFC3339).
 *
 * Auth Bearer + `X-Nonce` novo (leitura) + `X-Async: auto`. Sem DEPIX_API_KEY
 * (dev), retorna lista vazia (sem erro) pra nao falsear conciliacao.
 */
export async function listEulenDeposits(
  start: string,
  end: string,
  status?: EulenDepositStatus,
): Promise<ListEulenDepositsResult> {
  const apiKey = process.env.DEPIX_API_KEY;
  if (!apiKey) {
    logger.warn("Depix extrato: mock mode (DEPIX_API_KEY ausente) — retornando vazio");
    return { success: true, rows: [] };
  }

  const depositUrl =
    process.env.DEPIX_API_URL?.replace(/\/$/, "") ?? "https://depix.eulen.app/api/deposit";
  const depositsUrl =
    process.env.DEPIX_DEPOSITS_URL?.replace(/\/$/, "") ??
    depositUrl.replace(/\/deposit$/, "/deposits");

  try {
    const qs = new URLSearchParams({ start, end });
    if (status) qs.set("status", status);

    const response = await fetch(`${depositsUrl}?${qs.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "X-Nonce": randomUUID(),
        "X-Async": "auto",
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error("Depix extrato: erro HTTP", {
        status: response.status,
        body: body.substring(0, 300),
      });
      return { success: false, rows: [], error: `HTTP ${response.status}` };
    }

    const raw = (await response.json()) as unknown;
    // O endpoint devolve um array cru. Se vier embrulhado em { response }, a
    // Eulen sinaliza erro — extrai a mensagem.
    if (!Array.isArray(raw)) {
      const apiError = extractEulenError(raw);
      logger.error("Depix extrato: resposta nao-array", { apiError });
      return { success: false, rows: [], error: apiError ?? "Resposta invalida do extrato" };
    }

    const rows: EulenDepositRow[] = raw
      .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
      .map((r) => ({
        qrId: String(r.qrId ?? ""),
        status: String(r.status ?? "").toLowerCase(),
        bankTxId: r.bankTxId != null ? String(r.bankTxId) : null,
      }))
      .filter((r) => r.qrId.length > 0);

    return { success: true, rows };
  } catch (error) {
    logger.error("Depix extrato: erro de rede", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      rows: [],
      error: error instanceof Error ? error.message : "Erro ao consultar extrato",
    };
  }
}
