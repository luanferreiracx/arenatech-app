import { describe, it, expect } from "vitest";
import {
  paymentDetailSchema,
  addSaleItemSchema,
  updateSaleItemSchema,
  applyDiscountSchema,
  finalizeSaleSchema,
  cancelSaleSchema,
  refundSaleSchema,
  listSalesSchema,
  searchProductsSchema,
  saleStatusEnum,
  SALE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/validators/sale";

// ── Payment Detail ──

describe("paymentDetailSchema", () => {
  it("aceita pagamento valido", () => {
    const result = paymentDetailSchema.safeParse({
      method: "pix",
      amount: 5000,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita amount zero", () => {
    const result = paymentDetailSchema.safeParse({
      method: "pix",
      amount: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita method vazio", () => {
    const result = paymentDetailSchema.safeParse({
      method: "",
      amount: 1000,
    });
    expect(result.success).toBe(false);
  });

  it("aceita com parcelas", () => {
    const result = paymentDetailSchema.safeParse({
      method: "cartao_credito",
      amount: 10000,
      installments: 3,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita parcelas acima de 36", () => {
    const result = paymentDetailSchema.safeParse({
      method: "cartao_credito",
      amount: 10000,
      installments: 37,
    });
    expect(result.success).toBe(false);
  });
});

// ── Add Sale Item ──

describe("addSaleItemSchema", () => {
  const validItem = {
    saleId: "550e8400-e29b-41d4-a716-446655440000",
    productId: "550e8400-e29b-41d4-a716-446655440001",
    quantity: 1,
    unitPrice: 5000,
  };

  it("aceita item valido", () => {
    const result = addSaleItemSchema.safeParse(validItem);
    expect(result.success).toBe(true);
  });

  it("rejeita quantidade zero", () => {
    const result = addSaleItemSchema.safeParse({ ...validItem, quantity: 0 });
    expect(result.success).toBe(false);
  });

  it("rejeita preco negativo", () => {
    const result = addSaleItemSchema.safeParse({ ...validItem, unitPrice: -100 });
    expect(result.success).toBe(false);
  });

  it("rejeita UUID invalido", () => {
    const result = addSaleItemSchema.safeParse({ ...validItem, saleId: "not-uuid" });
    expect(result.success).toBe(false);
  });
});

// ── Update Sale Item ──

describe("updateSaleItemSchema", () => {
  it("aceita update valido", () => {
    const result = updateSaleItemSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      itemId: "550e8400-e29b-41d4-a716-446655440001",
      quantity: 3,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita quantidade zero", () => {
    const result = updateSaleItemSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      itemId: "550e8400-e29b-41d4-a716-446655440001",
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });
});

// ── Apply Discount ──

describe("applyDiscountSchema", () => {
  const validDiscount = {
    saleId: "550e8400-e29b-41d4-a716-446655440000",
    discountType: "fixed" as const,
    discountValue: 1000,
  };

  it("aceita desconto fixo valido", () => {
    const result = applyDiscountSchema.safeParse(validDiscount);
    expect(result.success).toBe(true);
  });

  it("aceita desconto percentual", () => {
    const result = applyDiscountSchema.safeParse({
      ...validDiscount,
      discountType: "percentage",
      discountValue: 10,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita valor negativo", () => {
    const result = applyDiscountSchema.safeParse({
      ...validDiscount,
      discountValue: -5,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita tipo invalido", () => {
    const result = applyDiscountSchema.safeParse({
      ...validDiscount,
      discountType: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("aceita motivo opcional", () => {
    const result = applyDiscountSchema.safeParse({
      ...validDiscount,
      discountReason: "Cliente fidelidade",
    });
    expect(result.success).toBe(true);
  });
});

// ── Finalize Sale ──

describe("finalizeSaleSchema", () => {
  const validFinalize = {
    saleId: "550e8400-e29b-41d4-a716-446655440000",
    payments: [{ method: "dinheiro", amount: 5000 }],
  };

  it("aceita finalizacao valida", () => {
    const result = finalizeSaleSchema.safeParse(validFinalize);
    expect(result.success).toBe(true);
  });

  it("rejeita sem pagamentos", () => {
    const result = finalizeSaleSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      payments: [],
    });
    expect(result.success).toBe(false);
  });

  it("aceita com cliente", () => {
    const result = finalizeSaleSchema.safeParse({
      ...validFinalize,
      customerId: "550e8400-e29b-41d4-a716-446655440002",
    });
    expect(result.success).toBe(true);
  });

  it("aceita split payment", () => {
    const result = finalizeSaleSchema.safeParse({
      ...validFinalize,
      payments: [
        { method: "dinheiro", amount: 2000 },
        { method: "pix", amount: 3000 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("aceita com parcelas", () => {
    const result = finalizeSaleSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      payments: [{ method: "cartao_credito", amount: 5000, installments: 3 }],
    });
    expect(result.success).toBe(true);
  });

  it("aceita observacoes", () => {
    const result = finalizeSaleSchema.safeParse({
      ...validFinalize,
      observations: "Venda especial",
    });
    expect(result.success).toBe(true);
  });
});

// ── Cancel Sale ──

describe("cancelSaleSchema", () => {
  it("aceita cancelamento valido", () => {
    const result = cancelSaleSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      reason: "Cliente desistiu",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita motivo vazio", () => {
    const result = cancelSaleSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      reason: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita motivo longo demais", () => {
    const result = cancelSaleSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      reason: "a".repeat(301),
    });
    expect(result.success).toBe(false);
  });
});

// ── Refund Sale ──

describe("refundSaleSchema", () => {
  it("aceita estorno valido", () => {
    const result = refundSaleSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      reason: "Produto com defeito",
    });
    expect(result.success).toBe(true);
  });

  it("aceita com returnStock false", () => {
    const result = refundSaleSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      reason: "Produto com defeito",
      returnStock: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.returnStock).toBe(false);
    }
  });
});

// ── List Sales ──

describe("listSalesSchema", () => {
  it("aceita sem filtros", () => {
    const result = listSalesSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("aceita com todos os filtros", () => {
    const result = listSalesSchema.safeParse({
      search: "VND2026",
      status: "COMPLETED",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      page: 0,
      pageSize: 20,
      sortBy: "saleDate",
      sortOrder: "desc",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita status invalido", () => {
    const result = listSalesSchema.safeParse({
      status: "INVALID",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita pageSize acima de 100", () => {
    const result = listSalesSchema.safeParse({
      pageSize: 101,
    });
    expect(result.success).toBe(false);
  });
});

// ── Search Products ──

describe("searchProductsSchema", () => {
  it("aceita busca valida", () => {
    const result = searchProductsSchema.safeParse({ query: "iPhone" });
    expect(result.success).toBe(true);
  });

  it("rejeita busca vazia", () => {
    const result = searchProductsSchema.safeParse({ query: "" });
    expect(result.success).toBe(false);
  });

  it("aceita com filtro de estoque", () => {
    const result = searchProductsSchema.safeParse({
      query: "capa",
      withStock: true,
    });
    expect(result.success).toBe(true);
  });
});

// ── Enums e Labels ──

describe("saleStatusEnum", () => {
  it("aceita status validos", () => {
    const statuses = ["DRAFT", "COMPLETED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED"];
    for (const s of statuses) {
      expect(saleStatusEnum.safeParse(s).success).toBe(true);
    }
  });

  it("rejeita status invalido", () => {
    expect(saleStatusEnum.safeParse("INVALID").success).toBe(false);
  });
});

describe("labels", () => {
  it("todos os status tem label", () => {
    const statuses = ["DRAFT", "COMPLETED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED"];
    for (const s of statuses) {
      expect(SALE_STATUS_LABELS[s]).toBeDefined();
    }
  });

  it("todas as formas de pagamento tem label", () => {
    const methods = ["dinheiro", "pix", "cartao_credito", "cartao_debito", "misto"];
    for (const m of methods) {
      expect(PAYMENT_METHOD_LABELS[m]).toBeDefined();
    }
  });
});
