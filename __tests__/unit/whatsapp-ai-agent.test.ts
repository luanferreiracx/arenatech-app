import { describe, expect, it } from "vitest";
import { digitsOnly, isAllowedPhone, phoneFromJid, validateWhatsappAiInboundAccess } from "@/lib/whatsapp-ai-agent/access-control";
import { parseEvolutionAiInbound } from "@/lib/whatsapp-ai-agent/evolution-payload";

describe("whatsapp-ai-agent access control", () => {
  it("normaliza telefones e JIDs", () => {
    expect(digitsOnly("(86) 99542-3021")).toBe("86995423021");
    expect(phoneFromJid("5586995423021@s.whatsapp.net")).toBe("5586995423021");
  });

  it("permite apenas o telefone configurado por sufixo", () => {
    expect(isAllowedPhone("5586995423021@s.whatsapp.net", "86995423021")).toEqual({
      allowed: true,
      phone: "5586995423021",
    });
    expect(isAllowedPhone("5586999999999@s.whatsapp.net", "86995423021")).toEqual({
      allowed: false,
      reason: "unauthorized sender",
    });
  });

  it("bloqueia grupos, fromMe, instância inesperada e texto vazio", () => {
    const config = {
      enabled: true,
      webhookToken: "secret",
      instanceName: "arena-cripto",
      allowedPhone: "86995423021",
      tenantId: "tenant-1",
    };

    expect(validateWhatsappAiInboundAccess({ config, instanceName: "outra", remoteJid: "5586995423021@s.whatsapp.net", fromMe: false, isGroup: false, hasText: true })).toEqual({ allowed: false, reason: "unexpected instance" });
    expect(validateWhatsappAiInboundAccess({ config, instanceName: "arena-cripto", remoteJid: "5586995423021@s.whatsapp.net", fromMe: true, isGroup: false, hasText: true })).toEqual({ allowed: false, reason: "from me" });
    expect(validateWhatsappAiInboundAccess({ config, instanceName: "arena-cripto", remoteJid: "5586995423021@g.us", fromMe: false, isGroup: true, hasText: true })).toEqual({ allowed: false, reason: "group message" });
    expect(validateWhatsappAiInboundAccess({ config, instanceName: "arena-cripto", remoteJid: "5586995423021@s.whatsapp.net", fromMe: false, isGroup: false, hasText: false })).toEqual({ allowed: false, reason: "empty text" });
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

    expect(parseEvolutionAiInbound({
      event: "messages.upsert",
      data: {
        instance: "arena-cripto",
        key: { id: "msg-3", remoteJid: "5586995423021@s.whatsapp.net" },
        message: { imageMessage: { caption: "legenda" } },
      },
    })?.text).toBe("legenda");
  });

  it("retorna null para evento sem id ou evento não inbound", () => {
    expect(parseEvolutionAiInbound({ event: "messages.update" })).toBeNull();
    expect(parseEvolutionAiInbound({ event: "messages.upsert", data: { key: { remoteJid: "x" } } })).toBeNull();
  });
});
