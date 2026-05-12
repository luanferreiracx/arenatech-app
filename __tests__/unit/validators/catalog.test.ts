import { describe, it, expect } from "vitest";
import {
  createServiceSchema,
  createDiagnosticTemplateSchema,
  createDeviceCategorySchema,
  createDeviceSchema,
} from "@/lib/validators/catalog";

describe("createServiceSchema", () => {
  it("rejeita nome vazio", () => {
    const result = createServiceSchema.safeParse({
      name: "",
      basePrice: 1000,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita preco negativo", () => {
    const result = createServiceSchema.safeParse({
      name: "Troca de Tela",
      basePrice: -100,
    });
    expect(result.success).toBe(false);
  });

  it("aceita preco zero", () => {
    const result = createServiceSchema.safeParse({
      name: "Diagnostico Gratuito",
      basePrice: 0,
    });
    expect(result.success).toBe(true);
  });

  it("aceita servico valido completo", () => {
    const result = createServiceSchema.safeParse({
      name: "Troca de Tela",
      description: "Substituicao da tela do aparelho",
      basePrice: 25000, // R$ 250,00 em centavos
      estimatedTime: "1 hora",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Troca de Tela");
      expect(result.data.basePrice).toBe(25000);
    }
  });

  it("aceita servico valido minimo", () => {
    const result = createServiceSchema.safeParse({
      name: "Servico",
      basePrice: 100,
    });
    expect(result.success).toBe(true);
  });
});

describe("createDiagnosticTemplateSchema", () => {
  it("rejeita titulo vazio", () => {
    const result = createDiagnosticTemplateSchema.safeParse({
      title: "",
      content: "Conteudo do template",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita conteudo vazio", () => {
    const result = createDiagnosticTemplateSchema.safeParse({
      title: "Template Teste",
      content: "",
    });
    expect(result.success).toBe(false);
  });

  it("aceita template valido", () => {
    const result = createDiagnosticTemplateSchema.safeParse({
      title: "Checklist de Display",
      content: "1. Verificar pixels mortos\n2. Testar touch",
      category: "Tela",
    });
    expect(result.success).toBe(true);
  });
});

describe("createDeviceCategorySchema", () => {
  it("rejeita nome vazio", () => {
    const result = createDeviceCategorySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("aceita nome valido", () => {
    const result = createDeviceCategorySchema.safeParse({ name: "Smartphones" });
    expect(result.success).toBe(true);
  });
});

describe("createDeviceSchema", () => {
  it("rejeita marca vazia", () => {
    const result = createDeviceSchema.safeParse({
      brand: "",
      model: "iPhone 15",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita modelo vazio", () => {
    const result = createDeviceSchema.safeParse({
      brand: "Apple",
      model: "",
    });
    expect(result.success).toBe(false);
  });

  it("aceita aparelho valido com categoria", () => {
    const result = createDeviceSchema.safeParse({
      brand: "Apple",
      model: "iPhone 15 Pro",
      categoryId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("aceita aparelho valido sem categoria", () => {
    const result = createDeviceSchema.safeParse({
      brand: "Samsung",
      model: "Galaxy S24",
    });
    expect(result.success).toBe(true);
  });
});
