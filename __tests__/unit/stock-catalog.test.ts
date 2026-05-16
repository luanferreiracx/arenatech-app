import { describe, it, expect } from "vitest";
import {
  createProductSchema,
  createAttributeSchema,
  createAttributeValueSchema,
  createVariationSchema,
  createPhotoSchema,
  createSupplierSchema,
  createCategorySchema,
  searchNcmSchema,
  lookupCnpjSchema,
  duplicateProductSchema,
  updateVariationSchema,
  setPrimaryPhotoSchema,
} from "@/lib/validators/stock";

describe("Estoque-A Validators", () => {
  describe("createProductSchema", () => {
    it("accepts valid product with all fields", () => {
      const result = createProductSchema.safeParse({
        name: "iPhone 15 Pro",
        sku: "IP15P-256",
        barcode: "7891234567890",
        brand: "Apple",
        ncm: "85171200",
        cest: "2106300",
        isSerialized: true,
        isPremium: true,
        hasVariations: false,
        icmsDifferentialRate: 4.5,
        costPrice: 520000,
        salePrice: 649900,
        promotionalPrice: 619900,
        defaultMargin: 25,
        minStock: 5,
        unit: "un",
        active: true,
        categoryId: "123e4567-e89b-12d3-a456-426614174000",
        categoryIds: ["123e4567-e89b-12d3-a456-426614174000"],
      });
      expect(result.success).toBe(true);
    });

    it("accepts minimal product", () => {
      const result = createProductSchema.safeParse({
        name: "Cabo USB",
        costPrice: 0,
        salePrice: 1990,
      });
      expect(result.success).toBe(true);
    });

    it("rejects name too short", () => {
      const result = createProductSchema.safeParse({
        name: "A",
        costPrice: 0,
        salePrice: 1000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid NCM format", () => {
      const result = createProductSchema.safeParse({
        name: "Produto",
        costPrice: 0,
        salePrice: 1000,
        ncm: "1234", // must be 8 digits
      });
      expect(result.success).toBe(false);
    });

    it("accepts valid 8-digit NCM", () => {
      const result = createProductSchema.safeParse({
        name: "Produto",
        costPrice: 0,
        salePrice: 1000,
        ncm: "85171200",
      });
      expect(result.success).toBe(true);
    });

    it("rejects NCM with letters", () => {
      const result = createProductSchema.safeParse({
        name: "Produto",
        costPrice: 0,
        salePrice: 1000,
        ncm: "8517120A",
      });
      expect(result.success).toBe(false);
    });

    it("rejects more than 3 categories", () => {
      const result = createProductSchema.safeParse({
        name: "Produto",
        costPrice: 0,
        salePrice: 1000,
        categoryIds: [
          "123e4567-e89b-12d3-a456-426614174000",
          "123e4567-e89b-12d3-a456-426614174001",
          "123e4567-e89b-12d3-a456-426614174002",
          "123e4567-e89b-12d3-a456-426614174003",
        ],
      });
      expect(result.success).toBe(false);
    });

    it("accepts exactly 3 categories", () => {
      const result = createProductSchema.safeParse({
        name: "Produto",
        costPrice: 0,
        salePrice: 1000,
        categoryIds: [
          "123e4567-e89b-12d3-a456-426614174000",
          "123e4567-e89b-12d3-a456-426614174001",
          "123e4567-e89b-12d3-a456-426614174002",
        ],
      });
      expect(result.success).toBe(true);
    });

    it("rejects negative cost price", () => {
      const result = createProductSchema.safeParse({
        name: "Produto",
        costPrice: -100,
        salePrice: 1000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects icmsDifferentialRate > 100", () => {
      const result = createProductSchema.safeParse({
        name: "Produto",
        costPrice: 0,
        salePrice: 1000,
        icmsDifferentialRate: 150,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("createAttributeSchema", () => {
    it("accepts valid attribute", () => {
      const result = createAttributeSchema.safeParse({ name: "Cor" });
      expect(result.success).toBe(true);
    });

    it("accepts with order", () => {
      const result = createAttributeSchema.safeParse({ name: "Armazenamento", order: 2 });
      expect(result.success).toBe(true);
    });

    it("rejects empty name", () => {
      const result = createAttributeSchema.safeParse({ name: "" });
      expect(result.success).toBe(false);
    });

    it("rejects name > 50 chars", () => {
      const result = createAttributeSchema.safeParse({ name: "A".repeat(51) });
      expect(result.success).toBe(false);
    });
  });

  describe("createAttributeValueSchema", () => {
    it("accepts valid value", () => {
      const result = createAttributeValueSchema.safeParse({
        attributeId: "123e4567-e89b-12d3-a456-426614174000",
        value: "Preto",
      });
      expect(result.success).toBe(true);
    });

    it("accepts with display value and code", () => {
      const result = createAttributeValueSchema.safeParse({
        attributeId: "123e4567-e89b-12d3-a456-426614174000",
        value: "preto_espacial",
        displayValue: "Preto Espacial",
        code: "BLK",
        order: 1,
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty value", () => {
      const result = createAttributeValueSchema.safeParse({
        attributeId: "123e4567-e89b-12d3-a456-426614174000",
        value: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid UUID for attributeId", () => {
      const result = createAttributeValueSchema.safeParse({
        attributeId: "not-a-uuid",
        value: "Red",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("createVariationSchema", () => {
    it("accepts valid variation", () => {
      const result = createVariationSchema.safeParse({
        productId: "123e4567-e89b-12d3-a456-426614174000",
        sku: "IP15P-BLK-256",
        costPrice: 520000,
        salePrice: 649900,
        attributeValueIds: ["123e4567-e89b-12d3-a456-426614174001"],
      });
      expect(result.success).toBe(true);
    });

    it("rejects variation without attribute values", () => {
      const result = createVariationSchema.safeParse({
        productId: "123e4567-e89b-12d3-a456-426614174000",
        attributeValueIds: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects negative prices", () => {
      const result = createVariationSchema.safeParse({
        productId: "123e4567-e89b-12d3-a456-426614174000",
        costPrice: -100,
        attributeValueIds: ["123e4567-e89b-12d3-a456-426614174001"],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("createPhotoSchema", () => {
    it("accepts valid photo", () => {
      const result = createPhotoSchema.safeParse({
        productId: "123e4567-e89b-12d3-a456-426614174000",
        url: "http://localhost:9000/arenatech/tenants/t1/products/p1/photo1-original.webp",
        thumbUrl: "http://localhost:9000/arenatech/tenants/t1/products/p1/photo1-thumb.webp",
        mediumUrl: "http://localhost:9000/arenatech/tenants/t1/products/p1/photo1-medium.webp",
        isPrimary: true,
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid URL", () => {
      const result = createPhotoSchema.safeParse({
        productId: "123e4567-e89b-12d3-a456-426614174000",
        url: "not-a-url",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("createCategorySchema", () => {
    it("accepts valid category", () => {
      const result = createCategorySchema.safeParse({
        name: "Acessorios",
        description: "Capas, peliculas, cabos",
        badgeColor: "#3498db",
        active: true,
      });
      expect(result.success).toBe(true);
    });

    it("accepts minimal category", () => {
      const result = createCategorySchema.safeParse({ name: "Aparelhos" });
      expect(result.success).toBe(true);
    });

    it("rejects invalid badge color", () => {
      const result = createCategorySchema.safeParse({
        name: "Test",
        badgeColor: "red",
      });
      expect(result.success).toBe(false);
    });

    it("accepts valid hex badge color", () => {
      const result = createCategorySchema.safeParse({
        name: "Test",
        badgeColor: "#FF5733",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("createSupplierSchema", () => {
    it("accepts valid PJ supplier", () => {
      const result = createSupplierSchema.safeParse({
        type: "PJ",
        name: "Tech Distribuidora Ltda",
        tradeName: "TechDist",
        cnpj: "12345678000190",
        phone: "86999991234",
        email: "contato@techdist.com",
        zipCode: "64000000",
        street: "Rua das Flores",
        streetNumber: "123",
        city: "Teresina",
        state: "PI",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid PF supplier", () => {
      const result = createSupplierSchema.safeParse({
        type: "PF",
        name: "Joao Silva",
        cpf: "12345678909",
        phone: "86999991234",
      });
      expect(result.success).toBe(true);
    });

    it("rejects name too short", () => {
      const result = createSupplierSchema.safeParse({
        type: "PJ",
        name: "A",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid email", () => {
      const result = createSupplierSchema.safeParse({
        type: "PJ",
        name: "Fornecedor Teste",
        email: "invalido",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("searchNcmSchema", () => {
    it("accepts term with 3+ chars", () => {
      const result = searchNcmSchema.safeParse({ term: "celular" });
      expect(result.success).toBe(true);
    });

    it("rejects term with < 3 chars", () => {
      const result = searchNcmSchema.safeParse({ term: "ab" });
      expect(result.success).toBe(false);
    });
  });

  describe("lookupCnpjSchema", () => {
    it("accepts valid CNPJ length", () => {
      const result = lookupCnpjSchema.safeParse({ cnpj: "12345678000190" });
      expect(result.success).toBe(true);
    });

    it("accepts formatted CNPJ", () => {
      const result = lookupCnpjSchema.safeParse({ cnpj: "12.345.678/0001-90" });
      expect(result.success).toBe(true);
    });

    it("rejects too short", () => {
      const result = lookupCnpjSchema.safeParse({ cnpj: "123" });
      expect(result.success).toBe(false);
    });
  });

  describe("duplicateProductSchema", () => {
    it("accepts valid duplicate request", () => {
      const result = duplicateProductSchema.safeParse({
        productId: "123e4567-e89b-12d3-a456-426614174000",
        newSku: "NEW-SKU-001",
      });
      expect(result.success).toBe(true);
    });

    it("accepts without new SKU (will be auto-generated)", () => {
      const result = duplicateProductSchema.safeParse({
        productId: "123e4567-e89b-12d3-a456-426614174000",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("setPrimaryPhotoSchema", () => {
    it("accepts valid UUIDs", () => {
      const result = setPrimaryPhotoSchema.safeParse({
        productId: "123e4567-e89b-12d3-a456-426614174000",
        photoId: "123e4567-e89b-12d3-a456-426614174001",
      });
      expect(result.success).toBe(true);
    });
  });
});
