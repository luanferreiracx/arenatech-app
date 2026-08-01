/**
 * Loop do agente Talison — testes com provider fake.
 *
 * O provider é programado com uma fila de respostas; assim controlamos
 * exatamente o ciclo (resposta direta, tool-then-answer, loop infinito,
 * erro) sem rede nem modelo real.
 */

import { describe, it, expect, vi } from "vitest";
import { runTalison } from "@/lib/talison/agent";
import type { LlmCompletion, LlmProvider } from "@/lib/talison/types";
import type { TalisonToolContext } from "@/lib/talison/tools/contract";

vi.mock("@/lib/talison/chatwoot-client", () => ({
  sendBotMessage: vi.fn().mockResolvedValue(true),
  toggleStatus: vi.fn().mockResolvedValue(true),
}));

/** Provider que devolve respostas de uma fila, em ordem. */
function fakeProvider(queue: LlmCompletion[]): LlmProvider {
  let index = 0;
  return {
    name: "fake",
    chat: vi.fn(async () => {
      const next = queue[index] ?? { text: "fim", toolCalls: [] };
      index += 1;
      return next;
    }),
  };
}

function makeToolContext(): TalisonToolContext {
  return {
    tenantId: "tenant-1",
    tenantSlug: "arena-tech",
    isCentralTenant: true,
    conversation: {
      id: "conv-1",
      contactPhone: "5586999998888",
      contactName: "João",
      customerId: "cust-1",
      externalId: "42",
    },
    // Tool de status acha uma OS — usado no teste de ciclo com tool.
    withTenant: (fn) =>
      fn({
        serviceOrder: {
          findFirst: vi.fn().mockResolvedValue({
            number: "OS-1",
            status: "READY_FOR_PICKUP",
            deviceModel: "iPhone",
            estimatedDate: null,
            totalAmount: { toString: () => "100.00" },
            deliveredDate: null,
          }),
        },
      } as never),
  };
}

const baseArgs = (provider: LlmProvider) => ({
  provider,
  toolContext: makeToolContext(),
  promptContext: { contactName: "João" },
  history: [{ role: "user" as const, content: "oi" }],
});

describe("runTalison", () => {
  it("retorna a resposta direta quando o modelo não pede tool", async () => {
    const provider = fakeProvider([{ text: "Olá, João! Como posso ajudar?", toolCalls: [] }]);
    const result = await runTalison(baseArgs(provider));

    expect(result.degraded).toBe(false);
    expect(result.reply).toContain("João");
    expect(result.iterations).toBe(1);
    expect(result.toolsUsed).toEqual([]);
  });

  /**
   * Regressão de 01/08/2026: PRICE_TOOLS listava "consultar_avaliacao", nome que
   * não existe no registry. A tool real da troca é "calcular_avaliacao", então
   * TODA avaliação virava "valor em dinheiro sem tool de preço" — falso positivo
   * que inflava a métrica e escondia caso de verdade.
   */
  it("não marca preço suspeito quando calcular_avaliacao rodou (é tool de preço)", async () => {
    const provider = fakeProvider([
      { text: "", toolCalls: [{ id: "t1", name: "calcular_avaliacao", arguments: {} }] },
      { text: "Yago, seu iPhone 15 Pro Max 256GB ficou avaliado em R$ 3.600,00!", toolCalls: [] },
    ]);

    const result = await runTalison(baseArgs(provider));

    expect(result.toolsUsed).toContain("calcular_avaliacao");
    expect(result.suspiciousPrice).toBe(false);
  });

  it("marca preço suspeito quando o valor sai sem nenhuma tool de preço", async () => {
    const provider = fakeProvider([{ text: "Fica R$ 3.600,00 pra você!", toolCalls: [] }]);

    const result = await runTalison(baseArgs(provider));

    expect(result.suspiciousPrice).toBe(true);
  });

  it("executa a tool pedida e usa o resultado na resposta final", async () => {
    const provider = fakeProvider([
      {
        text: "",
        toolCalls: [{ id: "t1", name: "consultar_status_os", arguments: { numero_os: "OS-1" } }],
      },
      { text: "Sua OS-1 está pronta para retirada!", toolCalls: [] },
    ]);

    const result = await runTalison(baseArgs(provider));

    expect(result.degraded).toBe(false);
    expect(result.toolsUsed).toEqual(["consultar_status_os"]);
    expect(result.iterations).toBe(2);
    expect(result.reply).toContain("pronta");
  });

  it("cai no fail-safe quando estoura o teto de iterações (loop de tools)", async () => {
    // Sempre pede tool, nunca dá resposta final.
    const provider = fakeProvider(
      Array.from({ length: 10 }, () => ({
        text: "",
        toolCalls: [{ id: "t", name: "consultar_status_os", arguments: {} }],
      })),
    );

    const result = await runTalison(baseArgs(provider));
    expect(result.degraded).toBe(true);
    expect(result.reply).toContain("atendente");
  });

  it("cai no fail-safe quando o provider lança erro", async () => {
    const provider: LlmProvider = {
      name: "boom",
      chat: vi.fn().mockRejectedValue(new Error("rede caiu")),
    };
    const result = await runTalison(baseArgs(provider));
    expect(result.degraded).toBe(true);
    expect(result.reply).toContain("atendente");
  });

  it("cai no fail-safe quando o modelo responde vazio sem pedir tool", async () => {
    const provider = fakeProvider([{ text: "   ", toolCalls: [] }]);
    const result = await runTalison(baseArgs(provider));
    expect(result.degraded).toBe(true);
  });
});

/**
 * TL-1 — consumo de tokens por conversa.
 *
 * O provider já devolvia `usage` (inputTokens/outputTokens) e **nenhum código
 * lia**: em julho de 2026 o bot processou 12.104 mensagens e o custo era
 * invisível. A soma tem que ser do LAÇO INTEIRO — um diálogo que gastou cinco
 * rodadas de tool-call custa muito mais que um que respondeu de primeira, e sem
 * somar os dois pareciam iguais.
 */
describe("TL-1 — telemetria de consumo de tokens", () => {
  it("soma o consumo de todas as iterações do laço", async () => {
    const logger = await import("@/lib/logger");
    const info = vi.spyOn(logger.logger, "info").mockImplementation(() => undefined);

    const provider = fakeProvider([
      {
        text: "",
        toolCalls: [{ id: "1", name: "consultar_status_os", arguments: { numero_os: "OS-1" } }],
        usage: { inputTokens: 100, outputTokens: 20 },
      },
      { text: "Sua OS está pronta!", toolCalls: [], usage: { inputTokens: 150, outputTokens: 30 } },
    ]);

    await runTalison(baseArgs(provider));

    const metrica = info.mock.calls.find(
      ([msg, fields]) =>
        msg === "talison.metric" &&
        (fields as { talisonMetric?: string })?.talisonMetric === "tokens",
    );
    expect(metrica, "nenhuma métrica de tokens foi emitida").toBeDefined();

    const campos = metrica![1] as Record<string, unknown>;
    expect(campos.inputTokens).toBe(250); // 100 + 150, as duas iterações
    expect(campos.outputTokens).toBe(50); // 20 + 30
    expect(campos.iterations).toBe(2);
    expect(campos.tenantId).toBe("tenant-1");

    info.mockRestore();
  });

  it("não emite métrica quando o provider não informa consumo", async () => {
    const logger = await import("@/lib/logger");
    const info = vi.spyOn(logger.logger, "info").mockImplementation(() => undefined);

    const provider = fakeProvider([{ text: "Olá!", toolCalls: [] }]);
    await runTalison(baseArgs(provider));

    const metrica = info.mock.calls.find(
      ([msg, fields]) =>
        msg === "talison.metric" &&
        (fields as { talisonMetric?: string })?.talisonMetric === "tokens",
    );
    // Zero não é dado: emitir "0 tokens" poluiria a agregação com ruído.
    expect(metrica).toBeUndefined();

    info.mockRestore();
  });
});
