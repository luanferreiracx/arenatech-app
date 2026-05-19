import { describe, it, expect } from "vitest";
import {
  createServiceSchema,
  bulkAdjustSchema,
  renameTypeSchema,
  duplicateTypeSchema,
  sendServiceWhatsAppSchema,
} from "@/lib/validators/catalog";

describe("createServiceSchema", () => {
  it("rejeita tipo de servico vazio", () => {
    const result = createServiceSchema.safeParse({
      serviceType: "",
      deviceModel: "iPhone 15",
      basePrice: 1000,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita modelo vazio", () => {
    const result = createServiceSchema.safeParse({
      serviceType: "Troca de Tela",
      deviceModel: "",
      basePrice: 1000,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita preco negativo", () => {
    const result = createServiceSchema.safeParse({
      serviceType: "Troca de Tela",
      deviceModel: "iPhone 15",
      basePrice: -100,
    });
    expect(result.success).toBe(false);
  });

  it("aceita preco zero", () => {
    const result = createServiceSchema.safeParse({
      serviceType: "Diagnostico Gratuito",
      deviceModel: "iPhone",
      basePrice: 0,
    });
    expect(result.success).toBe(true);
  });

  it("aceita servico valido completo", () => {
    const result = createServiceSchema.safeParse({
      serviceType: "Troca de Tela",
      deviceModel: "iPhone 15 Pro",
      description: "Substituicao da tela do aparelho",
      basePrice: 25000,
      estimatedTime: "1 hora",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.serviceType).toBe("Troca de Tela");
      expect(result.data.deviceModel).toBe("iPhone 15 Pro");
      expect(result.data.basePrice).toBe(25000);
    }
  });

  it("aceita servico valido minimo", () => {
    const result = createServiceSchema.safeParse({
      serviceType: "Servico",
      deviceModel: "Aparelho",
      basePrice: 100,
    });
    expect(result.success).toBe(true);
  });
});

describe("bulkAdjustSchema", () => {
  it("rejeita tipo vazio", () => {
    const result = bulkAdjustSchema.safeParse({
      serviceType: "",
      adjustmentCents: 1000,
    });
    expect(result.success).toBe(false);
  });

  it("aceita ajuste positivo", () => {
    const result = bulkAdjustSchema.safeParse({
      serviceType: "Troca de Tela",
      adjustmentCents: 5000,
    });
    expect(result.success).toBe(true);
  });

  it("aceita ajuste negativo", () => {
    const result = bulkAdjustSchema.safeParse({
      serviceType: "Troca de Tela",
      adjustmentCents: -3000,
    });
    expect(result.success).toBe(true);
  });
});

describe("renameTypeSchema", () => {
  it("rejeita nomes vazios", () => {
    expect(renameTypeSchema.safeParse({ oldName: "", newName: "Novo" }).success).toBe(false);
    expect(renameTypeSchema.safeParse({ oldName: "Antigo", newName: "" }).success).toBe(false);
  });

  it("aceita renomeacao valida", () => {
    const result = renameTypeSchema.safeParse({
      oldName: "Troca de Tela",
      newName: "Troca de Display",
    });
    expect(result.success).toBe(true);
  });
});

describe("duplicateTypeSchema", () => {
  it("rejeita nomes vazios", () => {
    expect(duplicateTypeSchema.safeParse({ sourceType: "", newType: "Novo" }).success).toBe(false);
    expect(duplicateTypeSchema.safeParse({ sourceType: "Antigo", newType: "" }).success).toBe(false);
  });

  it("aceita duplicacao valida", () => {
    const result = duplicateTypeSchema.safeParse({
      sourceType: "Troca de Tela",
      newType: "Troca de Tela Premium",
    });
    expect(result.success).toBe(true);
  });
});

describe("sendServiceWhatsAppSchema", () => {
  it("rejeita dados incompletos", () => {
    expect(
      sendServiceWhatsAppSchema.safeParse({
        serviceId: "550e8400-e29b-41d4-a716-446655440000",
        clientName: "",
        clientPhone: "11999999999",
      }).success,
    ).toBe(false);
  });

  it("rejeita telefone curto", () => {
    expect(
      sendServiceWhatsAppSchema.safeParse({
        serviceId: "550e8400-e29b-41d4-a716-446655440000",
        clientName: "Joao",
        clientPhone: "123",
      }).success,
    ).toBe(false);
  });

  it("aceita dados validos", () => {
    const result = sendServiceWhatsAppSchema.safeParse({
      serviceId: "550e8400-e29b-41d4-a716-446655440000",
      clientName: "Joao Silva",
      clientPhone: "11999999999",
    });
    expect(result.success).toBe(true);
  });
});
