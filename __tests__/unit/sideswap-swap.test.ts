/**
 * Serviço de swap DePix→L-USDt (Sideswap, Fase 2). Testa os guard-rails de
 * ENTRADA (saldo, endereços) sem tocar o WebSocket, e o guard-rail de preço com
 * um WebSocket mockado que simula o fluxo start_quotes→get_quote→taker_sign.
 * Nunca executa swap real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUtxos = vi.fn();
const signPset = vi.fn();
const generateAddress = vi.fn();

vi.mock("@/lib/services/lwk-service", () => ({
  getUtxos: (...a: unknown[]) => getUtxos(...a),
  signPset: (...a: unknown[]) => signPset(...a),
  generateAddress: (...a: unknown[]) => generateAddress(...a),
}));

import { executeSwap, DEPIX_ASSET } from "@/server/services/sideswap-swap.service";

const BASE = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  amountSats: 100_000_000, // 1 DePix
  encryptedSeed: "blob",
  passphrase: "pass",
};

function depixUtxo(value: number) {
  return { txid: "t", vout: 0, asset: DEPIX_ASSET, value, asset_bf: "a", value_bf: "v", is_depix: true };
}

/**
 * WebSocket mockado: responde start_quotes/get_quote/taker_sign e emite a
 * notificação `quote` com o status informado. Simula o protocolo Sideswap.
 */
function installMockWebSocket(quoteStatus: Record<string, unknown>) {
  class MockWS {
    onmessage: ((ev: { data: string }) => void) | null = null;
    listeners: Record<string, Array<(ev: unknown) => void>> = {};
    addEventListener(type: string, cb: (ev: unknown) => void) {
      (this.listeners[type] ??= []).push(cb);
      if (type === "open") setTimeout(() => cb({}), 0);
    }
    removeEventListener(type: string, cb: (ev: unknown) => void) {
      this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== cb);
    }
    close() {}
    send(raw: string) {
      const msg = JSON.parse(raw);
      const action = Object.keys(msg.params)[0];
      const emit = (data: unknown) =>
        this.listeners.message?.forEach((cb) => cb({ data: JSON.stringify(data) }));
      if (action === "start_quotes") {
        emit({ id: msg.id, result: { start_quotes: { quote_sub_id: 1 } } });
        // notificação de quote (sem id) — atrasada p/ o awaitQuote já ter
        // registrado o listener (o serviço faz await do start_quotes antes).
        setTimeout(() => emit({ params: { quote: { quote_sub_id: 1, status: quoteStatus } } }), 0);
      } else if (action === "get_quote") {
        emit({ id: msg.id, result: { get_quote: { pset: "PSET_BASE64" } } });
      } else if (action === "taker_sign") {
        emit({ id: msg.id, result: { taker_sign: { txid: "TXID123" } } });
      }
    }
  }
  vi.stubGlobal("WebSocket", MockWS as unknown as typeof WebSocket);
}

const SUCCESS_QUOTE = {
  Success: { quote_id: 9, base_amount: 18_000_000, quote_amount: 100_000_000, server_fee: 36_000, fixed_fee: 6_000_000 },
};

beforeEach(() => {
  for (const m of [getUtxos, signPset, generateAddress]) m.mockReset();
  generateAddress.mockResolvedValue({ success: true, address: "lq1addr" });
  signPset.mockResolvedValue({ success: true, signedPset: "SIGNED_PSET" });
  vi.unstubAllGlobals();
});

describe("executeSwap — guard-rails de entrada", () => {
  it("rejeita quando o saldo de DePix é insuficiente", async () => {
    getUtxos.mockResolvedValue({ success: true, utxos: [depixUtxo(50_000_000)] }); // 0,5 DePix < 1
    const r = await executeSwap(BASE);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/insuficiente/i);
  });

  it("propaga erro do LWK ao buscar UTXOs", async () => {
    getUtxos.mockResolvedValue({ success: false, error: "LWK indisponivel" });
    const r = await executeSwap(BASE);
    expect(r.success).toBe(false);
  });

  it("rejeita quando não consegue gerar endereço", async () => {
    getUtxos.mockResolvedValue({ success: true, utxos: [depixUtxo(200_000_000)] });
    generateAddress.mockResolvedValueOnce({ success: false, error: "x" });
    const r = await executeSwap(BASE);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/endereço/i);
  });
});

describe("executeSwap — fluxo com Sideswap mockado", () => {
  it("executa o swap e retorna o txid no caminho feliz", async () => {
    getUtxos.mockResolvedValue({ success: true, utxos: [depixUtxo(200_000_000)] });
    installMockWebSocket(SUCCESS_QUOTE);
    const r = await executeSwap(BASE);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.txid).toBe("TXID123");
      expect(r.soldDepixSats).toBe(100_000_000);
      expect(r.grossUsdtSats).toBe(18_000_000);
    }
  });

  it("guard-rail: aborta se o preço passar do teto (não assina)", async () => {
    getUtxos.mockResolvedValue({ success: true, utxos: [depixUtxo(200_000_000)] });
    installMockWebSocket(SUCCESS_QUOTE); // preço = 100M/18M ≈ 5,55
    const r = await executeSwap({ ...BASE, maxPriceDepixPerUsdt: 5.0 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/ágio acima/i);
    expect(signPset).not.toHaveBeenCalled(); // abortou antes de assinar
  });

  it("propaga LowBalance como sem-cotação", async () => {
    getUtxos.mockResolvedValue({ success: true, utxos: [depixUtxo(200_000_000)] });
    installMockWebSocket({ LowBalance: { available: 1 } });
    const r = await executeSwap(BASE);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/cotação/i);
  });
});
