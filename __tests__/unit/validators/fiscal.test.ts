import { describe, it, expect } from "vitest";
import {
  createInvoiceSchema,
  createFromSaleSchema,
  createFromServiceOrderSchema,
  authorizeInvoiceSchema,
  cancelInvoiceSchema,
  correctionLetterSchema,
  listInvoicesSchema,
  invoiceStatsSchema,
  invoiceItemSchema,
} from "@/lib/validators/fiscal";

describe("fiscal validators", () => {
  // ── Invoice Item ──────────────────────────────────────────────────────

  describe("invoiceItemSchema", () => {
    it("accepts valid item", () => {
      const result = invoiceItemSchema.safeParse({
        description: "Serviço de reparo",
        quantity: 1,
        unitPrice: 100,
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty description", () => {
      const result = invoiceItemSchema.safeParse({
        description: "",
        quantity: 1,
        unitPrice: 100,
      });
      expect(result.success).toBe(false);
    });

    it("rejects zero quantity", () => {
      const result = invoiceItemSchema.safeParse({
        description: "Item",
        quantity: 0,
        unitPrice: 100,
      });
      expect(result.success).toBe(false);
    });

    it("accepts optional NCM and CFOP", () => {
      const result = invoiceItemSchema.safeParse({
        description: "Produto",
        quantity: 2,
        unitPrice: 50,
        ncm: "85171200",
        cfop: "5102",
      });
      expect(result.success).toBe(true);
    });
  });

  // ── Create Invoice ────────────────────────────────────────────────────

  describe("createInvoiceSchema", () => {
    it("accepts valid NFE invoice", () => {
      const result = createInvoiceSchema.safeParse({
        type: "NFE",
        recipientName: "João da Silva",
        recipientCpfCnpj: "12345678901",
        items: [{ description: "Peça", quantity: 1, unitPrice: 200 }],
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid NFCE invoice", () => {
      const result = createInvoiceSchema.safeParse({
        type: "NFCE",
        items: [{ description: "Produto", quantity: 3, unitPrice: 10 }],
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid NFSE invoice", () => {
      const result = createInvoiceSchema.safeParse({
        type: "NFSE",
        items: [{ description: "Serviço", quantity: 1, unitPrice: 300 }],
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty items", () => {
      const result = createInvoiceSchema.safeParse({
        type: "NFE",
        items: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid type", () => {
      const result = createInvoiceSchema.safeParse({
        type: "INVALID",
        items: [{ description: "X", quantity: 1, unitPrice: 1 }],
      });
      expect(result.success).toBe(false);
    });
  });

  // ── Create from Sale ──────────────────────────────────────────────────

  describe("createFromSaleSchema", () => {
    it("accepts valid sale reference", () => {
      const result = createFromSaleSchema.safeParse({
        saleId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        type: "NFE",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid UUID", () => {
      const result = createFromSaleSchema.safeParse({
        saleId: "not-a-uuid",
        type: "NFE",
      });
      expect(result.success).toBe(false);
    });

    it("rejects NFSE type for sale", () => {
      const result = createFromSaleSchema.safeParse({
        saleId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        type: "NFSE",
      });
      expect(result.success).toBe(false);
    });
  });

  // ── Create from Service Order ─────────────────────────────────────────

  describe("createFromServiceOrderSchema", () => {
    it("accepts valid service order reference", () => {
      const result = createFromServiceOrderSchema.safeParse({
        serviceOrderId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid UUID", () => {
      const result = createFromServiceOrderSchema.safeParse({
        serviceOrderId: "invalid",
      });
      expect(result.success).toBe(false);
    });
  });

  // ── Authorize ─────────────────────────────────────────────────────────

  describe("authorizeInvoiceSchema", () => {
    it("accepts valid UUID", () => {
      const result = authorizeInvoiceSchema.safeParse({
        id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      });
      expect(result.success).toBe(true);
    });
  });

  // ── Cancel ────────────────────────────────────────────────────────────

  describe("cancelInvoiceSchema", () => {
    it("accepts valid cancel with reason >= 15 chars", () => {
      const result = cancelInvoiceSchema.safeParse({
        id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        reason: "Cancelamento solicitado pelo operador",
      });
      expect(result.success).toBe(true);
    });

    it("rejects reason shorter than 15 chars", () => {
      const result = cancelInvoiceSchema.safeParse({
        id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        reason: "Curto",
      });
      expect(result.success).toBe(false);
    });
  });

  // ── Correction Letter ─────────────────────────────────────────────────

  describe("correctionLetterSchema", () => {
    it("accepts valid correction with reason >= 15 chars", () => {
      const result = correctionLetterSchema.safeParse({
        id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        reason: "Correção do endereço do destinatário",
      });
      expect(result.success).toBe(true);
    });

    it("rejects reason shorter than 15 chars", () => {
      const result = correctionLetterSchema.safeParse({
        id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        reason: "Curto",
      });
      expect(result.success).toBe(false);
    });
  });

  // ── List ──────────────────────────────────────────────────────────────

  describe("listInvoicesSchema", () => {
    it("accepts minimal list params", () => {
      const result = listInvoicesSchema.safeParse({
        page: 0,
        pageSize: 20,
      });
      expect(result.success).toBe(true);
    });

    it("accepts all filters", () => {
      const result = listInvoicesSchema.safeParse({
        type: "NFE",
        status: "AUTHORIZED",
        search: "João",
        dateFrom: "2026-01-01",
        dateTo: "2026-12-31",
        page: 0,
        pageSize: 50,
      });
      expect(result.success).toBe(true);
    });

    it("rejects negative page", () => {
      const result = listInvoicesSchema.safeParse({
        page: -1,
        pageSize: 20,
      });
      expect(result.success).toBe(false);
    });

    it("rejects pageSize over 100", () => {
      const result = listInvoicesSchema.safeParse({
        page: 0,
        pageSize: 200,
      });
      expect(result.success).toBe(false);
    });
  });

  // ── Stats ─────────────────────────────────────────────────────────────

  describe("invoiceStatsSchema", () => {
    it("accepts empty params", () => {
      const result = invoiceStatsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts date range", () => {
      const result = invoiceStatsSchema.safeParse({
        dateFrom: "2026-01-01",
        dateTo: "2026-12-31",
      });
      expect(result.success).toBe(true);
    });
  });
});
