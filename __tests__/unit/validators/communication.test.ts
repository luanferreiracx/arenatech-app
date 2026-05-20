import { describe, it, expect } from "vitest";
import {
  sendMessageSchema,
  sendToCustomerSchema,
  listMessagesSchema,
  createTemplateSchema,
  updateTemplateSchema,
  messageChannelEnum,
  messageStatusEnum,
  messageDirectionEnum,
  MESSAGE_CHANNEL_LABELS,
  MESSAGE_STATUS_LABELS,
} from "@/lib/validators/communication";

const UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("messageChannelEnum", () => {
  it("aceita canais validos", () => {
    expect(messageChannelEnum.safeParse("WHATSAPP").success).toBe(true);
    expect(messageChannelEnum.safeParse("EMAIL").success).toBe(true);
  });
  it("rejeita canal removido SMS", () => {
    expect(messageChannelEnum.safeParse("SMS").success).toBe(false);
  });
  it("rejeita canal invalido", () => {
    expect(messageChannelEnum.safeParse("TELEGRAM").success).toBe(false);
  });
});

describe("sendMessageSchema", () => {
  it("aceita mensagem WhatsApp valida", () => {
    expect(sendMessageSchema.safeParse({
      channel: "WHATSAPP",
      recipientPhone: "86999999999",
      body: "Ola!",
    }).success).toBe(true);
  });
  it("aceita mensagem Email valida", () => {
    expect(sendMessageSchema.safeParse({
      channel: "EMAIL",
      recipientEmail: "test@test.com",
      body: "Ola!",
      subject: "Teste",
    }).success).toBe(true);
  });
  it("rejeita body vazio", () => {
    expect(sendMessageSchema.safeParse({
      channel: "WHATSAPP",
      body: "",
    }).success).toBe(false);
  });
  it("rejeita email invalido", () => {
    expect(sendMessageSchema.safeParse({
      channel: "EMAIL",
      recipientEmail: "invalid",
      body: "test",
    }).success).toBe(false);
  });
});

describe("sendToCustomerSchema", () => {
  it("aceita input valido", () => {
    expect(sendToCustomerSchema.safeParse({
      customerId: UUID,
      channel: "WHATSAPP",
      body: "Mensagem para cliente",
    }).success).toBe(true);
  });
  it("rejeita sem customerId", () => {
    expect(sendToCustomerSchema.safeParse({
      channel: "WHATSAPP",
      body: "teste",
    }).success).toBe(false);
  });
});

describe("listMessagesSchema", () => {
  it("aceita filtros vazios", () => {
    expect(listMessagesSchema.safeParse({}).success).toBe(true);
  });
  it("aceita filtros completos", () => {
    expect(listMessagesSchema.safeParse({
      channel: "WHATSAPP",
      status: "SENT",
      direction: "OUTBOUND",
      search: "test",
      page: 0,
      pageSize: 20,
    }).success).toBe(true);
  });
});

describe("createTemplateSchema", () => {
  it("aceita template valido", () => {
    expect(createTemplateSchema.safeParse({
      channel: "WHATSAPP",
      name: "OS Concluida",
      slug: "os-completed",
      body: "Ola {{customer_name}}, sua OS {{os_number}} foi concluida!",
    }).success).toBe(true);
  });
  it("rejeita slug com espacos", () => {
    expect(createTemplateSchema.safeParse({
      channel: "WHATSAPP",
      name: "Test",
      slug: "slug com espacos",
      body: "test",
    }).success).toBe(false);
  });
  it("rejeita slug com maiusculas", () => {
    expect(createTemplateSchema.safeParse({
      channel: "WHATSAPP",
      name: "Test",
      slug: "SlugInvalido",
      body: "test",
    }).success).toBe(false);
  });
  it("aceita slug com hifen e underscore", () => {
    expect(createTemplateSchema.safeParse({
      channel: "WHATSAPP",
      name: "Test",
      slug: "meu-template_v2",
      body: "test",
    }).success).toBe(true);
  });
});

describe("updateTemplateSchema", () => {
  it("aceita update valido", () => {
    expect(updateTemplateSchema.safeParse({
      id: UUID,
      name: "Updated",
      body: "Novo corpo",
      active: false,
    }).success).toBe(true);
  });
});

describe("labels", () => {
  it("tem labels para canais (WHATSAPP + EMAIL)", () => {
    expect(Object.keys(MESSAGE_CHANNEL_LABELS)).toHaveLength(2);
  });
  it("tem labels para status", () => {
    expect(Object.keys(MESSAGE_STATUS_LABELS)).toHaveLength(5);
  });
});
