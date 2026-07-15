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
