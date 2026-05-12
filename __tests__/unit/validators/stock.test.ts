import { describe, it, expect } from "vitest";
import {
  createProductSchema,
  updateProductSchema,
  adjustStockSchema,
  listProductsSchema,
  listMovementsSchema,
  createDevicePurchaseSchema,
  listDevicePurchasesSchema,
  stockMovementTypeLabels,
  deviceConditionLabels,
} from "@/lib/validators/stock";

// ── Product schemas ──

describe("createProductSchema", () => {
  it("rejeita nome curto", () => {
    const result = createProductSchema.safeParse({
      name: "A",
      costPrice: 0,
      salePrice: 1000,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita nome vazio", () => {
    const result = createProductSchema.safeParse({
      name: "",
      costPrice: 0,
      salePrice: 1000,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita preco de custo negativo", () => {
    const result = createProductSchema.safeParse({
      name: "iPhone 13",
      costPrice: -100,
      salePrice: 1000,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita preco de venda negativo", () => {
    const result = createProductSchema.safeParse({
      name: "iPhone 13",
      costPrice: 0,
      salePrice: -1000,
    });
    expect(result.success).toBe(false);
  });

  it("aceita produto valido minimo", () => {
    const result = createProductSchema.safeParse({
      name: "iPhone 13",
      costPrice: 0,
      salePrice: 0,
    });
    expect(result.success).toBe(true);
  });

  it("aceita produto valido completo", () => {
    const result = createProductSchema.safeParse({
      name: "iPhone 13 128GB",
      sku: "IPHONE13-128",
      barcode: "7891234567890",
      description: "iPhone 13 com 128GB de armazenamento",
      costPrice: 350000, // R$ 3500,00
      salePrice: 450000, // R$ 4500,00
      minStock: 5,
      unit: "un",
      active: true,
    });
    expect(result.success).toBe(true);
  });

  it("aceita sku e barcode nulos", () => {
    const result = createProductSchema.safeParse({
      name: "Pelicula Generica",
      costPrice: 200,
      salePrice: 1500,
      sku: null,
      barcode: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("updateProductSchema", () => {
  it("exige id UUID valido", () => {
    const result = updateProductSchema.safeParse({
      id: "not-a-uuid",
      name: "iPhone 13",
      costPrice: 0,
      salePrice: 1000,
    });
    expect(result.success).toBe(false);
  });

  it("aceita update valido", () => {
    const result = updateProductSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "iPhone 13 Pro",
      costPrice: 400000,
      salePrice: 500000,
    });
    expect(result.success).toBe(true);
  });
});

// ── Adjust Stock ──

describe("adjustStockSchema", () => {
  it("rejeita quantidade zero", () => {
    const result = adjustStockSchema.safeParse({
      productId: "550e8400-e29b-41d4-a716-446655440000",
      quantity: 0,
      reason: "Contagem",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita motivo vazio", () => {
    const result = adjustStockSchema.safeParse({
      productId: "550e8400-e29b-41d4-a716-446655440000",
      quantity: 5,
      reason: "",
    });
    expect(result.success).toBe(false);
  });

  it("aceita quantidade positiva (entrada)", () => {
    const result = adjustStockSchema.safeParse({
      productId: "550e8400-e29b-41d4-a716-446655440000",
      quantity: 10,
      reason: "Entrada de mercadoria",
    });
    expect(result.success).toBe(true);
  });

  it("aceita quantidade negativa (saida)", () => {
    const result = adjustStockSchema.safeParse({
      productId: "550e8400-e29b-41d4-a716-446655440000",
      quantity: -3,
      reason: "Perda por defeito",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita productId invalido", () => {
    const result = adjustStockSchema.safeParse({
      productId: "invalid",
      quantity: 5,
      reason: "Teste",
    });
    expect(result.success).toBe(false);
  });
});

// ── List schemas ──

describe("listProductsSchema", () => {
  it("aceita input vazio", () => {
    const result = listProductsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("aceita filtros completos", () => {
    const result = listProductsSchema.safeParse({
      search: "iphone",
      active: true,
      lowStock: true,
      page: 0,
      pageSize: 20,
      sortBy: "name",
      sortOrder: "asc",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita sortBy invalido", () => {
    const result = listProductsSchema.safeParse({
      sortBy: "invalid_column",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita pagina negativa", () => {
    const result = listProductsSchema.safeParse({ page: -1 });
    expect(result.success).toBe(false);
  });
});

describe("listMovementsSchema", () => {
  it("aceita input vazio", () => {
    const result = listMovementsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("aceita tipo valido", () => {
    const result = listMovementsSchema.safeParse({ type: "ENTRY" });
    expect(result.success).toBe(true);
  });

  it("rejeita tipo invalido", () => {
    const result = listMovementsSchema.safeParse({ type: "INVALID" });
    expect(result.success).toBe(false);
  });

  it("aceita datas", () => {
    const result = listMovementsSchema.safeParse({
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
    });
    expect(result.success).toBe(true);
  });
});

// ── Device Purchase ──

describe("createDevicePurchaseSchema", () => {
  it("aceita compra minima", () => {
    const result = createDevicePurchaseSchema.safeParse({
      condition: "USED",
      purchasePrice: 50000,
    });
    expect(result.success).toBe(true);
  });

  it("aceita compra completa", () => {
    const result = createDevicePurchaseSchema.safeParse({
      productId: "550e8400-e29b-41d4-a716-446655440000",
      customerId: "550e8400-e29b-41d4-a716-446655440001",
      imei: "353456789012345",
      serial: "C39XXXXXYZ",
      brand: "Apple",
      model: "iPhone 14 Pro",
      condition: "REFURBISHED",
      batteryHealth: 85,
      purchasePrice: 350000,
      salePrice: 450000,
      notes: "Aparelho em bom estado",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita preco de compra negativo", () => {
    const result = createDevicePurchaseSchema.safeParse({
      condition: "NEW",
      purchasePrice: -1000,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita condicao invalida", () => {
    const result = createDevicePurchaseSchema.safeParse({
      condition: "BROKEN",
      purchasePrice: 50000,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita bateria acima de 100", () => {
    const result = createDevicePurchaseSchema.safeParse({
      condition: "USED",
      purchasePrice: 50000,
      batteryHealth: 120,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita bateria negativa", () => {
    const result = createDevicePurchaseSchema.safeParse({
      condition: "USED",
      purchasePrice: 50000,
      batteryHealth: -5,
    });
    expect(result.success).toBe(false);
  });
});

describe("listDevicePurchasesSchema", () => {
  it("aceita input vazio", () => {
    const result = listDevicePurchasesSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("aceita filtro por condicao", () => {
    const result = listDevicePurchasesSchema.safeParse({
      condition: "USED",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita condicao invalida", () => {
    const result = listDevicePurchasesSchema.safeParse({
      condition: "BROKEN",
    });
    expect(result.success).toBe(false);
  });
});

// ── Labels ──

describe("labels", () => {
  it("stockMovementTypeLabels tem todas as chaves", () => {
    expect(stockMovementTypeLabels.ENTRY).toBe("Entrada");
    expect(stockMovementTypeLabels.EXIT).toBe("Saida");
    expect(stockMovementTypeLabels.ADJUSTMENT).toBe("Ajuste");
    expect(stockMovementTypeLabels.SALE).toBe("Venda");
    expect(stockMovementTypeLabels.RETURN).toBe("Devolucao");
    expect(stockMovementTypeLabels.TRANSFER).toBe("Transferencia");
  });

  it("deviceConditionLabels tem todas as chaves", () => {
    expect(deviceConditionLabels.NEW).toBe("Novo");
    expect(deviceConditionLabels.USED).toBe("Usado");
    expect(deviceConditionLabels.REFURBISHED).toBe("Recondicionado");
    expect(deviceConditionLabels.DEFECTIVE).toBe("Defeituoso");
  });
});
