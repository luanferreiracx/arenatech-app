/**
 * Sondagem Sideswap para avaliar a conversão DePix → L-USDt.
 *
 * NÃO executa swap nem gasta nada (nunca chama `taker_sign`). Duas fases:
 *
 * Fase 1 (read-only, sempre roda): consulta a API pública (mainnet):
 *   1. Existe par DIRETO DePix/L-USDt? Orientação base/quote e fee_asset?
 *   2. Se não, existem as pernas DePix/L-BTC e L-BTC/L-USDt?
 *   3. Preço de referência recente (chart OHLCV).
 *
 * Fase 1b (spread real, só com env do LWK): busca UTXOs de DePix da carteira via
 * o endpoint /utxos do LWK e chama `start_quotes` em vários amounts, tabulando a
 * curva preço×volume (o spread executável e onde a liquidez seca). Ativa quando
 * LWK_API_URL + LWK_API_KEY + PROBE_TENANT_ID estão no ambiente (rodar na VPS).
 *
 * Rodar Fase 1:  `pnpm tsx scripts/sideswap-probe.ts`
 * Rodar 1b:      `LWK_API_URL=... LWK_API_KEY=... PROBE_TENANT_ID=... pnpm tsx scripts/sideswap-probe.ts`
 */

const WS_URL = "wss://api.sideswap.io/json-rpc-ws";

// Asset IDs na Liquid mainnet (confirmados na pesquisa).
const DEPIX = "02f22f8d9c76ab41661a2729e4752e2c5d1a263012141b86ea98af5472df5189";
const LUSDT = "ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2";
const LBTC = "6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d";

const ASSET_NAME: Record<string, string> = {
  [DEPIX]: "DePix",
  [LUSDT]: "L-USDt",
  [LBTC]: "L-BTC",
};
const label = (id: string) => ASSET_NAME[id] ?? `${id.slice(0, 8)}…`;

type Market = {
  asset_pair: { base: string; quote: string };
  fee_asset?: string;
  type?: string;
};

/** Envia um request JSON-RPC (method sempre "market") e resolve na resposta com o mesmo id. */
function rpc(ws: WebSocket, id: number, action: Record<string, unknown>, timeoutMs = 15000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout no request ${id}`)), timeoutMs);
    const onMessage = (event: MessageEvent) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id !== id) return; // ignora notificações/outros ids
      clearTimeout(timer);
      ws.removeEventListener("message", onMessage);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    };
    ws.addEventListener("message", onMessage);
    ws.send(JSON.stringify({ id, method: "market", params: action }));
  });
}

function findPair(markets: Market[], a: string, b: string): Market | null {
  return (
    markets.find(
      (m) =>
        (m.asset_pair.base === a && m.asset_pair.quote === b) ||
        (m.asset_pair.base === b && m.asset_pair.quote === a),
    ) ?? null
  );
}

// ── Fase 1b: spread real via start_quotes ──────────────────────────────────

/** UTXO retornado pelo endpoint /wallet/{id}/utxos do LWK. */
type LwkUtxo = {
  txid: string;
  vout: number;
  asset: string;
  value: number;
  asset_bf: string;
  value_bf: string;
  is_depix: boolean;
};

/** Chama o LWK e devolve o JSON. Fail-closed: erro vira exceção. */
async function lwkGet(path: string): Promise<Record<string, unknown>> {
  const url = `${process.env.LWK_API_URL}${path}`;
  const resp = await fetch(url, { headers: { "X-API-Key": process.env.LWK_API_KEY ?? "" } });
  if (!resp.ok) throw new Error(`LWK ${path} → ${resp.status}`);
  return (await resp.json()) as Record<string, unknown>;
}

async function lwkPost(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = `${process.env.LWK_API_URL}${path}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "X-API-Key": process.env.LWK_API_KEY ?? "", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`LWK ${path} → ${resp.status}`);
  return (await resp.json()) as Record<string, unknown>;
}

/**
 * Aguarda a PRIMEIRA notificação `quote` de um `quote_sub_id`. O quote vem como
 * notificação (sem `id` de resposta), regenerada a cada ~5s pelo servidor. Só
 * lemos — nunca aceitamos (taker_sign). Timeout evita travar se o book não cotar.
 */
function awaitFirstQuote(ws: WebSocket, quoteSubId: unknown, timeoutMs = 12000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", onMessage);
      reject(new Error("timeout esperando quote"));
    }, timeoutMs);
    const onMessage = (event: MessageEvent) => {
      const msg = JSON.parse(String(event.data));
      const q = msg?.params?.quote ?? msg?.quote;
      if (!q) return; // não é notificação de quote
      if (quoteSubId !== undefined && q.quote_sub_id !== undefined && q.quote_sub_id !== quoteSubId) return;
      clearTimeout(timer);
      ws.removeEventListener("message", onMessage);
      resolve(q as Record<string, unknown>);
    };
    ws.addEventListener("message", onMessage);
  });
}

/** Formata um valor em satoshis do asset dado como número legível (2 casas p/ stablecoins). */
function fmt(sats: number): string {
  return (sats / 1e8).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 8 });
}

async function probeSpread(ws: WebSocket, market: Market): Promise<void> {
  const tenantId = process.env.PROBE_TENANT_ID as string;
  console.log(`\n═══ Fase 1b: spread real (start_quotes) — tenant ${tenantId} ═══`);

  // UTXOs de DePix da carteira (com blinding factors) via LWK.
  const utxosResp = await lwkGet(`/wallet/${tenantId}/utxos?asset=${DEPIX}`);
  const utxos = (utxosResp.utxos as LwkUtxo[]) ?? [];
  const totalDepix = utxos.reduce((acc, u) => acc + u.value, 0);
  console.log(`UTXOs DePix: ${utxos.length} (saldo ${fmt(totalDepix)} DePix)`);
  if (utxos.length === 0) {
    console.log("Sem UTXOs de DePix — não dá pra cotar. (deposite DePix na carteira central p/ sondar)");
    return;
  }

  // Endereços de recebimento (L-USDt) e troco (DePix). O LWK gera address confidencial.
  const recv = (await lwkPost(`/wallet/${tenantId}/address/new`, {})).address as string;
  const change = (await lwkPost(`/wallet/${tenantId}/address/new`, {})).address as string;

  // Formato de UTXO esperado pelo start_quotes (campos da pesquisa).
  const swapUtxos = utxos.map((u) => ({
    txid: u.txid,
    vout: u.vout,
    asset: u.asset,
    value: u.value,
    asset_bf: u.asset_bf,
    value_bf: u.value_bf,
  }));

  // Vende DePix (quote no par L-USDt/DePix, base=L-USDt). Amounts crescentes em DePix.
  const amountsDepix = [50, 200, 1000, 5000].map((brl) => Math.round(brl * 1e8)).filter((s) => s <= totalDepix);
  if (amountsDepix.length === 0) amountsDepix.push(Math.min(totalDepix, Math.round(50 * 1e8)));

  console.log(`\n  vende(DePix)  │ bruto(L-USDt)  │ preço(DePix │ swap fee  │ rede(L-USDt) │ líq(L-USDt)   │ custo tot`);
  console.log(`                │                │  /USDt)     │           │              │               │`);
  console.log(`  ──────────────┼────────────────┼─────────────┼───────────┼──────────────┼───────────────┼──────────`);

  let qid = 100;
  for (const amount of amountsDepix) {
    try {
      const started = (await rpc(ws, qid++, {
        start_quotes: {
          asset_pair: market.asset_pair,
          asset_type: "Quote", // DePix é o quote no par L-USDt/DePix
          trade_dir: "Sell",
          amount,
          utxos: swapUtxos,
          receive_address: recv,
          change_address: change,
        },
      })) as { start_quotes?: { quote_sub_id?: unknown } };
      const subId = started.start_quotes?.quote_sub_id;
      const q = await awaitFirstQuote(ws, subId);
      if (process.env.DEBUG) console.log("    RAW quote:", JSON.stringify(q));

      // O status vem aninhado: q.status.Success | q.status.LowBalance | q.status.Error
      const st = (q.status ?? {}) as Record<string, unknown>;
      const s = st.Success as Record<string, unknown> | undefined;
      if (s) {
        const base = Number(s.base_amount); // L-USDt recebido (bruto, antes das fees)
        const quote = Number(s.quote_amount); // DePix vendido
        const serverFee = Number(s.server_fee); // em L-USDt (fee_asset=Base)
        const fixedFee = Number(s.fixed_fee); // rede, em L-USDt
        const price = quote / base; // DePix por L-USDt (executável)
        const netUsdt = base - serverFee - fixedFee; // L-USDt líquido que sobra
        const totalFeePct = ((serverFee + fixedFee) / base) * 100;
        console.log(
          `  ${fmt(amount).padStart(13)} │ ${fmt(base).padStart(14)} │ ${price.toFixed(4).padStart(11)} │ ` +
          `${(serverFee / base * 100).toFixed(3).padStart(9)}% │ ${fmt(fixedFee).padStart(11)} │ ${fmt(netUsdt).padStart(13)} │ ${totalFeePct.toFixed(2)}%`,
        );
      } else {
        const status = Object.keys(st)[0] ?? "?";
        console.log(`  ${fmt(amount).padStart(13)} │ ${status} (${JSON.stringify(st[status] ?? {}).slice(0, 40)})`);
      }
    } catch (err) {
      console.log(`  ${fmt(amount).padStart(13)} │ erro: ${(err as Error).message}`);
    }
  }
  console.log("\n  (comparar o preço executável vs o preço médio do chart = spread real; onde vira LowBalance = liquidez seca)");
}

async function main(): Promise<void> {
  console.log(`Conectando a ${WS_URL} …`);
  const ws = new WebSocket(WS_URL);

  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", (e) => reject(new Error(`falha de conexão: ${String((e as ErrorEvent).message ?? e)}`)), { once: true });
  });
  console.log("Conectado.\n");

  // 1) list_markets — a resposta vem aninhada: result.list_markets.markets
  const result = (await rpc(ws, 1, { list_markets: {} })) as { list_markets?: { markets?: Market[] } };
  if (process.env.DEBUG) console.log("RAW list_markets:", JSON.stringify(result, null, 2));
  const markets = result.list_markets?.markets ?? [];
  console.log(`Mercados retornados: ${markets.length}`);

  const direct = findPair(markets, DEPIX, LUSDT);
  const depixLbtc = findPair(markets, DEPIX, LBTC);
  const lbtcLusdt = findPair(markets, LBTC, LUSDT);

  console.log("\n── Par DIRETO DePix/L-USDt ──");
  if (direct) {
    console.log(`  ✅ EXISTE. base=${label(direct.asset_pair.base)} quote=${label(direct.asset_pair.quote)} ` +
      `fee_asset=${direct.fee_asset ?? "?"} type=${direct.type ?? "?"}`);
  } else {
    console.log("  ❌ NÃO existe par direto DePix/L-USDt.");
    console.log("\n── Rota de 2 pernas ──");
    console.log(`  DePix/L-BTC:  ${depixLbtc ? "✅ existe" : "❌ ausente"}`);
    console.log(`  L-BTC/L-USDt: ${lbtcLusdt ? "✅ existe" : "❌ ausente"}`);
    if (depixLbtc && lbtcLusdt) {
      console.log("  → Conversão possível em 2 hops (DePix→L-BTC→L-USDt).");
    }
  }

  // 2) preço de referência via chart do par escolhido (aproxima spread sem UTXOs)
  const target = direct ?? depixLbtc;
  if (target) {
    console.log(`\n── Preço recente (chart) do par ${label(target.asset_pair.base)}/${label(target.asset_pair.quote)} ──`);
    try {
      type Candle = { open: number; high: number; low: number; close: number; volume: number; time: string };
      const chartRaw = (await rpc(ws, 2, {
        chart_sub: { asset_pair: target.asset_pair },
      })) as { chart_sub?: { data?: Candle[] }; data?: Candle[] };
      const points = chartRaw.chart_sub?.data ?? chartRaw.data ?? [];
      const last = points.at(-1);
      if (last) {
        // fee_asset=Base (L-USDt). Preço = quote/base = DePix por L-USDt.
        const spreadPct = ((last.high - last.low) / last.close) * 100;
        console.log(`  Último candle (${last.time}): close=${last.close.toFixed(4)} DePix por L-USDt`);
        console.log(`    → 1 L-USDt ≈ ${last.close.toFixed(2)} DePix  |  1 DePix ≈ ${(1 / last.close).toFixed(4)} L-USDt`);
        console.log(`    intraday high/low: ${last.high.toFixed(4)} / ${last.low.toFixed(4)} (amplitude ${spreadPct.toFixed(2)}%)`);
        console.log(`    volume no candle: ${last.volume.toFixed(2)}`);
        console.log(`  Histórico: ${points.length} candles diários (de ${points[0]?.time} a ${last.time}).`);
      } else {
        console.log("  Sem dados de chart retornados.");
      }
    } catch (err) {
      console.log(`  chart_sub falhou: ${(err as Error).message}`);
    }
  }

  // Dump bruto dos mercados relevantes para inspeção manual.
  console.log("\n── Mercados relevantes (bruto) ──");
  for (const m of markets) {
    const ids = [m.asset_pair.base, m.asset_pair.quote];
    if (ids.includes(DEPIX) || ids.includes(LUSDT) || ids.includes(LBTC)) {
      console.log(`  ${label(m.asset_pair.base)}/${label(m.asset_pair.quote)} ` +
        `fee_asset=${m.fee_asset ?? "?"} type=${m.type ?? "?"}`);
    }
  }

  // Fase 1b: spread real (só se o env do LWK estiver presente e houver par).
  const lwkReady = process.env.LWK_API_URL && process.env.LWK_API_KEY && process.env.PROBE_TENANT_ID;
  if (lwkReady && target) {
    try {
      await probeSpread(ws, target);
    } catch (err) {
      console.log(`\nFase 1b falhou: ${(err as Error).message}`);
      if (process.env.DEBUG) console.error(err);
    }
  } else if (!lwkReady) {
    console.log("\n(Fase 1b pulada: defina LWK_API_URL + LWK_API_KEY + PROBE_TENANT_ID p/ medir o spread real.)");
  }

  ws.close();
  console.log("\nSondagem concluída (read-only, nada foi gasto — nenhum swap executado).");
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
