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
} from "@/lib/validators/sale";

describe("paymentDetailSchema", () => {
  it("accepts valid payment detail", () => {
    const result = paymentDetailSchema.safeParse({
      method: "CASH",
      amount: 5000,
    });
    expect(result.success).toBe(true);
  });

  it("requires method to be non-empty", () => {
    const result = paymentDetailSchema.safeParse({
      method: "",
      amount: 5000,
    });
    expect(result.success).toBe(false);
  });

  it("requires amount to be positive", () => {
    const result = paymentDetailSchema.safeParse({
      method: "PIX",
      amount: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative amount", () => {
    const result = paymentDetailSchema.safeParse({
      method: "PIX",
      amount: -100,
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional installments", () => {
    const result = paymentDetailSchema.safeParse({
      method: "CREDIT_CARD",
      amount: 10000,
      installments: 3,
    });
    expect(result.success).toBe(true);
  });

  it("rejects installments less than 1", () => {
    const result = paymentDetailSchema.safeParse({
      method: "CREDIT_CARD",
      amount: 10000,
      installments: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("addSaleItemSchema", () => {
  it("accepts valid item", () => {
    const result = addSaleItemSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      productId: "550e8400-e29b-41d4-a716-446655440001",
      quantity: 2,
      unitPrice: 1500,
    });
    expect(result.success).toBe(true);
  });

  it("requires positive quantity", () => {
    const result = addSaleItemSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      productId: "550e8400-e29b-41d4-a716-446655440001",
      quantity: 0,
      unitPrice: 1500,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative quantity", () => {
    const result = addSaleItemSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      productId: "550e8400-e29b-41d4-a716-446655440001",
      quantity: -1,
      unitPrice: 1500,
    });
    expect(result.success).toBe(false);
  });

  it("accepts unitPrice of 0 (free item)", () => {
    const result = addSaleItemSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      productId: "550e8400-e29b-41d4-a716-446655440001",
      quantity: 1,
      unitPrice: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative unitPrice", () => {
    const result = addSaleItemSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      productId: "550e8400-e29b-41d4-a716-446655440001",
      quantity: 1,
      unitPrice: -10,
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional discount", () => {
    const result = addSaleItemSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      productId: "550e8400-e29b-41d4-a716-446655440001",
      quantity: 1,
      unitPrice: 1000,
      discount: 100,
    });
    expect(result.success).toBe(true);
  });
});

describe("updateSaleItemSchema", () => {
  it("accepts valid update", () => {
    const result = updateSaleItemSchema.safeParse({
      itemId: "550e8400-e29b-41d4-a716-446655440000",
      quantity: 5,
    });
    expect(result.success).toBe(true);
  });

  it("requires positive quantity", () => {
    const result = updateSaleItemSchema.safeParse({
      itemId: "550e8400-e29b-41d4-a716-446655440000",
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("applyDiscountSchema", () => {
  it("accepts fixed discount", () => {
    const result = applyDiscountSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      discountType: "fixed",
      discountValue: 500,
    });
    expect(result.success).toBe(true);
  });

  it("accepts percent discount", () => {
    const result = applyDiscountSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      discountType: "percent",
      discountValue: 10,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative discount", () => {
    const result = applyDiscountSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      discountType: "fixed",
      discountValue: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid discount type", () => {
    const result = applyDiscountSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      discountType: "invalid",
      discountValue: 10,
    });
    expect(result.success).toBe(false);
  });
});

describe("finalizeSaleSchema", () => {
  it("accepts valid finalize with single payment", () => {
    const result = finalizeSaleSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      payments: [{ method: "CASH", amount: 5000 }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts split payment (multiple forms)", () => {
    const result = finalizeSaleSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      payments: [
        { method: "CASH", amount: 2000 },
        { method: "PIX", amount: 3000 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts with optional customer", () => {
    const result = finalizeSaleSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      customerId: "550e8400-e29b-41d4-a716-446655440001",
      payments: [{ method: "CASH", amount: 5000 }],
    });
    expect(result.success).toBe(true);
  });

  it("requires at least one payment", () => {
    const result = finalizeSaleSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      payments: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts with discount", () => {
    const result = finalizeSaleSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      payments: [{ method: "CASH", amount: 4000 }],
      discountType: "fixed",
      discountValue: 1000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts installment payment", () => {
    const result = finalizeSaleSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      payments: [{ method: "CREDIT_CARD", amount: 6000, installments: 3 }],
    });
    expect(result.success).toBe(true);
  });
});

describe("cancelSaleSchema", () => {
  it("accepts cancel with reason", () => {
    const result = cancelSaleSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      reason: "Cliente desistiu",
    });
    expect(result.success).toBe(true);
  });

  it("accepts cancel without reason", () => {
    const result = cancelSaleSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });
});

describe("refundSaleSchema", () => {
  it("accepts refund with reason", () => {
    const result = refundSaleSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      reason: "Produto com defeito",
    });
    expect(result.success).toBe(true);
  });

  it("requires non-empty reason", () => {
    const result = refundSaleSchema.safeParse({
      saleId: "550e8400-e29b-41d4-a716-446655440000",
      reason: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("listSalesSchema", () => {
  it("accepts minimal list params", () => {
    const result = listSalesSchema.safeParse({
      page: 0,
      pageSize: 20,
    });
    expect(result.success).toBe(true);
  });

  it("accepts all filters", () => {
    const result = listSalesSchema.safeParse({
      page: 0,
      pageSize: 20,
      search: "VND",
      status: "COMPLETED",
      sellerId: "550e8400-e29b-41d4-a716-446655440000",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = listSalesSchema.safeParse({
      page: 0,
      pageSize: 20,
      status: "INVALID",
    });
    expect(result.success).toBe(false);
  });

  it("rejects pageSize over 100", () => {
    const result = listSalesSchema.safeParse({
      page: 0,
      pageSize: 101,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative page", () => {
    const result = listSalesSchema.safeParse({
      page: -1,
      pageSize: 20,
    });
    expect(result.success).toBe(false);
  });
});
