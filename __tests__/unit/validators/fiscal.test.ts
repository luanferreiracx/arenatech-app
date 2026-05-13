import { describe, it, expect } from "vitest";
import {
  createInvoiceSchema,
  createFromSaleSchema,
  createFromServiceOrderSchema,
  authorizeInvoiceSchema,
  cancelInvoiceSchema,
  correctionLetterSchema,
  listInvoicesSchema,
  downloadInvoiceSchema,
  invoiceItemSchema,
  invoiceTypeEnum,
  invoiceStatusEnum,
  INVOICE_TYPE_LABELS,
  INVOICE_STATUS_LABELS,
} from "@/lib/validators/fiscal";

describe("invoiceTypeEnum", () => {
  it("aceita tipos validos", () => {
    expect(invoiceTypeEnum.safeParse("NFE").success).toBe(true);
    expect(invoiceTypeEnum.safeParse("NFCE").success).toBe(true);
    expect(invoiceTypeEnum.safeParse("NFSE").success).toBe(true);
  });
  it("rejeita tipo invalido", () => {
    expect(invoiceTypeEnum.safeParse("INVALID").success).toBe(false);
  });
});

describe("invoiceStatusEnum", () => {
  it("aceita status validos", () => {
    expect(invoiceStatusEnum.safeParse("DRAFT").success).toBe(true);
    expect(invoiceStatusEnum.safeParse("AUTHORIZED").success).toBe(true);
    expect(invoiceStatusEnum.safeParse("CANCELLED").success).toBe(true);
  });
});

describe("invoiceItemSchema", () => {
  it("aceita item valido", () => {
    expect(invoiceItemSchema.safeParse({ description: "Servico", quantity: 1, unitPrice: 5000 }).success).toBe(true);
  });
  it("rejeita item sem descricao", () => {
    expect(invoiceItemSchema.safeParse({ description: "", quantity: 1, unitPrice: 5000 }).success).toBe(false);
  });
  it("rejeita preco zero", () => {
    expect(invoiceItemSchema.safeParse({ description: "X", quantity: 1, unitPrice: 0 }).success).toBe(false);
  });
});

describe("createInvoiceSchema", () => {
  const valid = {
    type: "NFE" as const,
    recipientName: "Joao Silva",
    recipientCpfCnpj: "12345678901",
    items: [{ description: "Servico", quantity: 1, unitPrice: 5000 }],
  };

  it("aceita input valido", () => {
    expect(createInvoiceSchema.safeParse(valid).success).toBe(true);
  });
  it("rejeita sem items", () => {
    expect(createInvoiceSchema.safeParse({ ...valid, items: [] }).success).toBe(false);
  });
  it("rejeita sem destinatario", () => {
    expect(createInvoiceSchema.safeParse({ ...valid, recipientName: "" }).success).toBe(false);
  });
});

describe("createFromSaleSchema", () => {
  it("aceita input valido", () => {
    expect(createFromSaleSchema.safeParse({ saleId: "550e8400-e29b-41d4-a716-446655440000", type: "NFCE" }).success).toBe(true);
  });
  it("rejeita UUID invalido", () => {
    expect(createFromSaleSchema.safeParse({ saleId: "invalid", type: "NFE" }).success).toBe(false);
  });
});

describe("createFromServiceOrderSchema", () => {
  it("aceita input valido", () => {
    expect(createFromServiceOrderSchema.safeParse({ serviceOrderId: "550e8400-e29b-41d4-a716-446655440000", type: "NFE" }).success).toBe(true);
  });
});

describe("authorizeInvoiceSchema", () => {
  it("aceita UUID valido", () => {
    expect(authorizeInvoiceSchema.safeParse({ invoiceId: "550e8400-e29b-41d4-a716-446655440000" }).success).toBe(true);
  });
});

describe("cancelInvoiceSchema", () => {
  it("aceita justificativa longa", () => {
    expect(cancelInvoiceSchema.safeParse({ invoiceId: "550e8400-e29b-41d4-a716-446655440000", reason: "Cancelamento solicitado pelo cliente" }).success).toBe(true);
  });
  it("rejeita justificativa curta", () => {
    expect(cancelInvoiceSchema.safeParse({ invoiceId: "550e8400-e29b-41d4-a716-446655440000", reason: "curto" }).success).toBe(false);
  });
});

describe("correctionLetterSchema", () => {
  it("aceita correcao valida", () => {
    expect(correctionLetterSchema.safeParse({ invoiceId: "550e8400-e29b-41d4-a716-446655440000", reason: "Correcao do endereco do destinatario" }).success).toBe(true);
  });
});

describe("listInvoicesSchema", () => {
  it("aceita filtros vazios", () => {
    expect(listInvoicesSchema.safeParse({}).success).toBe(true);
  });
  it("aceita filtros completos", () => {
    expect(listInvoicesSchema.safeParse({ type: "NFE", status: "AUTHORIZED", search: "teste", page: 0, pageSize: 20 }).success).toBe(true);
  });
});

describe("downloadInvoiceSchema", () => {
  it("aceita pdf", () => {
    expect(downloadInvoiceSchema.safeParse({ invoiceId: "550e8400-e29b-41d4-a716-446655440000", format: "pdf" }).success).toBe(true);
  });
  it("aceita xml", () => {
    expect(downloadInvoiceSchema.safeParse({ invoiceId: "550e8400-e29b-41d4-a716-446655440000", format: "xml" }).success).toBe(true);
  });
});

describe("labels", () => {
  it("tem labels para todos os tipos", () => {
    expect(Object.keys(INVOICE_TYPE_LABELS)).toHaveLength(3);
  });
  it("tem labels para todos os status", () => {
    expect(Object.keys(INVOICE_STATUS_LABELS)).toHaveLength(6);
  });
});
