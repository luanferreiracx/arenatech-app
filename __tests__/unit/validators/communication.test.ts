import { describe, it, expect } from "vitest";
import {
  sendMessageSchema,
  sendToCustomerSchema,
  notifyOsSchema,
  sendReceiptSchema,
  listMessagesSchema,
  createTemplateSchema,
  updateTemplateSchema,
  listTemplatesSchema,
} from "@/lib/validators/communication";

describe("communication validators", () => {
  // ── Send Message ──────────────────────────────────────────────────────

  describe("sendMessageSchema", () => {
    it("accepts valid WhatsApp message", () => {
      const result = sendMessageSchema.safeParse({
        channel: "WHATSAPP",
        recipientPhone: "86999999999",
        recipientName: "João",
        body: "Olá, tudo bem?",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid Email message", () => {
      const result = sendMessageSchema.safeParse({
        channel: "EMAIL",
        recipientEmail: "test@example.com",
        subject: "Teste",
        body: "Corpo do email",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty body", () => {
      const result = sendMessageSchema.safeParse({
        channel: "WHATSAPP",
        recipientPhone: "86999999999",
        body: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid channel", () => {
      const result = sendMessageSchema.safeParse({
        channel: "TELEGRAM",
        body: "Mensagem",
      });
      expect(result.success).toBe(false);
    });

    it("accepts templateParams", () => {
      const result = sendMessageSchema.safeParse({
        channel: "WHATSAPP",
        recipientPhone: "86999999999",
        body: "Olá {{nome}}",
        templateName: "os_concluida",
        templateParams: { nome: "João", numero_os: "OS2026001" },
      });
      expect(result.success).toBe(true);
    });
  });

  // ── Send to Customer ──────────────────────────────────────────────────

  describe("sendToCustomerSchema", () => {
    it("accepts valid send to customer", () => {
      const result = sendToCustomerSchema.safeParse({
        customerId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        channel: "WHATSAPP",
        body: "Olá, sua OS está pronta!",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid customer UUID", () => {
      const result = sendToCustomerSchema.safeParse({
        customerId: "invalid",
        channel: "WHATSAPP",
        body: "Mensagem",
      });
      expect(result.success).toBe(false);
    });
  });

  // ── Notify OS ─────────────────────────────────────────────────────────

  describe("notifyOsSchema", () => {
    it("accepts valid service order UUID", () => {
      const result = notifyOsSchema.safeParse({
        serviceOrderId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      });
      expect(result.success).toBe(true);
    });
  });

  // ── Send Receipt ──────────────────────────────────────────────────────

  describe("sendReceiptSchema", () => {
    it("accepts service_order reference", () => {
      const result = sendReceiptSchema.safeParse({
        referenceId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        referenceType: "service_order",
      });
      expect(result.success).toBe(true);
    });

    it("accepts sale reference", () => {
      const result = sendReceiptSchema.safeParse({
        referenceId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        referenceType: "sale",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid reference type", () => {
      const result = sendReceiptSchema.safeParse({
        referenceId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        referenceType: "other",
      });
      expect(result.success).toBe(false);
    });
  });

  // ── List Messages ─────────────────────────────────────────────────────

  describe("listMessagesSchema", () => {
    it("accepts minimal params", () => {
      const result = listMessagesSchema.safeParse({
        page: 0,
        pageSize: 20,
      });
      expect(result.success).toBe(true);
    });

    it("accepts all filters", () => {
      const result = listMessagesSchema.safeParse({
        channel: "WHATSAPP",
        status: "SENT",
        search: "João",
        dateFrom: "2026-01-01",
        dateTo: "2026-12-31",
        page: 0,
        pageSize: 50,
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid status", () => {
      const result = listMessagesSchema.safeParse({
        status: "INVALID",
        page: 0,
        pageSize: 20,
      });
      expect(result.success).toBe(false);
    });
  });

  // ── Templates ─────────────────────────────────────────────────────────

  describe("createTemplateSchema", () => {
    it("accepts valid template", () => {
      const result = createTemplateSchema.safeParse({
        channel: "WHATSAPP",
        name: "OS Concluída",
        slug: "os_concluida",
        body: "Olá {{nome}}, sua OS {{numero_os}} foi concluída.",
        active: true,
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty name", () => {
      const result = createTemplateSchema.safeParse({
        channel: "WHATSAPP",
        name: "",
        slug: "test",
        body: "Corpo",
        active: true,
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid slug (uppercase)", () => {
      const result = createTemplateSchema.safeParse({
        channel: "WHATSAPP",
        name: "Test",
        slug: "OS_Concluida",
        body: "Corpo",
        active: true,
      });
      expect(result.success).toBe(false);
    });

    it("rejects slug with spaces", () => {
      const result = createTemplateSchema.safeParse({
        channel: "WHATSAPP",
        name: "Test",
        slug: "os concluida",
        body: "Corpo",
        active: true,
      });
      expect(result.success).toBe(false);
    });

    it("accepts slug with underscores and numbers", () => {
      const result = createTemplateSchema.safeParse({
        channel: "EMAIL",
        name: "Venda Recibo v2",
        slug: "venda_recibo_v2",
        body: "Seu recibo #{{numero}}",
        active: false,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("updateTemplateSchema", () => {
    it("accepts partial update", () => {
      const result = updateTemplateSchema.safeParse({
        id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        name: "Novo nome",
      });
      expect(result.success).toBe(true);
    });

    it("accepts active-only update", () => {
      const result = updateTemplateSchema.safeParse({
        id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        active: false,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("listTemplatesSchema", () => {
    it("accepts minimal params", () => {
      const result = listTemplatesSchema.safeParse({
        page: 0,
        pageSize: 20,
      });
      expect(result.success).toBe(true);
    });

    it("accepts channel filter", () => {
      const result = listTemplatesSchema.safeParse({
        channel: "WHATSAPP",
        active: true,
        page: 0,
        pageSize: 10,
      });
      expect(result.success).toBe(true);
    });
  });
});
