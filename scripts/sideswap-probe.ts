/**
 * Sondagem Sideswap (Fase 1 — read-only) para avaliar a conversão DePix → L-USDt.
 *
 * NÃO executa swap nem gasta nada. Só consulta a API pública (WebSocket JSON-RPC)
 * em mainnet para responder, com dados reais:
 *   1. Existe par DIRETO DePix/L-USDt? Qual a orientação base/quote e o fee_asset?
 *   2. Se não houver direto, existem as pernas DePix/L-BTC e L-BTC/L-USDt?
 *   3. Preço de referência recente (via chart OHLCV) — aproxima o spread sem UTXOs.
 *
 * A curva preço×volume real (start_quotes) exige UTXOs com blinding factors da
 * carteira, que o container LWK ainda não expõe — fica para a Fase 1b (endpoint
 * /utxos no LWK). Rodar: `pnpm tsx scripts/sideswap-probe.ts`
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

  ws.close();
  console.log("\nSondagem concluída (read-only, nada foi gasto).");
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
