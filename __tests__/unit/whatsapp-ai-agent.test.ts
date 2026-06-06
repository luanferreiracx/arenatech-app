import { describe, expect, it } from "vitest";
import { digitsOnly, isAllowedPhone, phoneFromJid, resolveAgentKindForPhone, validateWhatsappAiInboundAccess } from "@/lib/whatsapp-ai-agent/access-control";
import { parseEvolutionAiInbound } from "@/lib/whatsapp-ai-agent/evolution-payload";

describe("whatsapp-ai-agent access control", () => {
  it("normaliza telefones e JIDs", () => {
    expect(digitsOnly("(86) 99542-3021")).toBe("86995423021");
    expect(phoneFromJid("5586995423021@s.whatsapp.net")).toBe("5586995423021");
  });

  it("permite telefone único ou CSV por sufixo", () => {
    expect(isAllowedPhone("5586995423021@s.whatsapp.net", "86995423021")).toEqual({
      allowed: true,
      phone: "5586995423021",
      agentKind: "assistant",
    });
    expect(isAllowedPhone("558695423021@s.whatsapp.net", "86995423021,8695423021")).toEqual({
      allowed: true,
      phone: "558695423021",
      agentKind: "assistant",
    });
    expect(isAllowedPhone("5586999999999@s.whatsapp.net", "86995423021,8695423021")).toEqual({
      allowed: false,
      reason: "unauthorized sender",
    });
  });

  it("roteia número BR para assistente e +44 para Claude Code", () => {
    const config = {
      assistantPhones: "86995423021,8695423021",
      codePhones: "447782278602",
      legacyAllowedPhone: null,
    };

    expect(resolveAgentKindForPhone("558695423021@s.whatsapp.net", config)).toEqual({
      allowed: true,
      phone: "558695423021",
      agentKind: "assistant",
    });
    expect(resolveAgentKindForPhone("447782278602@s.whatsapp.net", config)).toEqual({
      allowed: true,
      phone: "447782278602",
      agentKind: "claude_code",
    });
    expect(resolveAgentKindForPhone("5511999999999@s.whatsapp.net", config)).toEqual({
      allowed: false,
      reason: "unauthorized sender",
    });
  });

  it("bloqueia grupos, fromMe, instância inesperada e texto vazio", () => {
    const config = {
      enabled: true,
      webhookToken: "secret",
      instanceName: "arena-cripto",
      assistantPhones: "86995423021",
      codePhones: null,
      legacyAllowedPhone: "86995423021",
      tenantId: "tenant-1",
    };

    expect(validateWhatsappAiInboundAccess({ config, instanceName: "outra", remoteJid: "5586995423021@s.whatsapp.net", fromMe: false, isGroup: false, hasContent: true })).toEqual({ allowed: false, reason: "unexpected instance" });
    expect(validateWhatsappAiInboundAccess({ config, instanceName: "arena-cripto", remoteJid: "5586995423021@s.whatsapp.net", fromMe: true, isGroup: false, hasContent: true })).toEqual({ allowed: false, reason: "from me" });
    expect(validateWhatsappAiInboundAccess({ config, instanceName: "arena-cripto", remoteJid: "5586995423021@g.us", fromMe: false, isGroup: true, hasContent: true })).toEqual({ allowed: false, reason: "group message" });
    expect(validateWhatsappAiInboundAccess({ config, instanceName: "arena-cripto", remoteJid: "5586995423021@s.whatsapp.net", fromMe: false, isGroup: false, hasContent: false })).toEqual({ allowed: false, reason: "empty content" });
  });
  it("permite mensagem com imagem mesmo sem texto", () => {
    const config = {
      enabled: true,
      webhookToken: "secret",
      instanceName: "arena-cripto",
      assistantPhones: "86995423021",
      codePhones: null,
      legacyAllowedPhone: "86995423021",
      tenantId: "tenant-1",
    };

    expect(validateWhatsappAiInboundAccess({
      config,
      instanceName: "arena-cripto",
      remoteJid: "5586995423021@s.whatsapp.net",
      fromMe: false,
      isGroup: false,
      hasContent: true,
    })).toEqual({ allowed: true, phone: "5586995423021", agentKind: "assistant" });
  });
});

describe("parseEvolutionAiInbound", () => {
  it("extrai texto simples de messages.upsert", () => {
    const parsed = parseEvolutionAiInbound({
      event: "messages.upsert",
      instance: "arena-cripto",
      data: {
        key: { id: "msg-1", remoteJid: "5586995423021@s.whatsapp.net", fromMe: false },
        message: { conversation: "oi" },
        messageTimestamp: 1_700_000_000,
        pushName: "Luan",
      },
    });

    expect(parsed).toMatchObject({
      event: "messages.upsert",
      instanceName: "arena-cripto",
      messageId: "msg-1",
      remoteJid: "5586995423021@s.whatsapp.net",
      fromMe: false,
      isGroup: false,
      pushName: "Luan",
      text: "oi",
    });
  });

  it("extrai texto estendido e caption de imagem", () => {
    expect(parseEvolutionAiInbound({
      event: "MESSAGES_UPSERT",
      data: {
        instance: "arena-cripto",
        key: { id: "msg-2", remoteJid: "5586995423021@s.whatsapp.net" },
        message: { extendedTextMessage: { text: "texto estendido" } },
      },
    })?.text).toBe("texto estendido");

    const parsedImage = parseEvolutionAiInbound({
      event: "messages.upsert",
      data: {
        instance: "arena-cripto",
        key: { id: "msg-3", remoteJid: "5586995423021@s.whatsapp.net" },
        message: { imageMessage: { caption: "legenda", url: "https://cdn.exemplo.com/foto.jpg", mimetype: "image/jpeg", fileLength: "123" } },
      },
    });

    expect(parsedImage?.text).toBe("legenda");
    expect(parsedImage?.attachments).toEqual([{ kind: "image", url: "https://cdn.exemplo.com/foto.jpg", mimeType: "image/jpeg", caption: "legenda", fileLength: 123 }]);
  });

  it("aceita imagem sem legenda como conteúdo inbound", () => {
    const parsed = parseEvolutionAiInbound({
      event: "messages.upsert",
      data: {
        instance: "arena-cripto",
        key: { id: "msg-img", remoteJid: "5586995423021@s.whatsapp.net" },
        message: { imageMessage: { url: "https://cdn.exemplo.com/foto.png", mimetype: "image/png" } },
      },
    });

    expect(parsed?.text).toBe("");
    expect(parsed?.attachments).toHaveLength(1);
  });

  it("retorna null para evento sem id ou evento não inbound", () => {
    expect(parseEvolutionAiInbound({ event: "messages.update" })).toBeNull();
    expect(parseEvolutionAiInbound({ event: "messages.upsert", data: { key: { remoteJid: "x" } } })).toBeNull();
  });
});
