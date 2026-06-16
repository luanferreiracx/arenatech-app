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
  /** Saldo L-BTC em satoshis. Necessario pra pagar fee de rede em saques. */
  lbtcSatoshis?: number;
  error?: string;
}

/** Asset ID do L-BTC (Liquid Bitcoin) — usado pra pagar fee de rede.
 *  Exposto para uso por servicos que transferem L-BTC (ex.: refill por tenant central). */
export const LBTC_ASSET_ID = "6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d";

export interface MasterAddressResult {
  success: boolean;
  masterAddress?: string;
  network?: string;
  error?: string;
}

export interface LwkMnemonicResult {
  success: boolean;
  mnemonic?: string;
  wordCount?: number;
  network?: string;
  error?: string;
}

function getConfig(): LwkConfig | null {
  const baseUrl = process.env.LWK_API_URL;
  const apiKey = process.env.LWK_API_KEY;
  if (baseUrl && apiKey) {
    return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
  }
  // Fail-closed: sem env em prod = throw. Mock so com flag explicita
  // `LWK_MOCK=true` (uso CI/teste local sem servico Python).
  if (process.env.LWK_MOCK === "true") {
    return null;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "LWK_API_URL/LWK_API_KEY ausente em producao — recuse operar (fail-closed)",
    );
  }
  return null;
}

/**
 * Helper: chama `getConfig()` e converte throw em resultado de erro.
 * Usar em todas as funcoes publicas pra propagar fail-closed em prod
 * sem causar 500 cru.
 */
function safeGetConfig(): { config: LwkConfig | null; error?: string } {
  try {
    return { config: getConfig() };
  } catch (error) {
    return {
      config: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

interface LwkFetchOpts {
  body?: Record<string, unknown>;
  idempotencyKey?: string;
  timeoutMs?: number;
}

async function lwkFetch(
  config: LwkConfig,
  method: "GET" | "POST",
  path: string,
  opts: LwkFetchOpts = {},
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  try {
    const headers: Record<string, string> = {
      "X-API-Key": config.apiKey,
      Accept: "application/json",
    };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
    const resp = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
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
  const { config, error: cfgErr } = safeGetConfig();
  if (cfgErr) return { success: false, error: cfgErr };
  if (!config) {
    logger.warn("LWK: mock mode (LWK_MOCK=true)", { tenantId });
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

/** Revela a frase de recuperacao da carteira do tenant. Chamar apenas sob acao explicita.
 *  Non-custodial (ADR 0051): passe `{ encryptedSeed, passphrase }` — o LWK decifra
 *  o blob e devolve o mnemonico SO a quem prova posse da passphrase. Sem isso,
 *  cai no caminho custodial (le o mnemonic.txt). */
export async function revealMnemonic(
  tenantId: string,
  opts: { encryptedSeed?: unknown; passphrase?: string } = {},
): Promise<LwkMnemonicResult> {
  const { config, error: cfgErr } = safeGetConfig();
  if (cfgErr) return { success: false, error: cfgErr };
  if (!config) {
    return {
      success: true,
      mnemonic:
        "mock seed phrase only for tests do not use outside development wallet backup sideswap import fake words liquid depix tenant recovery reveal sample secret",
      wordCount: 24,
      network: "mainnet",
    };
  }
  try {
    const revealBody: Record<string, unknown> | undefined =
      opts.encryptedSeed !== undefined
        ? { encrypted_seed: opts.encryptedSeed, passphrase: opts.passphrase }
        : undefined;
    const { ok, status, body } = await lwkFetch(
      config,
      "POST",
      `/wallet/${tenantId}/mnemonic/reveal`,
      revealBody ? { body: revealBody } : {},
    );
    if (!ok) {
      logger.error("LWK revealMnemonic falhou", { tenantId, status, error: body.error });
      if (status === 404) {
        return {
          success: false,
          error:
            "Servico LWK desatualizado ou URL incorreta: endpoint de frase de recuperacao nao encontrado.",
        };
      }
      if (String(body.error) === "invalid_passphrase") {
        return { success: false, error: "Senha da carteira incorreta." };
      }
      return { success: false, error: String(body.error ?? `HTTP ${status}`) };
    }
    return {
      success: true,
      mnemonic: body.mnemonic as string | undefined,
      wordCount: Number(body.word_count ?? 0),
      network: body.network as string | undefined,
    };
  } catch (error) {
    logger.error("LWK revealMnemonic erro", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: "LWK indisponivel" };
  }
}

/** Saldo DePix da carteira do tenant. */
export async function getBalance(tenantId: string): Promise<BalanceResult> {
  const { config, error: cfgErr } = safeGetConfig();
  if (cfgErr) return { success: false, error: cfgErr };
  if (!config) {
    return { success: true, depixBalance: 0, depixAssetId: DEPIX_ASSET_ID };
  }
  try {
    // sync=false: usa saldo cached (rapido). Sync de verdade roda no
    // monitor de fundo a cada MONITOR_INTERVAL — evita timeout no
    // dashboard quando a Esplora rate-limita.
    const { ok, status, body } = await lwkFetch(
      config,
      "GET",
      `/wallet/${tenantId}/balance?sync=false`,
      { timeoutMs: 12_000 },
    );
    if (!ok) {
      return { success: false, error: String(body.error ?? `HTTP ${status}`) };
    }
    // Extrai saldo L-BTC dos all_assets (usado pra pagar fee de rede).
    const allAssets = (body.all_assets ?? {}) as Record<
      string,
      { satoshis?: number }
    >;
    const lbtcSatoshis = Number(allAssets[LBTC_ASSET_ID]?.satoshis ?? 0);
    return {
      success: true,
      depixBalance: Number(body.depix_balance ?? 0),
      depixAssetId: body.depix_asset_id as string | undefined,
      lbtcSatoshis,
    };
  } catch (error) {
    logger.error("LWK getBalance erro", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: "LWK indisponivel" };
  }
}

export interface LwkTransferRecipient {
  to: string;
  /** Valor em REAIS (Decimal arredondado pelo LWK pra 8 casas). */
  amountBrl: number;
}

export interface LwkTransferResult {
  success: boolean;
  txid?: string;
  feeSatoshis?: number;
  accepted?: boolean;
  broadcastVia?: string;
  /** True se o LWK identificou que e replay da mesma Idempotency-Key. */
  idempotentReplay?: boolean;
  error?: string;
}

/**
 * Transfere DePix (ou outro asset Liquid) com 1+ recipients atomicamente.
 * Usado no SAQUE (2 outputs: liquido pro off-ramp + taxa pra Arena Tech) e
 * na cobranca da taxa do DEPOSITO (1 output: taxa pra Arena Tech).
 *
 * Idempotencia: passe a mesma key em retry -> LWK retorna o mesmo txid sem
 * transferir 2x. Critico pra evitar saque duplicado.
 */
export async function transfer(
  tenantId: string,
  recipients: LwkTransferRecipient[],
  opts: {
    feeRate?: number;
    idempotencyKey?: string;
    assetId?: string;
    /** Non-custodial (ADR 0051): blob da seed cifrada. Quando presente (com
     *  passphrase), o LWK assina decifrando em memoria — a seed NAO esta no
     *  disco. Ausente = caminho custodial (LWK usa o mnemonic.txt). */
    encryptedSeed?: unknown;
    /** Passphrase do usuario p/ decifrar a seed. Obrigatoria se encryptedSeed.
     *  NUNCA logada nem persistida. */
    passphrase?: string;
  } = {},
): Promise<LwkTransferResult> {
  if (!recipients.length || recipients.length > 5) {
    return { success: false, error: "recipients: 1 a 5" };
  }
  const { config, error: cfgErr } = safeGetConfig();
  if (cfgErr) return { success: false, error: cfgErr };
  if (!config) {
    logger.warn("LWK transfer: mock mode", { tenantId, recipients: recipients.length });
    return {
      success: true,
      txid: `mock-tx-${Date.now()}`,
      feeSatoshis: 40,
      accepted: true,
      broadcastVia: "mock",
    };
  }
  try {
    const body: Record<string, unknown> = {
      recipients: recipients.map((r) => ({ to: r.to, amount: r.amountBrl })),
    };
    if (opts.feeRate !== undefined) body.fee_rate = opts.feeRate;
    if (opts.assetId) body.asset_id = opts.assetId;
    // Non-custodial: repassa o blob + passphrase pro LWK assinar em memoria.
    if (opts.encryptedSeed !== undefined) {
      body.encrypted_seed = opts.encryptedSeed;
      body.passphrase = opts.passphrase;
    }

    const { ok, status, body: resp } = await lwkFetch(
      config,
      "POST",
      `/wallet/${tenantId}/transfer`,
      // 120s: o transfer faz sync sincrono ANTES de assinar/broadcast.
      // Quando alguma Esplora rate-limita, cada attempt timeouta em 20s
      // (3 esploras = ate 60s so de sync). Mais o build/sign/broadcast.
      // Esse timeout grande NAO eh problema porque a operacao eh
      // idempotente (Idempotency-Key garante 1 tx so).
      { body, idempotencyKey: opts.idempotencyKey, timeoutMs: 120_000 },
    );
    if (!ok) {
      logger.error("LWK transfer falhou", { tenantId, status, error: resp.error });
      // Traduz codigos do LWK pra mensagens em PT-BR amigaveis ao client.
      const code = String(resp.error ?? "");
      let msg: string;
      if (code === "insufficient_lbtc") {
        // Mensagem generica — L-BTC eh gerenciado pela Arena Tech central,
        // operador do tenant nao precisa saber do detalhe tecnico.
        // Logamos detalhe internamente.
        msg = "Saque temporariamente indisponivel. Tente novamente em alguns minutos.";
      } else if (code === "insufficient_depix") {
        msg = "Saldo DePix insuficiente.";
      } else if (code === "amount_too_small") {
        msg = "Valor muito pequeno (abaixo do minimo da rede Liquid).";
      } else if (code === "invalid_passphrase") {
        // Non-custodial: passphrase errada. Mensagem generica (sem distinguir
        // de blob corrompido) e indistinguivel no log do tenant.
        msg = "Senha da carteira incorreta.";
      } else {
        msg = code || `HTTP ${status}`;
      }
      return { success: false, error: msg };
    }
    return {
      success: true,
      txid: resp.txid as string | undefined,
      feeSatoshis: resp.fee_satoshis as number | undefined,
      accepted: resp.accepted as boolean | undefined,
      broadcastVia: resp.broadcast_via as string | undefined,
      idempotentReplay: resp.idempotent_replay as boolean | undefined,
    };
  } catch (error) {
    logger.error("LWK transfer erro", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: "LWK indisponivel" };
  }
}

export interface LwkAddressResult {
  success: boolean;
  address?: string;
  label?: string;
  index?: number;
  network?: string;
  error?: string;
}

/**
 * Gera um endereco de recebimento na carteira do tenant, com um label
 * customizado (usado pra match exato no webhook do monitor — passar o
 * transactionId do deposito como `user`).
 */
export async function generateAddress(
  tenantId: string,
  user: string,
  index?: number,
): Promise<LwkAddressResult> {
  const { config, error: cfgErr } = safeGetConfig();
  if (cfgErr) return { success: false, error: cfgErr };
  if (!config) {
    const mockAddr = `lq1mock${user.replace(/-/g, "").slice(0, 16)}${Date.now().toString(36).slice(-6)}`;
    return {
      success: true,
      address: mockAddr,
      label: `${user.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30)}_${Math.random().toString(16).slice(2, 10)}`,
      index: index ?? 0,
      network: "mainnet",
    };
  }
  try {
    const body: Record<string, unknown> = { user };
    if (index !== undefined) body.index = index;
    const { ok, status, body: resp } = await lwkFetch(
      config,
      "POST",
      `/wallet/${tenantId}/address/new`,
      { body },
    );
    if (!ok) {
      return { success: false, error: String(resp.error ?? `HTTP ${status}`) };
    }
    return {
      success: true,
      address: resp.address as string | undefined,
      label: resp.label as string | undefined,
      index: resp.index as number | undefined,
      network: resp.network as string | undefined,
    };
  } catch (error) {
    logger.error("LWK generateAddress erro", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: "LWK indisponivel" };
  }
}

export interface LwkTxBalance {
  amount: number;
  satoshis: number;
  is_depix: boolean;
}
export interface LwkTxItem {
  txid: string;
  height: number | null;
  timestamp: number | null;
  feeSatoshis: number | null;
  confirmations: number;
  status: "confirmed" | "pending";
  balance: Record<string, LwkTxBalance>;
}
export interface LwkListTxsResult {
  success: boolean;
  transactions?: LwkTxItem[];
  error?: string;
}

/** Lista transacoes da carteira do tenant (mais recentes primeiro). */
export async function listTransactions(
  tenantId: string,
  limit = 20,
): Promise<LwkListTxsResult> {
  const { config, error: cfgErr } = safeGetConfig();
  if (cfgErr) return { success: false, error: cfgErr };
  if (!config) return { success: true, transactions: [] };
  try {
    const { ok, status, body } = await lwkFetch(
      config,
      "GET",
      `/wallet/${tenantId}/transactions?limit=${Math.max(1, Math.min(limit, 100))}`,
    );
    if (!ok) {
      return { success: false, error: String(body.error ?? `HTTP ${status}`) };
    }
    const rawTxs = (body.transactions ?? []) as Array<Record<string, unknown>>;
    return {
      success: true,
      transactions: rawTxs.map((t) => ({
        txid: String(t.txid ?? ""),
        height: (t.height as number | null) ?? null,
        timestamp: (t.timestamp as number | null) ?? null,
        feeSatoshis: (t.fee_satoshis as number | null) ?? null,
        confirmations: Number(t.confirmations ?? 0),
        status: (t.status as "confirmed" | "pending") ?? "pending",
        balance: (t.balance as Record<string, LwkTxBalance>) ?? {},
      })),
    };
  } catch (error) {
    logger.error("LWK listTransactions erro", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: "LWK indisponivel" };
  }
}

/** Endereco mestre de recebimento (index 0) da carteira do tenant. */
export async function getMasterAddress(tenantId: string): Promise<MasterAddressResult> {
  const { config, error: cfgErr } = safeGetConfig();
  if (cfgErr) return { success: false, error: cfgErr };
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

// ── Non-custodial (ADR 0051) ────────────────────────────────────────────────

export interface LwkEncryptedSeedResult {
  success: boolean;
  /** Blob versionado do mnemonico cifrado (formato no ADR 0051). */
  encryptedSeed?: unknown;
  descriptor?: string;
  network?: string;
  error?: string;
}

/** Troca a passphrase (rewrap): decifra com a antiga, recifra com a nova. Nao
 *  toca on-chain. Passphrase antiga errada -> "Senha da carteira incorreta". */
export async function rewrapSeed(
  tenantId: string,
  encryptedSeed: unknown,
  oldPassphrase: string,
  newPassphrase: string,
): Promise<LwkEncryptedSeedResult> {
  const { config, error: cfgErr } = safeGetConfig();
  if (cfgErr) return { success: false, error: cfgErr };
  if (!config) {
    return { success: true, encryptedSeed: { v: 1, mock: true }, network: "mainnet" };
  }
  try {
    const { ok, status, body } = await lwkFetch(config, "POST", `/wallet/${tenantId}/rewrap`, {
      body: {
        encrypted_seed: encryptedSeed,
        old_passphrase: oldPassphrase,
        new_passphrase: newPassphrase,
      },
    });
    if (!ok) {
      logger.error("LWK rewrapSeed falhou", { tenantId, status, error: body.error });
      if (String(body.error) === "invalid_passphrase") {
        return { success: false, error: "Senha da carteira incorreta." };
      }
      return { success: false, error: String(body.error ?? `HTTP ${status}`) };
    }
    return { success: true, encryptedSeed: body.encrypted_seed, network: body.network as string | undefined };
  } catch (error) {
    logger.error("LWK rewrapSeed erro", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: "LWK indisponivel" };
  }
}

/**
 * RECUPERACAO por mnemonico: o usuario informa as 24 palavras + nova passphrase.
 * O LWK so aceita se o mnemonico derivar o MESMO descriptor ja registrado da
 * carteira (prova ser a carteira certa, sem mover fundos). Devolve novo blob.
 */
export async function recoverWallet(
  tenantId: string,
  mnemonic: string,
  newPassphrase: string,
): Promise<LwkEncryptedSeedResult> {
  const { config, error: cfgErr } = safeGetConfig();
  if (cfgErr) return { success: false, error: cfgErr };
  if (!config) {
    return { success: true, encryptedSeed: { v: 1, mock: true }, network: "mainnet" };
  }
  try {
    const { ok, status, body } = await lwkFetch(config, "POST", `/wallet/${tenantId}/recover`, {
      body: { mnemonic, new_passphrase: newPassphrase },
    });
    if (!ok) {
      logger.error("LWK recoverWallet falhou", { tenantId, status, error: body.error });
      const code = String(body.error ?? "");
      if (code === "mnemonic invalido") {
        return { success: false, error: "Frase de recuperacao invalida." };
      }
      if (code.includes("nao corresponde")) {
        return { success: false, error: "Esta frase nao corresponde a carteira deste tenant." };
      }
      return { success: false, error: code || `HTTP ${status}` };
    }
    return { success: true, encryptedSeed: body.encrypted_seed, network: body.network as string | undefined };
  } catch (error) {
    logger.error("LWK recoverWallet erro", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: "LWK indisponivel" };
  }
}

export interface LwkSetupWalletResult {
  success: boolean;
  encryptedSeed?: unknown;
  descriptor?: string;
  masterAddress?: string;
  network?: string;
  /** Mnemonico de 24 palavras — SO no modo "create" (backup unico do usuario). */
  mnemonic?: string;
  error?: string;
}

/**
 * Provisiona uma carteira NON-CUSTODIAL no primeiro acesso (ADR 0051).
 * mode "create": gera mnemonico novo (devolve p/ backup unico).
 * mode "import": usa as 24 palavras do usuario (NAO devolve o mnemonico).
 * Em ambos, a seed e cifrada com a passphrase e so o descriptor (watch-only)
 * fica no volume — o mnemonic.txt NUNCA e gravado.
 */
export async function setupWallet(
  tenantId: string,
  args: { mode: "create" | "import"; passphrase: string; mnemonic?: string },
): Promise<LwkSetupWalletResult> {
  const { config, error: cfgErr } = safeGetConfig();
  if (cfgErr) return { success: false, error: cfgErr };
  if (!config) {
    return {
      success: true,
      encryptedSeed: { v: 1, mock: true },
      descriptor: `ct(mock-${tenantId})`,
      masterAddress: `lq1mock${tenantId.replace(/-/g, "").slice(0, 20)}`,
      network: "mainnet",
      mnemonic:
        args.mode === "create"
          ? "mock seed phrase only for tests do not use outside development wallet backup sideswap import fake words liquid depix tenant recovery reveal sample secret"
          : undefined,
    };
  }
  try {
    const { ok, status, body } = await lwkFetch(config, "POST", `/wallet/${tenantId}/setup-noncustodial`, {
      body: { mode: args.mode, passphrase: args.passphrase, mnemonic: args.mnemonic },
    });
    if (!ok) {
      logger.error("LWK setupWallet falhou", { tenantId, status, error: body.error, mode: args.mode });
      const code = String(body.error ?? "");
      if (code.includes("mnemonic invalido")) {
        return { success: false, error: "Frase de recuperacao invalida (use 24 palavras)." };
      }
      if (status === 409 || code.includes("ja provisionada")) {
        return { success: false, error: "Carteira ja provisionada." };
      }
      return { success: false, error: code || `HTTP ${status}` };
    }
    return {
      success: true,
      encryptedSeed: body.encrypted_seed,
      descriptor: body.descriptor as string | undefined,
      masterAddress: body.master_address as string | undefined,
      network: body.network as string | undefined,
      mnemonic: body.mnemonic as string | undefined,
    };
  } catch (error) {
    logger.error("LWK setupWallet erro", {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: "LWK indisponivel" };
  }
}
