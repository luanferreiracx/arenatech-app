import { describe, it, expect } from "vitest";
import {
  createProductSchema,
  updateProductSchema,
  adjustStockSchema,
  listProductsSchema,
  createDevicePurchaseSchema,
} from "@/lib/validators/stock";
import {
  openCashRegisterSchema,
  closeCashRegisterSchema,
  addCashMovementSchema,
} from "@/lib/validators/cashier";
import {
  createTransactionSchema,
  payInstallmentSchema,
  listTransactionsSchema,
} from "@/lib/validators/financial";

// ────────────────────────────────────────────────────────────────────────────
// Product validators
// ────────────────────────────────────────────────────────────────────────────

describe("createProductSchema", () => {
  it("accepts valid product", () => {
    const result = createProductSchema.safeParse({
      name: "Película de Vidro",
      costPrice: 5.0,
      salePrice: 15.0,
      currentStock: 100,
      minStock: 10,
      unit: "un",
      active: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createProductSchema.safeParse({
      name: "",
      costPrice: 5.0,
      salePrice: 15.0,
      currentStock: 0,
      minStock: 0,
      unit: "un",
      active: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative cost price", () => {
    const result = createProductSchema.safeParse({
      name: "Teste",
      costPrice: -10,
      salePrice: 15.0,
      currentStock: 0,
      minStock: 0,
      unit: "un",
      active: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative sale price", () => {
    const result = createProductSchema.safeParse({
      name: "Teste",
      costPrice: 5.0,
      salePrice: -1,
      currentStock: 0,
      minStock: 0,
      unit: "un",
      active: true,
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional sku and barcode", () => {
    const result = createProductSchema.safeParse({
      name: "Teste",
      sku: "SKU-001",
      barcode: "7891234567890",
      costPrice: 0,
      salePrice: 0,
      currentStock: 0,
      minStock: 0,
      unit: "un",
      active: true,
    });
    expect(result.success).toBe(true);
  });
});

describe("updateProductSchema", () => {
  it("accepts partial update", () => {
    const result = updateProductSchema.safeParse({ name: "Novo Nome" });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = updateProductSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("adjustStockSchema", () => {
  it("accepts valid adjustment", () => {
    const result = adjustStockSchema.safeParse({
      productId: "550e8400-e29b-41d4-a716-446655440000",
      type: "ENTRY",
      quantity: 10,
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero quantity", () => {
    const result = adjustStockSchema.safeParse({
      productId: "550e8400-e29b-41d4-a716-446655440000",
      type: "EXIT",
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid type", () => {
    const result = adjustStockSchema.safeParse({
      productId: "550e8400-e29b-41d4-a716-446655440000",
      type: "INVALID",
      quantity: 1,
    });
    expect(result.success).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Cash register validators
// ────────────────────────────────────────────────────────────────────────────

describe("openCashRegisterSchema", () => {
  it("accepts valid opening balance", () => {
    const result = openCashRegisterSchema.safeParse({ openingBalance: 100.0 });
    expect(result.success).toBe(true);
  });

  it("accepts zero balance", () => {
    const result = openCashRegisterSchema.safeParse({ openingBalance: 0 });
    expect(result.success).toBe(true);
  });

  it("rejects negative balance", () => {
    const result = openCashRegisterSchema.safeParse({ openingBalance: -50 });
    expect(result.success).toBe(false);
  });
});

describe("closeCashRegisterSchema", () => {
  it("accepts valid closing", () => {
    const result = closeCashRegisterSchema.safeParse({ closingBalance: 250.5 });
    expect(result.success).toBe(true);
  });
});

describe("addCashMovementSchema", () => {
  it("accepts valid withdrawal", () => {
    const result = addCashMovementSchema.safeParse({
      type: "WITHDRAWAL",
      amount: 50.0,
      description: "Sangria para cofre",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty description", () => {
    const result = addCashMovementSchema.safeParse({
      type: "DEPOSIT",
      amount: 50.0,
      description: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero amount", () => {
    const result = addCashMovementSchema.safeParse({
      type: "WITHDRAWAL",
      amount: 0,
      description: "Teste",
    });
    expect(result.success).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Financial transaction validators
// ────────────────────────────────────────────────────────────────────────────

describe("createTransactionSchema", () => {
  it("accepts valid transaction", () => {
    const result = createTransactionSchema.safeParse({
      type: "PAYABLE",
      description: "Aluguel",
      totalAmount: 1500.0,
      dueDate: new Date("2026-06-01"),
      installments: 1,
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero amount", () => {
    const result = createTransactionSchema.safeParse({
      type: "RECEIVABLE",
      description: "Teste",
      totalAmount: 0,
      dueDate: new Date(),
      installments: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty description", () => {
    const result = createTransactionSchema.safeParse({
      type: "PAYABLE",
      description: "",
      totalAmount: 100,
      dueDate: new Date(),
      installments: 1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing dueDate", () => {
    const result = createTransactionSchema.safeParse({
      type: "PAYABLE",
      description: "Teste",
      totalAmount: 100,
      installments: 1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts up to 36 installments", () => {
    const result = createTransactionSchema.safeParse({
      type: "RECEIVABLE",
      description: "Parcelado",
      totalAmount: 3600,
      dueDate: new Date(),
      installments: 36,
    });
    expect(result.success).toBe(true);
  });

  it("rejects more than 36 installments", () => {
    const result = createTransactionSchema.safeParse({
      type: "RECEIVABLE",
      description: "Parcelado demais",
      totalAmount: 3700,
      dueDate: new Date(),
      installments: 37,
    });
    expect(result.success).toBe(false);
  });
});

describe("payInstallmentSchema", () => {
  it("accepts valid payment", () => {
    const result = payInstallmentSchema.safeParse({
      installmentId: "550e8400-e29b-41d4-a716-446655440000",
      paidAmount: 100.0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero payment", () => {
    const result = payInstallmentSchema.safeParse({
      installmentId: "550e8400-e29b-41d4-a716-446655440000",
      paidAmount: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("listTransactionsSchema", () => {
  it("accepts valid filters", () => {
    const result = listTransactionsSchema.safeParse({
      type: "PAYABLE",
      status: "PENDING",
      page: 0,
      pageSize: 20,
    });
    expect(result.success).toBe(true);
  });

  it("accepts minimal filters", () => {
    const result = listTransactionsSchema.safeParse({
      page: 0,
      pageSize: 10,
    });
    expect(result.success).toBe(true);
  });
});

describe("createDevicePurchaseSchema", () => {
  it("accepts valid purchase", () => {
    const result = createDevicePurchaseSchema.safeParse({
      condition: "USED",
      purchasePrice: 500,
      brand: "Samsung",
      model: "Galaxy S24",
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative price", () => {
    const result = createDevicePurchaseSchema.safeParse({
      condition: "USED",
      purchasePrice: -100,
    });
    expect(result.success).toBe(false);
  });
});

describe("listProductsSchema", () => {
  it("accepts valid input", () => {
    const result = listProductsSchema.safeParse({
      page: 0,
      pageSize: 20,
    });
    expect(result.success).toBe(true);
  });

  it("accepts search and active filter", () => {
    const result = listProductsSchema.safeParse({
      search: "película",
      active: true,
      page: 0,
      pageSize: 20,
    });
    expect(result.success).toBe(true);
  });
});
