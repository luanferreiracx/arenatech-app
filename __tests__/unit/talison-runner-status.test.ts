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
  state.messages = [
    { direction: "incoming", senderType: "customer", content: "oi", contentType: "text", mediaUrl: null },
  ];
  state.tx.chatbotConversation.findFirst.mockResolvedValue(state.conversation);
  state.tx.chatbotConfig.findUnique.mockImplementation(() => Promise.resolve(state.config));
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

  it("não responde quando o status espelhado do Chatwoot é OPEN", async () => {
    state.conversation.status = "OPEN";

    const result = await processConversation("tenant-1", "conv-1");

    expect(result).toEqual({ status: "skipped", reason: "conversa OPEN (atendente no caso)" });
    expect(state.runTalison).not.toHaveBeenCalled();
    expect(state.sendBotMessage).not.toHaveBeenCalled();
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

  it("não responde quando a última mensagem não é do cliente", async () => {
    state.messages = [
      { direction: "outgoing", senderType: "bot", content: "olá", contentType: "text", mediaUrl: null },
    ];

    const result = await processConversation("tenant-1", "conv-1");

    expect(result).toEqual({ status: "skipped", reason: "última mensagem não é do cliente" });
    expect(state.runTalison).not.toHaveBeenCalled();
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
