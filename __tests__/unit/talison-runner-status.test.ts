/**
 * Runner do Talison — status do Chatwoot como fonte de verdade e entrega.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type ConversationStatus = "OPEN" | "BOT_ACTIVE" | "RESOLVED";
type StoredMessage = {
  direction: string;
  senderType: string;
  content: string;
  contentType: string;
  mediaUrl: string | null;
  deliveryFailed?: boolean;
};

const state = vi.hoisted(() => ({
  conversation: {
    id: "conv-1",
    tenantId: "tenant-1",
    status: "BOT_ACTIVE" as ConversationStatus,
    contactPhone: "5586999998888",
    contactName: "João",
    customerId: null as string | null,
    externalId: "42" as string | null,
  },
  config: null as { enabled?: boolean; whitelistPhones?: string[]; outOfHoursMessage?: string | null } | null,
  tenantSettings: null as {
    tradeName?: string | null;
    phone?: string | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    businessHours?: string | null;
  } | null,
  tenantAssistanceSettings: null as {
    pixDiscount?: { toString(): string } | null;
    installmentsNoInterest?: number | null;
  } | null,
  messages: [
    {
      direction: "incoming",
      senderType: "customer",
      content: "oi",
      contentType: "text",
      mediaUrl: null,
    },
  ] as StoredMessage[],
  tx: {
    chatbotConversation: {
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    chatbotConfig: {
      findUnique: vi.fn(),
    },
    tenantSettings: {
      findUnique: vi.fn(),
    },
    tenantAssistanceSettings: {
      findUnique: vi.fn(),
    },
    chatbotMessage: {
      findMany: vi.fn(),
      create: vi.fn().mockResolvedValue({}),
    },
  },
  runTalison: vi.fn().mockResolvedValue({
    reply: "Resposta do Talison",
    iterations: 1,
    toolsUsed: [],
    degraded: false,
  }),
  sendBotMessage: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (tx: typeof state.tx) => unknown) => fn(state.tx),
  withTenant: (_tenantId: string, fn: (tx: typeof state.tx) => unknown) => fn(state.tx),
}));

vi.mock("@/lib/talison/agent", () => ({
  runTalison: (args: unknown) => state.runTalison(args),
}));

vi.mock("@/lib/talison/providers/deepseek", () => ({
  createDeepSeekProvider: () => ({ name: "deepseek", chat: vi.fn() }),
}));

vi.mock("@/lib/talison/providers/claude-vision", () => ({
  createClaudeVisionProvider: () => ({ name: "claude-vision", describe: vi.fn() }),
}));

vi.mock("@/lib/talison/chatwoot-client", () => ({
  sendBotMessage: (conversationId: string, content: string) => state.sendBotMessage(conversationId, content),
  toggleStatus: vi.fn().mockResolvedValue(true),
}));

import { processConversation } from "@/lib/talison/runner";

function resetState() {
  state.conversation.status = "BOT_ACTIVE";
  state.conversation.externalId = "42";
  state.config = null;
  state.tenantSettings = null;
  state.tenantAssistanceSettings = null;
  state.messages = [
    { direction: "incoming", senderType: "customer", content: "oi", contentType: "text", mediaUrl: null },
  ];
  state.tx.chatbotConversation.findFirst.mockResolvedValue(state.conversation);
  state.tx.chatbotConfig.findUnique.mockImplementation(() => Promise.resolve(state.config));
  state.tx.tenantSettings.findUnique.mockImplementation(() => Promise.resolve(state.tenantSettings));
  state.tx.tenantAssistanceSettings.findUnique.mockImplementation(() =>
    Promise.resolve(state.tenantAssistanceSettings),
  );
  state.tx.chatbotMessage.findMany.mockImplementation(() => Promise.resolve([...state.messages].reverse()));
  state.tx.chatbotConversation.update.mockClear();
  state.tx.chatbotMessage.create.mockClear();
  state.runTalison.mockClear();
  state.runTalison.mockResolvedValue({
    reply: "Resposta do Talison",
    iterations: 1,
    toolsUsed: [],
    degraded: false,
  });
  state.sendBotMessage.mockClear();
  state.sendBotMessage.mockResolvedValue(true);
}

describe("processConversation — status e entrega", () => {
  beforeEach(() => {
    resetState();
  });

  it("nunca responde com IA quando o status é OPEN (território do atendente)", async () => {
    state.conversation.status = "OPEN";
    // Mesmo sem nenhum humano ter falado, o bot NÃO responde com IA em OPEN —
    // o acompanhamento fica por conta do cron de espera (mensagem + alerta).
    state.messages = [
      { direction: "incoming", senderType: "customer", content: "oi", contentType: "text", mediaUrl: null },
      { direction: "outgoing", senderType: "bot", content: "vou te transferir", contentType: "text", mediaUrl: null },
      { direction: "incoming", senderType: "customer", content: "alguém aí?", contentType: "text", mediaUrl: null },
    ];

    const result = await processConversation("tenant-1", "conv-1");

    expect(result).toEqual({ status: "skipped", reason: "conversa OPEN (atendente no caso)" });
    expect(state.runTalison).not.toHaveBeenCalled();
    expect(state.sendBotMessage).not.toHaveBeenCalled();
  });

  it("não responde quando um atendente humano já falou na conversa (mesmo em BOT_ACTIVE)", async () => {
    // Regressão (varredura jun/26): atendente entra e digita sem fazer o "assign"
    // (status segue BOT_ACTIVE) e o bot atropela respondendo junto. O bot deve recuar.
    state.conversation.status = "BOT_ACTIVE";
    state.messages = [
      { direction: "incoming", senderType: "customer", content: "tem iphone?", contentType: "text", mediaUrl: null },
      { direction: "outgoing", senderType: "bot", content: "temos sim!", contentType: "text", mediaUrl: null },
      { direction: "outgoing", senderType: "agent", content: "oi, sou o Romulo", contentType: "text", mediaUrl: null },
      { direction: "incoming", senderType: "customer", content: "está manchado?", contentType: "text", mediaUrl: null },
    ];

    const result = await processConversation("tenant-1", "conv-1");

    expect(result).toEqual({ status: "skipped", reason: "atendente humano já respondeu nesta conversa" });
    expect(state.runTalison).not.toHaveBeenCalled();
    expect(state.sendBotMessage).not.toHaveBeenCalled();
  });

  it("RESPONDE se a única mensagem de atendente falhou na entrega (cliente não recebeu)", async () => {
    state.conversation.status = "BOT_ACTIVE";
    state.messages = [
      { direction: "incoming", senderType: "customer", content: "tem iphone?", contentType: "text", mediaUrl: null },
      { direction: "outgoing", senderType: "agent", content: "oi", contentType: "text", mediaUrl: null, deliveryFailed: true },
      { direction: "incoming", senderType: "customer", content: "alô?", contentType: "text", mediaUrl: null },
    ];

    const result = await processConversation("tenant-1", "conv-1");

    expect(result.status).toBe("replied");
    expect(state.runTalison).toHaveBeenCalledOnce();
  });

  it.each(["BOT_ACTIVE", "RESOLVED"] as const)(
    "responde quando o status espelhado é %s e a última mensagem é do cliente",
    async (status) => {
      state.conversation.status = status;

      const result = await processConversation("tenant-1", "conv-1");

      expect(result.status).toBe("replied");
      expect(result.delivery).toBe("sent");
      expect(state.runTalison).toHaveBeenCalledOnce();
      expect(state.sendBotMessage).toHaveBeenCalledWith("42", "Resposta do Talison");
    },
  );

  it("não responde quando o bot está desativado no tenant", async () => {
    state.config = { enabled: false };

    const result = await processConversation("tenant-1", "conv-1");

    expect(result).toEqual({ status: "skipped", reason: "bot desativado" });
    expect(state.runTalison).not.toHaveBeenCalled();
  });

  it("respeita whitelist por sufixo de telefone", async () => {
    state.config = { enabled: true, whitelistPhones: ["86911112222"] };

    const blocked = await processConversation("tenant-1", "conv-1");
    expect(blocked).toEqual({ status: "skipped", reason: "fora da whitelist" });
    expect(state.runTalison).not.toHaveBeenCalled();

    state.config = { enabled: true, whitelistPhones: ["86999998888"] };
    const allowed = await processConversation("tenant-1", "conv-1");
    expect(allowed.status).toBe("replied");
    expect(state.runTalison).toHaveBeenCalledOnce();
  });

  it("não responde quando não há mensagem do cliente pendente", async () => {
    state.messages = [
      { direction: "outgoing", senderType: "bot", content: "olá", contentType: "text", mediaUrl: null },
    ];

    const result = await processConversation("tenant-1", "conv-1");

    expect(result).toEqual({ status: "skipped", reason: "sem mensagem do cliente pendente de resposta" });
    expect(state.runTalison).not.toHaveBeenCalled();
  });

  it("responde follow-up do cliente mesmo após resposta anterior do bot", async () => {
    // Regressão da "corrida da saudação": cliente manda nova pergunta depois de
    // uma resposta do bot — não pode ficar órfã só porque o bot já falou antes.
    state.messages = [
      { direction: "incoming", senderType: "customer", content: "oi", contentType: "text", mediaUrl: null },
      { direction: "outgoing", senderType: "bot", content: "olá! como ajudo?", contentType: "text", mediaUrl: null },
      { direction: "incoming", senderType: "customer", content: "quanto custa a troca de tela?", contentType: "text", mediaUrl: null },
    ];

    const result = await processConversation("tenant-1", "conv-1");

    expect(result.status).toBe("replied");
    expect(state.runTalison).toHaveBeenCalledOnce();
  });

  it("injeta contexto de negócio configurado no prompt do Talison", async () => {
    state.tenantSettings = {
      tradeName: "Arena Tech Matriz",
      phone: "(86) 1111-2222",
      street: "Av. Teste",
      city: "Teresina",
      state: "PI",
      businessHours: "Seg-Sex 10h-18h",
    };
    state.tenantAssistanceSettings = {
      pixDiscount: { toString: () => "6.00" },
      installmentsNoInterest: 8,
    };

    await processConversation("tenant-1", "conv-1");

    expect(state.runTalison).toHaveBeenCalledOnce();
    expect(state.runTalison).toHaveBeenCalledWith(
      expect.objectContaining({
        promptContext: expect.objectContaining({
          contactName: "João",
          businessContext: expect.objectContaining({
            storeName: "Arena Tech Matriz",
            businessHours: "Seg-Sex 10h-18h",
            delivery: expect.stringContaining("Teresina/PI"),
            limitations: expect.arrayContaining([expect.stringContaining("não prometa disponibilidade")]),
            payments: expect.arrayContaining([
              expect.stringContaining("PIX, dinheiro, débito e crédito"),
              expect.stringContaining("6% de desconto"),
              expect.stringContaining("até 8x sem juros"),
            ]),
          }),
        }),
      }),
    );
  });

  it("marca delivery failed quando o Chatwoot não recebe a resposta", async () => {
    state.sendBotMessage.mockResolvedValue(false);

    const result = await processConversation("tenant-1", "conv-1");

    expect(result).toEqual({ status: "replied", delivery: "failed" });
    expect(state.tx.chatbotMessage.create).toHaveBeenCalledOnce();
    expect(state.sendBotMessage).toHaveBeenCalledWith("42", "Resposta do Talison");
  });

  it("marca delivery skipped quando a conversa não tem externalId", async () => {
    state.conversation.externalId = null;

    const result = await processConversation("tenant-1", "conv-1");

    expect(result).toEqual({ status: "replied", delivery: "skipped" });
    expect(state.tx.chatbotMessage.create).toHaveBeenCalledOnce();
    expect(state.sendBotMessage).not.toHaveBeenCalled();
  });
});
