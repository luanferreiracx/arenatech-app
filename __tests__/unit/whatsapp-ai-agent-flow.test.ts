import { describe, expect, it, vi, beforeEach } from "vitest";
import type { WhatsappAiInboundMessage } from "@/lib/whatsapp-ai-agent/evolution-payload";

const { tx, generateWhatsappAiReply, sendTextMessage } = vi.hoisted(() => {
  const tx = {
    whatsappAiConversation: {
      upsert: vi.fn().mockResolvedValue({ id: "conv-1", paused: false, model: null, agentKind: "assistant" }),
      update: vi.fn().mockResolvedValue({}),
    },
    whatsappAiExecution: {
      create: vi.fn().mockResolvedValue({ id: "exec-1" }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    whatsappAiMessage: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([
        { role: "user", content: "oi" },
      ]),
    },
  };

  return {
    tx,
    generateWhatsappAiReply: vi.fn().mockResolvedValue("Olá, Luan."),
    sendTextMessage: vi.fn().mockResolvedValue({ success: true, messageId: "sent-1" }),
  };
});

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (transaction: typeof tx) => unknown) => fn(tx),
}));

vi.mock("@/lib/whatsapp-ai-agent/claude-provider", () => ({
  generateWhatsappAiReply: (params: unknown) => generateWhatsappAiReply(params),
}));

vi.mock("@/lib/services/whatsapp-service", () => ({
  sendTextMessage: (phone: string, text: string, options: unknown) =>
    sendTextMessage(phone, text, options),
}));

import { processWhatsappAiMessage } from "@/lib/whatsapp-ai-agent/agent";

describe("processWhatsappAiMessage", () => {
  beforeEach(() => {
    tx.whatsappAiConversation.upsert.mockClear();
    tx.whatsappAiConversation.update.mockClear();
    tx.whatsappAiExecution.create.mockClear();
    tx.whatsappAiExecution.findFirst.mockClear();
    tx.whatsappAiMessage.findFirst.mockClear();
    tx.whatsappAiMessage.create.mockClear();
    tx.whatsappAiMessage.findMany.mockClear();
    generateWhatsappAiReply.mockClear();
    sendTextMessage.mockClear();
  });

  it("persiste entrada, gera resposta e envia pela instância Evolution do agente", async () => {
    const message: WhatsappAiInboundMessage = {
      event: "messages.upsert",
      instanceName: "arena-cripto",
      messageId: "msg-1",
      remoteJid: "5586995423021@s.whatsapp.net",
      fromMe: false,
      isGroup: false,
      pushName: "Luan",
      text: "oi",
      timestamp: new Date("2026-06-04T12:00:00.000Z"),
    };

    const result = await processWhatsappAiMessage({
      tenantId: "00000000-0000-0000-0000-000000000001",
      phone: "5586995423021",
      message,
    });

    expect(result).toEqual({ status: "replied", providerMessageId: "sent-1" });
    expect(tx.whatsappAiMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ role: "user", content: "oi", evolutionMessageId: "msg-1" }),
    }));
    expect(generateWhatsappAiReply).toHaveBeenCalledWith({ history: [], userMessage: "oi", model: null });
    expect(sendTextMessage).toHaveBeenCalledWith("5586995423021", "Olá, Luan.", {
      instanceName: "arena-cripto",
    });
    expect(tx.whatsappAiMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ role: "assistant", content: "Olá, Luan.", providerMessageId: "sent-1" }),
    }));
  });

  it("cria execução quando a mensagem vem do agente Claude Code", async () => {
    tx.whatsappAiConversation.upsert.mockResolvedValueOnce({
      id: "conv-1",
      paused: false,
      model: "claude-opus-4-8",
      agentKind: "claude_code",
    });

    const result = await processWhatsappAiMessage({
      tenantId: "00000000-0000-0000-0000-000000000001",
      phone: "447782278602",
      agentKind: "claude_code",
      message: {
        event: "messages.upsert",
        instanceName: "arena-cripto",
        messageId: "msg-code-1",
        remoteJid: "447782278602@s.whatsapp.net",
        fromMe: false,
        isGroup: false,
        pushName: "Luan UK",
        text: "/run rode git status",
        timestamp: new Date("2026-06-04T12:00:00.000Z"),
      },
    });

    expect(result).toEqual({ status: "queued", executionId: "exec-1", providerMessageId: "sent-1" });
    expect(tx.whatsappAiExecution.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: "00000000-0000-0000-0000-000000000001",
        conversationId: "conv-1",
        status: "queued",
        prompt: expect.stringContaining("rode git status"),
        workdir: "/home/deployer/arenatech-app",
      }),
    }));
    expect(sendTextMessage).toHaveBeenCalledWith("447782278602", expect.stringContaining("Vou executar no Claude Code"), {
      instanceName: "arena-cripto",
    });
  });

  it("não responde novamente quando a mensagem já existe", async () => {
    tx.whatsappAiMessage.findFirst.mockResolvedValueOnce({ id: "existing" });

    const result = await processWhatsappAiMessage({
      tenantId: "00000000-0000-0000-0000-000000000001",
      phone: "5586995423021",
      message: {
        event: "messages.upsert",
        instanceName: "arena-cripto",
        messageId: "msg-1",
        remoteJid: "5586995423021@s.whatsapp.net",
        fromMe: false,
        isGroup: false,
        pushName: "Luan",
        text: "oi",
        timestamp: new Date("2026-06-04T12:00:00.000Z"),
      },
    });

    expect(result).toEqual({ status: "skipped", reason: "duplicate message" });
    expect(generateWhatsappAiReply).not.toHaveBeenCalled();
    expect(sendTextMessage).not.toHaveBeenCalled();
  });
});
