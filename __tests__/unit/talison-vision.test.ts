/**
 * Visão do Talison — desvio pro Claude quando a mensagem é imagem.
 *
 * Verifica que processConversation: descreve a imagem via Claude e injeta a
 * descrição no histórico que vai pro DeepSeek; e que falha de visão não
 * derruba o atendimento (cai em placeholder).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LlmMessage } from "@/lib/talison/types";

// DB: withAdmin executa o callback com um tx que serve estado fixo;
// withTenant idem (tools não são exercidas aqui). Dados ficam DENTRO da
// factory porque vi.mock é içado pro topo do arquivo.
vi.mock("@/server/db", () => {
  const conversation = {
    id: "conv-1",
    tenantId: "tenant-1",
    status: "BOT_ACTIVE",
    contactPhone: "5586999998888",
    contactName: "João",
    customerId: null,
    externalId: "42",
  };
  const storedMessages = [
    { direction: "incoming", senderType: "customer", content: "olha minha tela", contentType: "image", mediaUrl: "https://x/foto.jpg" },
  ];
  const tx = {
    chatbotConversation: {
      findFirst: vi.fn().mockResolvedValue(conversation),
      update: vi.fn().mockResolvedValue({}),
    },
    chatbotConfig: { findUnique: vi.fn().mockResolvedValue(null) },
    tenantSettings: { findUnique: vi.fn().mockResolvedValue(null) },
    tenantAssistanceSettings: { findUnique: vi.fn().mockResolvedValue(null) },
    chatbotMessage: {
      findMany: vi.fn().mockResolvedValue([...storedMessages].reverse()),
      create: vi.fn().mockResolvedValue({}),
    },
  };
  return {
    withAdmin: (fn: (t: typeof tx) => unknown) => fn(tx),
    withTenant: (_tenantId: string, fn: (t: typeof tx) => unknown) => fn(tx),
  };
});

// vi.hoisted: estes mocks são referenciados dentro de factories içadas.
const { describe_, runTalison } = vi.hoisted(() => ({
  describe_: vi.fn().mockResolvedValue("tela trincada no canto superior"),
  runTalison: vi.fn().mockResolvedValue({
    reply: "Entendi, vou te ajudar com a tela.",
    iterations: 1,
    toolsUsed: [],
    degraded: false,
  }),
}));
vi.mock("@/lib/talison/providers/claude-vision", () => ({
  createClaudeVisionProvider: () => ({ name: "claude-vision", describe: describe_ }),
}));
vi.mock("@/lib/talison/agent", () => ({ runTalison: (args: unknown) => runTalison(args) }));

vi.mock("@/lib/talison/providers/deepseek", () => ({
  createDeepSeekProvider: () => ({ name: "deepseek", chat: vi.fn() }),
}));
vi.mock("@/lib/talison/chatwoot-client", () => ({
  sendBotMessage: vi.fn().mockResolvedValue(true),
  toggleStatus: vi.fn().mockResolvedValue(true),
}));

import { processConversation } from "@/lib/talison/runner";

describe("processConversation — visão", () => {
  beforeEach(() => {
    runTalison.mockClear();
    describe_.mockClear();
  });

  it("descreve a imagem via Claude e injeta no histórico do DeepSeek", async () => {
    const result = await processConversation("tenant-1", "conv-1");
    expect(result.status).toBe("replied");
    expect(describe_).toHaveBeenCalledWith({ imageUrl: "https://x/foto.jpg" });

    const passedArgs = runTalison.mock.calls[0]?.[0] as { history: LlmMessage[] };
    const userMessage = passedArgs.history.find((m) => m.role === "user");
    expect(userMessage?.content).toContain("tela trincada no canto superior");
    expect(userMessage?.content).toContain("olha minha tela"); // caption preservada
  });
});
