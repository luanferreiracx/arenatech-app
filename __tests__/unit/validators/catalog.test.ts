import { describe, it, expect } from "vitest";
import {
  createServiceSchema,
  bulkAdjustSchema,
  sendServiceWhatsAppSchema,
} from "@/lib/validators/catalog";

/**
 * 2026-07-27 (auditoria item 17): o tipo de servico deixou de ser texto livre.
 * O formulario manda o ID da entidade (`serviceTypeId`) ou o nome de um tipo
 * novo (`newServiceTypeName`). `renameTypeSchema`/`duplicateTypeSchema`, que
 * enderecavam o tipo por nome, sairam junto com as procedures que os usavam.
 */
const TIPO_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("createServiceSchema", () => {
  it("rejeita id de tipo que nao e uuid", () => {
    const result = createServiceSchema.safeParse({
      serviceTypeId: "Troca de Tela",
      deviceModel: "iPhone 15",
      basePrice: 1000,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita nome de tipo novo curto demais", () => {
    const result = createServiceSchema.safeParse({
      newServiceTypeName: "T",
      deviceModel: "iPhone 15",
      basePrice: 1000,
    });
    expect(result.success).toBe(false);
  });

  it("aceita criar o tipo pelo nome (criacao inline)", () => {
    const result = createServiceSchema.safeParse({
      newServiceTypeName: "Troca de Tela",
      deviceModel: "iPhone 15",
      basePrice: 1000,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita modelo vazio", () => {
    const result = createServiceSchema.safeParse({
      serviceTypeId: TIPO_ID,
      deviceModel: "",
      basePrice: 1000,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita preco negativo", () => {
    const result = createServiceSchema.safeParse({
      serviceTypeId: TIPO_ID,
      deviceModel: "iPhone 15",
      basePrice: -100,
    });
    expect(result.success).toBe(false);
  });

  it("aceita preco zero", () => {
    const result = createServiceSchema.safeParse({
      serviceTypeId: TIPO_ID,
      deviceModel: "iPhone",
      basePrice: 0,
    });
    expect(result.success).toBe(true);
  });

  it("aceita servico valido completo", () => {
    const result = createServiceSchema.safeParse({
      serviceTypeId: TIPO_ID,
      deviceModel: "iPhone 15 Pro",
      description: "Substituicao da tela do aparelho",
      basePrice: 25000,
      estimatedTime: "1 hora",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.serviceTypeId).toBe(TIPO_ID);
      expect(result.data.deviceModel).toBe("iPhone 15 Pro");
      expect(result.data.basePrice).toBe(25000);
    }
  });

  it("aceita servico valido minimo", () => {
    const result = createServiceSchema.safeParse({
      serviceTypeId: TIPO_ID,
      deviceModel: "Aparelho",
      basePrice: 100,
    });
    expect(result.success).toBe(true);
  });
});

describe("bulkAdjustSchema", () => {
  it("rejeita tipo que nao e uuid", () => {
    const result = bulkAdjustSchema.safeParse({
      serviceTypeId: "Troca de Tela",
      adjustmentCents: 1000,
    });
    expect(result.success).toBe(false);
  });

  it("aceita ajuste positivo", () => {
    const result = bulkAdjustSchema.safeParse({
      serviceTypeId: TIPO_ID,
      adjustmentCents: 5000,
    });
    expect(result.success).toBe(true);
  });

  it("aceita ajuste negativo", () => {
    const result = bulkAdjustSchema.safeParse({
      serviceTypeId: TIPO_ID,
      adjustmentCents: -3000,
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
