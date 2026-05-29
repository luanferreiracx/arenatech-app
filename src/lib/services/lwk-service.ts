/**
 * Cliente da API LWK (carteira Liquid/DePix multi-tenant).
 *
 * O LWK roda como servico separado (Python/Flask, ver `lwk/`). Cada tenant tem
 * uma carteira propria, enderecada por tenant_id no path. Auth por header
 * `X-API-Key`.
 *
 * Env:
 *   - LWK_API_URL  (ex.: http://lwk-wallet:5000)
 *   - LWK_API_KEY  (mesma chave configurada no servico LWK)
 *
 * Sem LWK_API_URL/LWK_API_KEY -> modo mock (dev): retorna dados sinteticos
 * pra nao quebrar fluxo local sem o servico no ar.
 */

import { logger } from "@/lib/logger";

const DEPIX_ASSET_ID =
  "02f22f8d9c76ab41661a2729e4752e2c5d1a263012141b86ea98af5472df5189";

interface LwkConfig {
  baseUrl: string;
  apiKey: string;
}

export interface EnsureWalletResult {
  success: boolean;
  descriptor?: string;
  masterAddress?: string;
  network?: string;
  error?: string;
}

export interface BalanceResult {
  success: boolean;
  depixBalance?: number;
  depixAssetId?: string;
  error?: string;
}

export interface MasterAddressResult {
  success: boolean;
  masterAddress?: string;
  network?: string;
  error?: string;
}

function getConfig(): LwkConfig | null {
  const baseUrl = process.env.LWK_API_URL;
  const apiKey = process.env.LWK_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

async function lwkFetch(
  config: LwkConfig,
  method: "GET" | "POST",
  path: string,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const resp = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers: {
        "X-API-Key": config.apiKey,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    let body: Record<string, unknown> = {};
    try {
      body = (await resp.json()) as Record<string, unknown>;
    } catch {
      // resposta sem JSON — body vazio
    }
    return { ok: resp.ok, status: resp.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Cria (ou carrega, se ja existe) a carteira do tenant no LWK. Idempotente.
 * Retorna o descriptor publico + endereco mestre.
 */
export async function ensureWallet(tenantId: string): Promise<EnsureWalletResult> {
  const config = getConfig();
  if (!config) {
    logger.warn("LWK: mock mode (LWK_API_URL/LWK_API_KEY ausente)", { tenantId });
    return {
      success: true,
      descriptor: `ct(mock-${tenantId})`,
      masterAddress: `lq1mock${tenantId.replace(/-/g, "").slice(0, 20)}`,
      network: "mainnet",
    };
  }
  try {
    const { ok, status, body } = await lwkFetch(config, "POST", `/wallet/${tenantId}/create`);
    if (!ok) {
      logger.error("LWK ensureWallet falhou", { tenantId, status, error: body.error });
      return { success: false, error: String(body.error ?? `HTTP ${status}`) };
    }
    return {
      success: true,
      descriptor: body.descriptor as string | undefined,
      masterAddress: body.master_address as string | undefined,
      network: body.network as string | undefined,
    };
  } catch (error) {
    logger.error("LWK ensureWallet erro", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: "LWK indisponivel" };
  }
}

/** Saldo DePix da carteira do tenant. */
export async function getBalance(tenantId: string): Promise<BalanceResult> {
  const config = getConfig();
  if (!config) {
    return { success: true, depixBalance: 0, depixAssetId: DEPIX_ASSET_ID };
  }
  try {
    const { ok, status, body } = await lwkFetch(config, "GET", `/wallet/${tenantId}/balance`);
    if (!ok) {
      return { success: false, error: String(body.error ?? `HTTP ${status}`) };
    }
    return {
      success: true,
      depixBalance: Number(body.depix_balance ?? 0),
      depixAssetId: body.depix_asset_id as string | undefined,
    };
  } catch (error) {
    logger.error("LWK getBalance erro", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: "LWK indisponivel" };
  }
}

/** Endereco mestre de recebimento (index 0) da carteira do tenant. */
export async function getMasterAddress(tenantId: string): Promise<MasterAddressResult> {
  const config = getConfig();
  if (!config) {
    return {
      success: true,
      masterAddress: `lq1mock${tenantId.replace(/-/g, "").slice(0, 20)}`,
      network: "mainnet",
    };
  }
  try {
    const { ok, status, body } = await lwkFetch(config, "GET", `/wallet/${tenantId}/master-address`);
    if (!ok) {
      return { success: false, error: String(body.error ?? `HTTP ${status}`) };
    }
    return {
      success: true,
      masterAddress: body.master_address as string | undefined,
      network: body.network as string | undefined,
    };
  } catch (error) {
    logger.error("LWK getMasterAddress erro", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: "LWK indisponivel" };
  }
}
