import { logger } from "@/lib/logger";
import { getUtxos, signPset, generateAddress } from "@/lib/services/lwk-service";

/**
 * Swap DePix → L-USDt via Sideswap (Fase 2, taker). Orquestra o fluxo:
 *   start_quotes (UTXOs de DePix via LWK) → get_quote (recebe PSET) →
 *   /sign-pset (LWK assina com a passphrase do tenant) → taker_sign (Sideswap
 *   finaliza e faz o broadcast). O L-USDt recebido fica na carteira do tenant.
 *
 * NÃO custodia nada: a passphrase só transita para o LWK assinar; nunca é logada.
 */

const WS_URL = process.env.SIDESWAP_WS_URL ?? "wss://api.sideswap.io/json-rpc-ws";

// Asset IDs na Liquid mainnet (confirmados na sondagem).
export const DEPIX_ASSET = "02f22f8d9c76ab41661a2729e4752e2c5d1a263012141b86ea98af5472df5189";
export const LUSDT_ASSET = "ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2";

// Par L-USDt/DePix: base=L-USDt, quote=DePix (confirmado via list_markets).
const ASSET_PAIR = { base: LUSDT_ASSET, quote: DEPIX_ASSET } as const;

/** Timeout de cada request/notificação do Sideswap. */
const QUOTE_TIMEOUT_MS = 15_000;

type SwapParams = {
  tenantId: string;
  /** Quanto de DePix vender, em satoshis (1 DePix = 1e8 sat). */
  amountSats: number;
  encryptedSeed: unknown;
  passphrase: string;
  /**
   * Teto de ágio aceitável vs o preço-alvo (guard-rail). Se o preço do quote
   * ficar acima de `maxPriceDepixPerUsdt`, aborta antes de assinar. Opcional.
   */
  maxPriceDepixPerUsdt?: number;
};

export type SwapResult =
  | {
      success: true;
      txid: string;
      /** DePix vendido (sats) e L-USDt bruto recebido (sats), + fees em L-USDt. */
      soldDepixSats: number;
      grossUsdtSats: number;
      serverFeeSats: number;
      fixedFeeSats: number;
      priceDepixPerUsdt: number;
    }
  | { success: false; error: string };

/** Envia um request JSON-RPC (method "market") e resolve na resposta com o mesmo id. */
function rpc(ws: WebSocket, id: number, action: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", onMessage);
      reject(new Error(`timeout no request ${id}`));
    }, QUOTE_TIMEOUT_MS);
    const onMessage = (event: MessageEvent) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id !== id) return;
      clearTimeout(timer);
      ws.removeEventListener("message", onMessage);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result as Record<string, unknown>);
    };
    ws.addEventListener("message", onMessage);
    ws.send(JSON.stringify({ id, method: "market", params: action }));
  });
}

/** Aguarda a primeira notificação `quote` do sub_id (regenerada ~5s pelo servidor). */
function awaitQuote(ws: WebSocket, subId: unknown): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", onMessage);
      reject(new Error("timeout esperando quote"));
    }, QUOTE_TIMEOUT_MS);
    const onMessage = (event: MessageEvent) => {
      const msg = JSON.parse(String(event.data));
      const q = msg?.params?.quote ?? msg?.quote;
      if (!q) return;
      if (subId !== undefined && q.quote_sub_id !== undefined && q.quote_sub_id !== subId) return;
      clearTimeout(timer);
      ws.removeEventListener("message", onMessage);
      resolve(q as Record<string, unknown>);
    };
    ws.addEventListener("message", onMessage);
  });
}

function connect(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const timer = setTimeout(() => reject(new Error("timeout ao conectar no Sideswap")), QUOTE_TIMEOUT_MS);
    ws.addEventListener("open", () => { clearTimeout(timer); resolve(ws); }, { once: true });
    ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("falha ao conectar no Sideswap")); }, { once: true });
  });
}

/**
 * Executa o swap DePix→L-USDt. Retorna erro (sem lançar) em falhas esperadas;
 * a passphrase nunca é logada.
 */
export async function executeSwap(params: SwapParams): Promise<SwapResult> {
  const { tenantId, amountSats } = params;

  // 1. UTXOs de DePix (com blinding factors) via LWK.
  const utxosResp = await getUtxos(tenantId, { assetId: DEPIX_ASSET });
  if (!utxosResp.success) return { success: false, error: `utxos: ${utxosResp.error}` };
  const totalDepix = utxosResp.utxos.reduce((acc, u) => acc + u.value, 0);
  if (utxosResp.utxos.length === 0 || totalDepix < amountSats) {
    return { success: false, error: "saldo DePix insuficiente para o swap" };
  }

  // 2. Endereços de recebimento (L-USDt) e troco (DePix) na carteira do tenant.
  const recvResp = await generateAddress(tenantId, "swap-recv");
  const changeResp = await generateAddress(tenantId, "swap-change");
  if (!recvResp.success || !recvResp.address || !changeResp.success || !changeResp.address) {
    return { success: false, error: "falha ao gerar endereços da carteira" };
  }

  const swapUtxos = utxosResp.utxos.map((u) => ({
    txid: u.txid,
    vout: u.vout,
    asset: u.asset,
    value: u.value,
    asset_bf: u.asset_bf,
    value_bf: u.value_bf,
  }));

  let ws: WebSocket | null = null;
  try {
    ws = await connect();

    // 3. start_quotes → notificação quote.
    const started = (await rpc(ws, 1, {
      start_quotes: {
        asset_pair: ASSET_PAIR,
        asset_type: "Quote", // DePix é o quote no par L-USDt/DePix
        trade_dir: "Sell",
        amount: amountSats,
        utxos: swapUtxos,
        receive_address: recvResp.address,
        change_address: changeResp.address,
      },
    })) as { start_quotes?: { quote_sub_id?: unknown } };
    const subId = started.start_quotes?.quote_sub_id;
    const quote = await awaitQuote(ws, subId);

    const status = (quote.status ?? {}) as Record<string, unknown>;
    const success = status.Success as Record<string, unknown> | undefined;
    if (!success) {
      const kind = Object.keys(status)[0] ?? "desconhecido";
      return { success: false, error: `sem cotação (${kind}) — liquidez insuficiente ou par indisponível` };
    }

    const quoteId = success.quote_id;
    const gross = Number(success.base_amount); // L-USDt bruto
    const sold = Number(success.quote_amount); // DePix vendido
    const serverFee = Number(success.server_fee);
    const fixedFee = Number(success.fixed_fee);
    const price = sold / gross; // DePix por L-USDt

    // Guard-rail: aborta se o preço estiver pior que o teto informado.
    if (params.maxPriceDepixPerUsdt !== undefined && price > params.maxPriceDepixPerUsdt) {
      return { success: false, error: `ágio acima do limite (${price.toFixed(4)} > ${params.maxPriceDepixPerUsdt.toFixed(4)})` };
    }

    // 4. get_quote → PSET não assinado.
    const gotQuote = (await rpc(ws, 2, { get_quote: { quote_id: quoteId } })) as { get_quote?: { pset?: string }; pset?: string };
    const pset = gotQuote.get_quote?.pset ?? gotQuote.pset;
    if (!pset) return { success: false, error: "Sideswap não retornou o PSET" };

    // 5. LWK assina o PSET (non-custodial, com a passphrase do tenant).
    const signResp = await signPset(tenantId, pset, {
      encryptedSeed: params.encryptedSeed,
      passphrase: params.passphrase,
    });
    if (!signResp.success) {
      if (signResp.error === "invalid_passphrase") return { success: false, error: "invalid_passphrase" };
      return { success: false, error: `assinatura: ${signResp.error}` };
    }

    // 6. taker_sign → o Sideswap finaliza e faz broadcast.
    const takerResp = (await rpc(ws, 3, {
      taker_sign: { quote_id: quoteId, pset: signResp.signedPset },
    })) as { taker_sign?: { txid?: string }; txid?: string };
    const txid = takerResp.taker_sign?.txid ?? takerResp.txid;
    if (!txid) return { success: false, error: "Sideswap não confirmou o txid do swap" };

    logger.info("Sideswap swap executado", {
      tenantId, txid, soldDepixSats: sold, grossUsdtSats: gross,
    });
    return {
      success: true,
      txid,
      soldDepixSats: sold,
      grossUsdtSats: gross,
      serverFeeSats: serverFee,
      fixedFeeSats: fixedFee,
      priceDepixPerUsdt: price,
    };
  } catch (error) {
    logger.error("Sideswap swap erro", {
      tenantId, error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: "falha no swap Sideswap" };
  } finally {
    ws?.close();
  }
}

export type SwapPreview =
  | {
      success: true;
      soldDepixSats: number;
      grossUsdtSats: number;
      serverFeeSats: number;
      fixedFeeSats: number;
      priceDepixPerUsdt: number;
      /** L-USDt líquido estimado (bruto − fees). */
      netUsdtSats: number;
    }
  | { success: false; error: string };

/**
 * Cota o swap SEM executar (só start_quotes → lê o quote). A UI usa para mostrar
 * ao usuário quanto ele recebe, o preço e as taxas antes de confirmar. Não assina
 * nem faz broadcast. Não exige passphrase.
 */
export async function previewSwap(args: { tenantId: string; amountSats: number }): Promise<SwapPreview> {
  const { tenantId, amountSats } = args;

  const utxosResp = await getUtxos(tenantId, { assetId: DEPIX_ASSET });
  if (!utxosResp.success) return { success: false, error: `utxos: ${utxosResp.error}` };
  const totalDepix = utxosResp.utxos.reduce((acc, u) => acc + u.value, 0);
  if (utxosResp.utxos.length === 0 || totalDepix < amountSats) {
    return { success: false, error: "saldo DePix insuficiente para o swap" };
  }
  const recvResp = await generateAddress(tenantId, "swap-recv");
  const changeResp = await generateAddress(tenantId, "swap-change");
  if (!recvResp.success || !recvResp.address || !changeResp.success || !changeResp.address) {
    return { success: false, error: "falha ao gerar endereços da carteira" };
  }
  const swapUtxos = utxosResp.utxos.map((u) => ({
    txid: u.txid, vout: u.vout, asset: u.asset, value: u.value, asset_bf: u.asset_bf, value_bf: u.value_bf,
  }));

  let ws: WebSocket | null = null;
  try {
    ws = await connect();
    const started = (await rpc(ws, 1, {
      start_quotes: {
        asset_pair: ASSET_PAIR, asset_type: "Quote", trade_dir: "Sell",
        amount: amountSats, utxos: swapUtxos,
        receive_address: recvResp.address, change_address: changeResp.address,
      },
    })) as { start_quotes?: { quote_sub_id?: unknown } };
    const quote = await awaitQuote(ws, started.start_quotes?.quote_sub_id);
    const status = (quote.status ?? {}) as Record<string, unknown>;
    const success = status.Success as Record<string, unknown> | undefined;
    if (!success) {
      const kind = Object.keys(status)[0] ?? "desconhecido";
      return { success: false, error: `sem cotação (${kind}) — liquidez insuficiente ou par indisponível` };
    }
    const gross = Number(success.base_amount);
    const sold = Number(success.quote_amount);
    const serverFee = Number(success.server_fee);
    const fixedFee = Number(success.fixed_fee);
    return {
      success: true,
      soldDepixSats: sold,
      grossUsdtSats: gross,
      serverFeeSats: serverFee,
      fixedFeeSats: fixedFee,
      priceDepixPerUsdt: sold / gross,
      netUsdtSats: gross - serverFee - fixedFee,
    };
  } catch (error) {
    logger.error("Sideswap preview erro", { tenantId, error: error instanceof Error ? error.message : String(error) });
    return { success: false, error: "falha ao cotar o swap" };
  } finally {
    ws?.close();
  }
}
