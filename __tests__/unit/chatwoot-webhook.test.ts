/**
 * Webhook Chatwoot — contrato de entrada do Talison.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  recordWebhookEvent: vi.fn().mockResolvedValue(true),
  scheduleTalisonRun: vi.fn().mockResolvedValue(undefined),
  existingConversation: null as { id: string; contactName: string | null; customerId: string | null; externalId: string | null } | null,
  customer: null as { id: string; name: string } | null,
  recentBotEcho: null as { id: string } | null,
  tx: {
    customer: {
      findFirst: vi.fn(),
    },
    chatbotConversation: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    chatbotMessage: {
      findFirst: vi.fn(),
      create: vi.fn().mockResolvedValue({}),
    },
    chatbotFollowUp: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (tx: typeof state.tx) => unknown) => fn(state.tx),
}));

vi.mock("@/lib/webhooks/replay-guard", () => ({
  recordWebhookEvent: (args: unknown) => state.recordWebhookEvent(args),
  extractSourceIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/talison/scheduler", () => ({
  scheduleTalisonRun: (tenantId: string, conversationId: string) =>
    state.scheduleTalisonRun(tenantId, conversationId),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { POST } from "@/app/api/webhooks/chatwoot/route";

const defaultConversation = {
  id: "chatwoot-42",
  status: "pending",
  meta: { sender: { phone_number: "+55 86 99999-8888" } },
};

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    event: "message_created",
    id: "msg-1",
    content: "Oi",
    message_type: "incoming",
    account: { id: "acct-1" },
    sender: { id: 10, type: "contact", name: "João", phone_number: "+55 86 99999-8888" },
    conversation: defaultConversation,
    ...overrides,
  };
}

function makeRequest(payload: Record<string, unknown>, token = "secret") {
  return new NextRequest("http://localhost/api/webhooks/chatwoot", {
    method: "POST",
    headers: { "content-type": "application/json", "x-chatwoot-signature": token },
    body: JSON.stringify(payload),
  });
}

async function callWebhook(payload: Record<string, unknown>, token = "secret") {
  return POST(makeRequest(payload, token));
}

beforeEach(() => {
  process.env.CHATWOOT_WEBHOOK_TOKEN = "secret";
  process.env.CHATWOOT_ACCOUNT_TENANT_MAP = JSON.stringify({ "acct-1": "tenant-1" });
  delete process.env.DEFAULT_TENANT_ID;

  state.recordWebhookEvent.mockClear();
  state.recordWebhookEvent.mockResolvedValue(true);
  state.scheduleTalisonRun.mockClear();
  state.existingConversation = null;
  state.customer = null;
  state.recentBotEcho = null;

  state.tx.customer.findFirst.mockImplementation(() => Promise.resolve(state.customer));
  state.tx.chatbotConversation.findFirst.mockImplementation(() =>
    Promise.resolve(state.existingConversation),
  );
  state.tx.chatbotConversation.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "conv-local-1",
    contactName: data.contactName ?? null,
    customerId: data.customerId ?? null,
    externalId: data.externalId ?? null,
  }));
  state.tx.chatbotConversation.update.mockClear();
  state.tx.chatbotMessage.create.mockClear();
  state.tx.chatbotMessage.findFirst.mockImplementation(() => Promise.resolve(state.recentBotEcho));
  state.tx.chatbotFollowUp.updateMany.mockClear();
});

describe("POST /api/webhooks/chatwoot", () => {
  it("retorna 401 quando o token é inválido", async () => {
    const response = await callWebhook(makePayload(), "wrong");

    expect(response.status).toBe(401);
    expect(state.tx.chatbotMessage.create).not.toHaveBeenCalled();
  });

  it("agenda Talison para mensagem incoming quando Chatwoot está pending", async () => {
    const response = await callWebhook(makePayload());

    expect(response.status).toBe(200);
    expect(state.tx.chatbotMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-1",
        conversationId: "conv-local-1",
        direction: "incoming",
        senderType: "customer",
        content: "Oi",
        contentType: "text",
      }),
    });
    expect(state.scheduleTalisonRun).toHaveBeenCalledWith("tenant-1", "conv-local-1");
  });

  it("persiste, mas não agenda quando Chatwoot está open", async () => {
    await callWebhook(makePayload({ conversation: { ...defaultConversation, status: "open" } }));

    expect(state.tx.chatbotMessage.create).toHaveBeenCalledOnce();
    expect(state.scheduleTalisonRun).not.toHaveBeenCalled();
    expect(state.tx.chatbotConversation.update).toHaveBeenCalledWith({
      where: { id: "conv-local-1" },
      data: expect.objectContaining({ status: "OPEN" }),
    });
  });

  it("agenda Talison quando Chatwoot está resolved", async () => {
    await callWebhook(makePayload({ conversation: { ...defaultConversation, status: "resolved" } }));

    expect(state.scheduleTalisonRun).toHaveBeenCalledWith("tenant-1", "conv-local-1");
    expect(state.tx.chatbotConversation.update).toHaveBeenCalledWith({
      where: { id: "conv-local-1" },
      data: expect.objectContaining({ status: "RESOLVED" }),
    });
  });

  it("classifica MIME image/jpeg como contentType image para acionar visão", async () => {
    await callWebhook(makePayload({
      content: undefined,
      attachments: [{ data_url: "https://cdn/foto.jpg", file_type: "image/jpeg" }],
    }));

    expect(state.tx.chatbotMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        content: "[mídia: image/jpeg]",
        contentType: "image",
        mediaUrl: "https://cdn/foto.jpg",
      }),
    });
    expect(state.scheduleTalisonRun).toHaveBeenCalledWith("tenant-1", "conv-local-1");
  });

  it("preserva mídia não-imagem com o tipo original", async () => {
    await callWebhook(makePayload({
      content: undefined,
      attachments: [{ data_url: "https://cdn/doc.pdf", file_type: "application/pdf" }],
    }));

    expect(state.tx.chatbotMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        content: "[mídia: application/pdf]",
        contentType: "application/pdf",
        mediaUrl: "https://cdn/doc.pdf",
      }),
    });
  });

  it("não duplica nem agenda quando o replay guard identifica evento repetido", async () => {
    state.recordWebhookEvent.mockResolvedValue(false);

    await callWebhook(makePayload());

    expect(state.tx.chatbotMessage.create).not.toHaveBeenCalled();
    expect(state.scheduleTalisonRun).not.toHaveBeenCalled();
  });

  it("ignora eco outgoing de resposta recente do bot", async () => {
    state.existingConversation = {
      id: "conv-local-1",
      contactName: "João",
      customerId: null,
      externalId: "chatwoot-42",
    };
    state.recentBotEcho = { id: "bot-msg-1" };

    await callWebhook(makePayload({
      content: "Resposta do Talison",
      message_type: "outgoing",
      sender: { id: 11, type: "user", name: "Talison", phone_number: "+55 86 99999-8888" },
    }));

    expect(state.tx.chatbotMessage.create).not.toHaveBeenCalled();
    expect(state.scheduleTalisonRun).not.toHaveBeenCalled();
  });
});
