import { describe, it, expect } from "vitest";
import {
  createServiceOrderSchema,
  updateServiceOrderSchema,
  updateStatusSchema,
  addItemSchema,
  updateItemSchema,
  registerPaymentSchema,
  cancelOrderSchema,
  uncancelOrderSchema,
  refundOrderSchema,
  updateCostsSchema,
  updateDiscountSchema,
  listServiceOrdersSchema,
  requestBudgetApprovalSchema,
  respondQuoteSchema,
  sendSignatureSchema,
  confirmPhysicalSignatureSchema,
  sendToLabSchema,
  receiveFromLabSchema,
  cancelLabSchema,
  checklistSchema,
  deviceInfoSchema,
  createItemSchema,
  serviceOrderStatusEnum,
  serviceOrderItemTypeEnum,
  deviceTypeEnum,
  warrantyTypeEnum,
  ALLOWED_TRANSITIONS,
  isSkippingSteps,
  STATUS_FLOW,
  SERVICE_ORDER_STATUS_LABELS,
} from "@/lib/validators/service-order";

// ── Enums ──

describe("serviceOrderStatusEnum", () => {
  it("accepts valid statuses", () => {
    expect(serviceOrderStatusEnum.parse("OPEN")).toBe("OPEN");
    expect(serviceOrderStatusEnum.parse("IN_DIAGNOSIS")).toBe("IN_DIAGNOSIS");
    expect(serviceOrderStatusEnum.parse("COMPLETED")).toBe("COMPLETED");
    expect(serviceOrderStatusEnum.parse("CANCELLED")).toBe("CANCELLED");
    expect(serviceOrderStatusEnum.parse("REFUNDED")).toBe("REFUNDED");
  });

  it("rejects invalid status", () => {
    expect(() => serviceOrderStatusEnum.parse("INVALID")).toThrow();
  });
});

describe("deviceTypeEnum", () => {
  it("accepts valid device types", () => {
    expect(deviceTypeEnum.parse("iPhone")).toBe("iPhone");
    expect(deviceTypeEnum.parse("Android")).toBe("Android");
    expect(deviceTypeEnum.parse("MacBook")).toBe("MacBook");
    expect(deviceTypeEnum.parse("Console")).toBe("Console");
    expect(deviceTypeEnum.parse("Outro")).toBe("Outro");
  });

  it("rejects invalid type", () => {
    expect(() => deviceTypeEnum.parse("Desktop")).toThrow();
  });
});

describe("warrantyTypeEnum", () => {
  it("accepts valid warranty types (paridade Laravel)", () => {
    expect(warrantyTypeEnum.parse("none")).toBe("none");
    expect(warrantyTypeEnum.parse("return")).toBe("return");
    expect(warrantyTypeEnum.parse("sold_product")).toBe("sold_product");
    expect(warrantyTypeEnum.parse("manufacturer")).toBe("manufacturer");
  });
});

// ── Checklist ──

describe("checklistSchema", () => {
  it("accepts valid checklist with 3 states", () => {
    const result = checklistSchema.parse({
      aparelhoLiga: true,      // OK
      aparelhoVibra: false,    // NOK
      botoes: null,            // N/A
      wifi: undefined,         // not filled
    });
    expect(result.aparelhoLiga).toBe(true);
    expect(result.aparelhoVibra).toBe(false);
    expect(result.botoes).toBeNull();
  });

  it("accepts empty checklist", () => {
    const result = checklistSchema.parse({});
    expect(result).toEqual({});
  });
});

describe("deviceInfoSchema", () => {
  it("accepts valid device info", () => {
    const result = deviceInfoSchema.parse({
      deviceGotWet: true,
      notOriginalCharger: false,
    });
    expect(result.deviceGotWet).toBe(true);
    expect(result.notOriginalCharger).toBe(false);
  });
});

// ── Create Item ──

describe("createItemSchema", () => {
  it("accepts valid service item", () => {
    const result = createItemSchema.parse({
      type: "SERVICE",
      serviceId: "550e8400-e29b-41d4-a716-446655440000",
      description: "Troca de tela",
      quantity: 1,
      unitPrice: 15000, // R$ 150,00 em centavos
    });
    expect(result.type).toBe("SERVICE");
    expect(result.unitPrice).toBe(15000);
  });

  it("rejects item without description", () => {
    expect(() =>
      createItemSchema.parse({
        type: "SERVICE",
        description: "",
        quantity: 1,
        unitPrice: 0,
      })
    ).toThrow();
  });

  it("rejects negative price", () => {
    expect(() =>
      createItemSchema.parse({
        type: "PRODUCT",
        description: "Peca",
        quantity: 1,
        unitPrice: -100,
      })
    ).toThrow();
  });
});

// ── Create Service Order ──

describe("createServiceOrderSchema", () => {
  it("accepts valid create input", () => {
    const result = createServiceOrderSchema.parse({
      customerId: "550e8400-e29b-41d4-a716-446655440000",
      reportedProblem: "Tela quebrada",
      items: [],
    });
    expect(result.customerId).toBeDefined();
    expect(result.reportedProblem).toBe("Tela quebrada");
  });

  it("rejects without customer", () => {
    expect(() =>
      createServiceOrderSchema.parse({
        reportedProblem: "Tela quebrada",
        items: [],
      })
    ).toThrow();
  });

  it("rejects without problem", () => {
    expect(() =>
      createServiceOrderSchema.parse({
        customerId: "550e8400-e29b-41d4-a716-446655440000",
        reportedProblem: "",
        items: [],
      })
    ).toThrow();
  });

  it("accepts full input with items", () => {
    const result = createServiceOrderSchema.parse({
      customerId: "550e8400-e29b-41d4-a716-446655440000",
      deviceType: "iPhone",
      deviceModel: "iPhone 15",
      imei: "123456789012345",
      reportedProblem: "Tela quebrada",
      entryChecklist: { display: false, battery: true },
      deviceInfo: { deviceFell: true },
      items: [
        { type: "SERVICE", description: "Troca de tela", quantity: 1, unitPrice: 15000 },
        { type: "PRODUCT", description: "Tela original", quantity: 1, unitPrice: 8000, costPrice: 5000 },
      ],
      technicianId: "550e8400-e29b-41d4-a716-446655440001",
      isWarranty: false,
      warrantyMonths: 3,
    });
    expect(result.items).toHaveLength(2);
    expect(result.deviceType).toBe("iPhone");
  });
});

// ── Update Service Order ──

describe("updateServiceOrderSchema", () => {
  it("accepts valid update", () => {
    const result = updateServiceOrderSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      diagnosedProblem: "IC de carga queimado",
      internalNotes: "Precisa de micro-solda",
    });
    expect(result.diagnosedProblem).toBe("IC de carga queimado");
  });
});

// ── Update Status ──

describe("updateStatusSchema", () => {
  it("accepts valid status update", () => {
    const result = updateStatusSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      status: "IN_DIAGNOSIS",
      notes: "Iniciando diagnostico",
    });
    expect(result.status).toBe("IN_DIAGNOSIS");
  });

  it("rejects invalid status", () => {
    expect(() =>
      updateStatusSchema.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        status: "INVALID",
      })
    ).toThrow();
  });
});

// ── Payment ──

describe("registerPaymentSchema", () => {
  it("accepts valid payment", () => {
    const result = registerPaymentSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      paymentMethod: "pix",
      paidAmount: 15000,
    });
    expect(result.paymentMethod).toBe("pix");
    expect(result.paidAmount).toBe(15000);
  });

  it("rejects without payment method", () => {
    expect(() =>
      registerPaymentSchema.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        paymentMethod: "",
        paidAmount: 15000,
      })
    ).toThrow();
  });
});

// ── Cancel ──

describe("cancelOrderSchema", () => {
  it("accepts valid cancel", () => {
    const result = cancelOrderSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      reason: "Cliente desistiu",
    });
    expect(result.reason).toBe("Cliente desistiu");
  });

  it("rejects empty reason", () => {
    expect(() =>
      cancelOrderSchema.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        reason: "",
      })
    ).toThrow();
  });
});

// ── Refund ──

describe("refundOrderSchema", () => {
  it("requires minimum 10 characters", () => {
    expect(() =>
      refundOrderSchema.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        reason: "curto",
      })
    ).toThrow();
  });

  it("accepts valid refund reason", () => {
    const result = refundOrderSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      reason: "Servico nao foi realizado corretamente, cliente voltou com mesmo defeito",
    });
    expect(result.reason).toContain("corretamente");
  });
});

// ── Quote ──

describe("requestBudgetApprovalSchema", () => {
  it("accepts a valid approval request", () => {
    const result = requestBudgetApprovalSchema.parse({
      orderId: "550e8400-e29b-41d4-a716-446655440000",
      reason: "Defeito adicional encontrado",
    });
    expect(result.reason).toBe("Defeito adicional encontrado");
  });

  it("rejects empty reason", () => {
    expect(() =>
      requestBudgetApprovalSchema.parse({
        orderId: "550e8400-e29b-41d4-a716-446655440000",
        reason: "",
      }),
    ).toThrow();
  });
});

describe("updateDiscountSchema", () => {
  it("accepts a discount in cents", () => {
    const result = updateDiscountSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      discount: 1500,
    });
    expect(result.discount).toBe(1500);
  });

  it("rejects negative discount", () => {
    expect(() =>
      updateDiscountSchema.parse({
        id: "550e8400-e29b-41d4-a716-446655440000",
        discount: -1,
      }),
    ).toThrow();
  });
});

describe("respondQuoteSchema", () => {
  it("accepts approve", () => {
    const result = respondQuoteSchema.parse({
      link: "abc123",
      action: "approve",
    });
    expect(result.action).toBe("approve");
  });

  it("accepts reject with notes", () => {
    const result = respondQuoteSchema.parse({
      link: "abc123",
      action: "reject",
      customerNotes: "Muito caro",
    });
    expect(result.action).toBe("reject");
    expect(result.customerNotes).toBe("Muito caro");
  });
});

// ── Costs ──

describe("updateCostsSchema", () => {
  it("accepts valid costs", () => {
    const result = updateCostsSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      partsCost: 5000,
      otherCost: 2000,
    });
    expect(result.partsCost).toBe(5000);
    expect(result.otherCost).toBe(2000);
  });
});

// ── List ──

describe("listServiceOrdersSchema", () => {
  it("accepts empty filter", () => {
    const result = listServiceOrdersSchema.parse({});
    expect(result).toEqual({});
  });

  it("accepts full filter", () => {
    const result = listServiceOrdersSchema.parse({
      search: "iPhone",
      status: "OPEN",
      technicianId: "550e8400-e29b-41d4-a716-446655440000",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      page: 0,
      pageSize: 20,
      sortBy: "number",
      sortOrder: "desc",
    });
    expect(result.search).toBe("iPhone");
    expect(result.status).toBe("OPEN");
  });
});

// ── Signature ──

describe("sendSignatureSchema", () => {
  it("accepts valid signature request", () => {
    const result = sendSignatureSchema.parse({
      orderId: "550e8400-e29b-41d4-a716-446655440000",
      phone: "86999887766",
      type: "entry",
    });
    expect(result.type).toBe("entry");
  });
});

describe("confirmPhysicalSignatureSchema", () => {
  it("accepts delivery confirmation", () => {
    const result = confirmPhysicalSignatureSchema.parse({
      orderId: "550e8400-e29b-41d4-a716-446655440000",
      type: "delivery",
    });
    expect(result.type).toBe("delivery");
  });
});

// ── Lab ──

describe("sendToLabSchema", () => {
  it("accepts lab send with required deliveryPersonId + message", () => {
    const result = sendToLabSchema.parse({
      orderId: "550e8400-e29b-41d4-a716-446655440000",
      deliveryPersonId: "550e8400-e29b-41d4-a716-446655440001",
      message: "Levar a OS ao laboratorio X.",
    });
    expect(result.orderId).toBeDefined();
    expect(result.deliveryPersonId).toBeDefined();
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("rejects when deliveryPersonId or message is missing", () => {
    expect(() =>
      sendToLabSchema.parse({ orderId: "550e8400-e29b-41d4-a716-446655440000" }),
    ).toThrow();
    expect(() =>
      sendToLabSchema.parse({
        orderId: "550e8400-e29b-41d4-a716-446655440000",
        deliveryPersonId: "550e8400-e29b-41d4-a716-446655440001",
        message: "",
      }),
    ).toThrow();
  });
});

// ── Constants ──

describe("ALLOWED_TRANSITIONS", () => {
  it("OPEN can go to IN_DIAGNOSIS", () => {
    expect(ALLOWED_TRANSITIONS.OPEN).toContain("IN_DIAGNOSIS");
  });

  it("OPEN can be cancelled", () => {
    expect(ALLOWED_TRANSITIONS.OPEN).toContain("CANCELLED");
  });

  it("DELIVERED has no transitions", () => {
    expect(ALLOWED_TRANSITIONS.DELIVERED).toHaveLength(0);
  });

  it("COMPLETED can go to PAID", () => {
    expect(ALLOWED_TRANSITIONS.COMPLETED).toContain("PAID");
  });

  it("permite saltar etapas para frente ate COMPLETED (item 3)", () => {
    // Fase de servico: qualquer status pre-COMPLETED pode pular direto pra concluir.
    expect(ALLOWED_TRANSITIONS.OPEN).toContain("COMPLETED");
    expect(ALLOWED_TRANSITIONS.IN_DIAGNOSIS).toContain("COMPLETED");
    expect(ALLOWED_TRANSITIONS.APPROVED).toContain("COMPLETED");
    expect(ALLOWED_TRANSITIONS.WAITING_PARTS).toContain("COMPLETED");
  });

  it("mantem fase pos-conclusao estrita", () => {
    // PAID nao pode pular direto pra DELIVERED sem passar pelos gates? Ainda
    // pode ir a DELIVERED (regra existente), mas COMPLETED nao salta PAID.
    expect(ALLOWED_TRANSITIONS.COMPLETED).not.toContain("DELIVERED");
    expect(ALLOWED_TRANSITIONS.COMPLETED).not.toContain("READY_FOR_PICKUP");
  });
});

describe("isSkippingSteps", () => {
  it("detecta salto de etapas no fluxo principal", () => {
    expect(isSkippingSteps("OPEN", "COMPLETED")).toBe(true);
    expect(isSkippingSteps("IN_DIAGNOSIS", "IN_PROGRESS")).toBe(true);
  });

  it("nao considera salto a transicao para o proximo imediato", () => {
    expect(isSkippingSteps("OPEN", "IN_DIAGNOSIS")).toBe(false);
    expect(isSkippingSteps("IN_PROGRESS", "COMPLETED")).toBe(false);
  });

  it("retorna false para status fora do fluxo principal", () => {
    expect(isSkippingSteps("OPEN", "CANCELLED")).toBe(false);
  });
});

describe("STATUS_FLOW", () => {
  it("has 9 steps", () => {
    expect(STATUS_FLOW).toHaveLength(9);
  });

  it("starts with OPEN and ends with DELIVERED", () => {
    expect(STATUS_FLOW[0]).toBe("OPEN");
    expect(STATUS_FLOW[STATUS_FLOW.length - 1]).toBe("DELIVERED");
  });
});

describe("SERVICE_ORDER_STATUS_LABELS", () => {
  it("has label for every status", () => {
    for (const status of serviceOrderStatusEnum.options) {
      expect(SERVICE_ORDER_STATUS_LABELS[status]).toBeDefined();
      expect(typeof SERVICE_ORDER_STATUS_LABELS[status]).toBe("string");
    }
  });
});
