/**
 * Nuvem Fiscal API integration.
 *
 * When NUVEM_FISCAL_CLIENT_ID and NUVEM_FISCAL_CLIENT_SECRET are configured,
 * makes real API requests. Otherwise returns mock responses for development.
 *
 * @see https://dev.nuvemfiscal.com.br/docs/
 */

import { randomBytes } from "node:crypto";
import { logger } from "@/lib/logger";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface FiscalEmitResult {
  success: boolean;
  providerRef?: string;
  accessKey?: string;
  protocol?: string;
  status?: string;
  error?: string;
}

export interface FiscalCancelResult {
  success: boolean;
  protocol?: string;
  error?: string;
}

export interface FiscalCorrectionResult {
  success: boolean;
  protocol?: string;
  error?: string;
}

export interface FiscalDocumentUrls {
  pdfUrl: string | null;
  xmlUrl: string | null;
}

interface NuvemFiscalConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  ambiente: "producao" | "homologacao";
}

// ────────────────────────────────────────────────────────────────────────────
// Token cache (module-level, avoids re-auth on every call)
// ────────────────────────────────────────────────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

function getConfig(): NuvemFiscalConfig | null {
  const clientId = process.env.NUVEM_FISCAL_CLIENT_ID;
  const clientSecret = process.env.NUVEM_FISCAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    // Em prod, NUNCA aceitar mock-mode em emissao fiscal — falsificar NF-e
    // seria fraude fiscal nao intencional.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Nuvem Fiscal: NUVEM_FISCAL_CLIENT_ID/SECRET ausentes em prod. Configurar as envs ou desabilitar emissao fiscal.",
      );
    }
    return null;
  }

  return {
    clientId,
    clientSecret,
    baseUrl: "https://api.nuvemfiscal.com.br",
    ambiente: (process.env.NUVEM_FISCAL_AMBIENTE as "producao" | "homologacao") ?? "homologacao",
  };
}

async function getAccessToken(config: NuvemFiscalConfig): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const response = await fetch("https://auth.nuvemfiscal.com.br/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: "empresa nfe nfce nfse",
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error("Nuvem Fiscal auth failed", { status: response.status, body });
    throw new Error(`Nuvem Fiscal auth failed (HTTP ${response.status}): ${body}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const token = String(data["access_token"] ?? "");
  const expiresIn = Number(data["expires_in"] ?? 3600);

  cachedToken = {
    token,
    expiresAt: Date.now() + (expiresIn - 60) * 1000, // refresh 1 min early
  };

  return token;
}

async function apiFetch(
  config: NuvemFiscalConfig,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken(config);

  return fetch(`${config.baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(60_000),
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export async function createAndAuthorizeInvoice(payload: Record<string, unknown>): Promise<FiscalEmitResult> {
  const config = getConfig();
  if (!config) {
    logger.info("Nuvem Fiscal: mock mode (no credentials)");
    return getMockEmitResult();
  }

  try {
    const modelo = payload["modelo"] as string | undefined;
    const endpoint = modelo === "65" ? "/nfce" : "/nfe";
    logger.info("Nuvem Fiscal: emitting invoice", { endpoint, modelo });

    const response = await apiFetch(config, endpoint, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      const errorMsg =
        getNestedString(data, "error", "message") ??
        String(data["mensagem"] ?? data["message"] ?? "Erro ao emitir NF-e");
      return { success: false, error: errorMsg };
    }

    const status = String(data["status"] ?? "");

    if (["autorizado", "autorizada"].includes(status)) {
      return {
        success: true,
        providerRef: String(data["id"] ?? ""),
        accessKey: String(data["chave"] ?? data["chave_acesso"] ?? ""),
        protocol: String(data["numero_protocolo"] ?? data["protocolo"] ?? ""),
        status,
      };
    }

    if (["processando", "processamento"].includes(status)) {
      return await pollProcessing(config, String(data["id"] ?? ""), endpoint);
    }

    // Rejection
    const auth = (data["autorizacao"] ?? {}) as Record<string, unknown>;
    const motivo = String(
      auth["motivo_status"] ?? data["motivo"] ?? data["motivo_status"] ?? data["mensagem"] ?? "",
    );
    const cStat = String(auth["codigo_status"] ?? data["codigo_status"] ?? "");
    const errorMsg = cStat ? `[${cStat}] ${motivo}` : motivo || "NF-e rejeitada pela SEFAZ";

    return { success: false, error: errorMsg };
  } catch (error) {
    logger.error("Nuvem Fiscal: emit error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido ao emitir NF-e",
    };
  }
}

export async function cancelInvoice(
  providerRef: string,
  reason: string,
): Promise<FiscalCancelResult> {
  const config = getConfig();
  if (!config) {
    return { success: true, protocol: "MOCK-CANCEL-PROTO-001" };
  }

  try {
    const response = await apiFetch(config, `/nfe/${providerRef}/cancelamento`, {
      method: "POST",
      body: JSON.stringify({ justificativa: reason }),
    });

    const data = (await response.json()) as Record<string, unknown>;

    if (response.ok) {
      const status = String(data["status"] ?? "");
      if (["cancelado", "cancelada", "registrado"].includes(status)) {
        return {
          success: true,
          protocol: String(data["numero_protocolo"] ?? data["protocolo"] ?? ""),
        };
      }
      const motivo = String(data["motivo_status"] ?? data["motivo"] ?? "");
      return { success: false, error: motivo || `Status inesperado: ${status}` };
    }

    const errorMsg =
      getNestedString(data, "error", "message") ??
      String(data["mensagem"] ?? "Erro ao cancelar NF-e");
    return { success: false, error: errorMsg };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido ao cancelar NF-e",
    };
  }
}

export async function sendCorrectionLetter(
  providerRef: string,
  reason: string,
): Promise<FiscalCorrectionResult> {
  const config = getConfig();
  if (!config) {
    return { success: true, protocol: "MOCK-CCE-PROTO-001" };
  }

  try {
    const response = await apiFetch(config, `/nfe/${providerRef}/carta-correcao`, {
      method: "POST",
      body: JSON.stringify({ correcao: reason }),
    });

    const data = (await response.json()) as Record<string, unknown>;

    if (response.ok) {
      return {
        success: true,
        protocol: String(data["numero_protocolo"] ?? data["protocolo"] ?? ""),
      };
    }

    const errorMsg =
      getNestedString(data, "error", "message") ??
      String(data["mensagem"] ?? "Erro ao enviar carta de correção");
    return { success: false, error: errorMsg };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    };
  }
}

export async function getInvoiceDocumentUrls(providerRef: string): Promise<FiscalDocumentUrls> {
  // URLs de PROXY — a rota /api/fiscal/download autentica o tenant e busca o
  // documento na Nuvem Fiscal (fetchInvoiceDocument). Nunca expõe a API-key nem
  // uma URL pública da Nuvem Fiscal ao cliente.
  return {
    pdfUrl: `/api/fiscal/download?ref=${encodeURIComponent(providerRef)}&type=pdf`,
    xmlUrl: `/api/fiscal/download?ref=${encodeURIComponent(providerRef)}&type=xml`,
  };
}

/** Documento fiscal (PDF/XML) baixado da Nuvem Fiscal, pronto para stream. */
export type InvoiceDocument = {
  bytes: ArrayBuffer;
  contentType: string;
  filename: string;
};

/**
 * Busca o PDF (DANFE) ou o XML da NF-e na Nuvem Fiscal pelos bytes reais, usando
 * a API-key do servidor (nunca exposta ao cliente). Chamado pela rota autenticada
 * /api/fiscal/download. Retorna `null` se o documento não existir/indisponível.
 * Auditoria 2026-07-13 (I7): a rota de download referenciava esta busca mas ela
 * não existia — o download quebrava com 404.
 */
export async function fetchInvoiceDocument(
  providerRef: string,
  type: "pdf" | "xml",
): Promise<InvoiceDocument | null> {
  const config = getConfig();
  if (!config) return null; // mock/dev sem credenciais

  // Nuvem Fiscal: /nfe/{id}/pdf devolve PDF; /nfe/{id}/xml devolve o XML autorizado.
  const path = type === "pdf" ? `/nfe/${providerRef}/pdf` : `/nfe/${providerRef}/xml`;
  const accept = type === "pdf" ? "application/pdf" : "application/xml";

  const token = await getAccessToken(config);
  const response = await fetch(`${config.baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: accept },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    logger.warn("Nuvem Fiscal: documento indisponível", { providerRef, type, status: response.status });
    return null;
  }

  const bytes = await response.arrayBuffer();
  return {
    bytes,
    contentType: type === "pdf" ? "application/pdf" : "application/xml",
    filename: `nfe-${providerRef}.${type}`,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

async function pollProcessing(
  config: NuvemFiscalConfig,
  id: string,
  endpoint: string,
  maxAttempts = 10,
): Promise<FiscalEmitResult> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const response = await apiFetch(config, `${endpoint}/${id}`);
    if (!response.ok) continue;

    const data = (await response.json()) as Record<string, unknown>;
    const status = String(data["status"] ?? "");

    if (["autorizado", "autorizada"].includes(status)) {
      return {
        success: true,
        providerRef: id,
        accessKey: String(data["chave"] ?? data["chave_acesso"] ?? ""),
        protocol: String(data["numero_protocolo"] ?? data["protocolo"] ?? ""),
        status,
      };
    }

    if (["rejeitado", "rejeitada", "erro"].includes(status)) {
      return {
        success: false,
        error: String(data["motivo"] ?? "NF-e rejeitada"),
      };
    }
  }

  return { success: false, error: "Timeout aguardando processamento da NF-e" };
}

function getNestedString(
  obj: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  let current: unknown = obj;
  for (const key of keys) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current ? String(current) : undefined;
}

function getMockEmitResult(): FiscalEmitResult {
  // Mock so e usado em dev/test (getConfig() lanca em prod).
  const suffix = randomBytes(4).toString("hex");
  return {
    success: true,
    providerRef: `mock-nfe-${suffix}`,
    accessKey: BigInt(`0x${suffix}`).toString().padStart(44, "0").slice(-44),
    protocol: `MOCK-PROTO-${suffix}`,
    status: "autorizado",
  };
}
