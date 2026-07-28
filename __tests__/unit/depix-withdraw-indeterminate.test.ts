/**
 * Regressão do TXW20260727-00002: saque transmitido, app disse "falhou".
 *
 * O LWK construiu, assinou e TRANSMITIU a transação (txid
 * 422f166881bb9efce7701b25d742f724abe031d4f29b051d84f829c4fc5008ca, confirmada
 * no bloco 3991619) — mas a resposta HTTP se perdeu no timeout. O cliente caiu
 * no `catch`, devolveu `success:false`, e o app gravou **FAILED** com uma
 * mensagem mandando tentar de novo.
 *
 * O operador refez o pagamento por fora achando que não tinha saído. O
 * destinatário recebeu duas vezes e só devolveu por boa-fé. Ou seja: o prejuízo
 * não foi evitado por nenhum controle nosso.
 *
 * A distinção que estes testes travam:
 *   - LWK RESPONDEU erro  -> a tx não foi ao ar -> FAILED é correto.
 *   - Resposta se PERDEU  -> não sabemos       -> nunca FAILED.
 *
 * E por que não basta "tentar de novo": o LWK grava o registro de idempotência
 * DEPOIS do broadcast e não segura o lock durante ele. Um retry dentro da janela
 * de voo passa pela checagem e transmite de novo — gasto em dobro.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const ENV = {
  LWK_API_URL: "http://lwk:5000",
  LWK_API_KEY: "k",
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubEnv("LWK_API_URL", ENV.LWK_API_URL);
  vi.stubEnv("LWK_API_KEY", ENV.LWK_API_KEY);
});

async function transfer() {
  const { transfer: doTransfer } = await import("@/lib/services/lwk-service");
  return doTransfer("tenant-1", [{ to: "lq1qq...", amountBrl: 393.94 }], {
    idempotencyKey: "9e008328-2a80-4b0a-b041-b8803fb3ab41",
  });
}

describe("transfer do LWK: falha definitiva vs indeterminada", () => {
  it("marca INDETERMINADO quando a resposta se perde (timeout/rede)", async () => {
    fetchMock.mockRejectedValue(new Error("fetch failed: timeout"));

    const r = await transfer();

    expect(r.success).toBe(false);
    // O ponto do incidente: isto NÃO pode ser indistinguível de "falhou".
    expect(r.indeterminate).toBe(true);
  });

  it("NÃO marca indeterminado quando o LWK responde um erro de negócio", async () => {
    // LWK respondeu => a tx comprovadamente não foi transmitida.
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "insufficient_depix" }),
      text: async () => '{"error":"insufficient_depix"}',
    });

    const r = await transfer();

    expect(r.success).toBe(false);
    expect(r.indeterminate).toBeFalsy();
    expect(r.error).toBe("Saldo DePix insuficiente.");
  });

  it("mensagem do caso indeterminado não manda refazer o saque", async () => {
    fetchMock.mockRejectedValue(new Error("socket hang up"));

    const r = await transfer();

    // "Tente novamente" nesta situação é o que causa o pagamento duplicado.
    expect(r.error).toBeDefined();
    expect(r.error?.toLowerCase()).not.toContain("tente novamente");
  });
});

describe("regra de status no saque indeterminado", () => {
  it("o service trata indeterminado antes do ramo de FAILED", async () => {
    // Guarda estrutural: a ordem importa. Se o ramo `!sweep.success ||
    // !sweep.txid` vier primeiro, ele engole o caso indeterminado e volta a
    // gravar FAILED — exatamente o bug.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "src", "server", "services", "depix-transaction.service.ts"),
      "utf8",
    );

    const idxIndeterminate = src.indexOf("sweep.indeterminate");
    const idxFailed = src.indexOf("!sweep.success || !sweep.txid");

    expect(idxIndeterminate).toBeGreaterThan(-1);
    expect(idxFailed).toBeGreaterThan(-1);
    expect(idxIndeterminate).toBeLessThan(idxFailed);

    // E o status gravado no caso indeterminado precisa manter a reserva viva
    // (PENDING/PROCESSING contam na reserva; FAILED não).
    const block = src.slice(idxIndeterminate, idxFailed);
    expect(block).toContain('status: "PROCESSING"');
    expect(block).not.toContain('status: "FAILED"');
  });
});
