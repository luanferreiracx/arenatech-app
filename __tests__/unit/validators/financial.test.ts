import { describe, it, expect } from "vitest";
import {
  createTransactionSchema,
  updateTransactionSchema,
  listTransactionsSchema,
  payInstallmentSchema,
  reverseInstallmentSchema,
  cashFlowSchema,
  overdueSchema,
  transactionTypeEnum,
  transactionStatusEnum,
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_STATUS_LABELS,
  INSTALLMENT_STATUS_LABELS,
} from "@/lib/validators/financial";

// ── createTransactionSchema ──

describe("createTransactionSchema", () => {
  const validInput = {
    type: "RECEIVABLE" as const,
    description: "Venda a prazo",
    totalAmount: 50000, // R$ 500,00
    numInstallments: 3,
    emissionDate: "2026-05-08",
  };

  it("aceita input valido minimo", () => {
    const result = createTransactionSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("aceita input completo RECEIVABLE", () => {
    const result = createTransactionSchema.safeParse({
      ...validInput,
      category: "Servicos",
      customerName: "Joao Silva",
      customerId: "550e8400-e29b-41d4-a716-446655440000",
      paymentMethod: "cartao_credito",
      firstDueDate: "2026-06-08",
      notes: "Parcelamento cliente VIP",
    });
    expect(result.success).toBe(true);
  });

  it("aceita input completo PAYABLE", () => {
    const result = createTransactionSchema.safeParse({
      ...validInput,
      type: "PAYABLE",
      supplier: "Fornecedor XYZ",
      category: "Material",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita descricao vazia", () => {
    const result = createTransactionSchema.safeParse({
      ...validInput,
      description: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita totalAmount zero", () => {
    const result = createTransactionSchema.safeParse({
      ...validInput,
      totalAmount: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita totalAmount negativo", () => {
    const result = createTransactionSchema.safeParse({
      ...validInput,
      totalAmount: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita numInstallments zero", () => {
    const result = createTransactionSchema.safeParse({
      ...validInput,
      numInstallments: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita numInstallments > 60", () => {
    const result = createTransactionSchema.safeParse({
      ...validInput,
      numInstallments: 61,
    });
    expect(result.success).toBe(false);
  });

  it("aceita numInstallments = 60", () => {
    const result = createTransactionSchema.safeParse({
      ...validInput,
      numInstallments: 60,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita emissionDate vazia", () => {
    const result = createTransactionSchema.safeParse({
      ...validInput,
      emissionDate: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita tipo invalido", () => {
    const result = createTransactionSchema.safeParse({
      ...validInput,
      type: "INVALID",
    });
    expect(result.success).toBe(false);
  });
});

// ── updateTransactionSchema ──

describe("updateTransactionSchema", () => {
  it("aceita update valido", () => {
    const result = updateTransactionSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      description: "Atualizada",
      category: "Nova Categoria",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita UUID invalido", () => {
    const result = updateTransactionSchema.safeParse({
      id: "not-a-uuid",
      description: "Teste",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita descricao vazia", () => {
    const result = updateTransactionSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      description: "",
    });
    expect(result.success).toBe(false);
  });
});

// ── listTransactionsSchema ──

describe("listTransactionsSchema", () => {
  it("aceita listagem minima", () => {
    const result = listTransactionsSchema.safeParse({
      type: "RECEIVABLE",
    });
    expect(result.success).toBe(true);
  });

  it("aceita listagem com todos os filtros", () => {
    const result = listTransactionsSchema.safeParse({
      type: "PAYABLE",
      status: "PENDING",
      search: "fornecedor",
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      page: 0,
      pageSize: 50,
      sortBy: "dueDate",
      sortOrder: "asc",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita tipo ausente", () => {
    const result = listTransactionsSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejeita pageSize > 100", () => {
    const result = listTransactionsSchema.safeParse({
      type: "RECEIVABLE",
      pageSize: 101,
    });
    expect(result.success).toBe(false);
  });
});

// ── payInstallmentSchema ──

describe("payInstallmentSchema", () => {
  it("aceita pagamento valido", () => {
    const result = payInstallmentSchema.safeParse({
      installmentId: "550e8400-e29b-41d4-a716-446655440000",
      amountPaid: 10000,
      paymentMethod: "pix",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita amountPaid zero", () => {
    const result = payInstallmentSchema.safeParse({
      installmentId: "550e8400-e29b-41d4-a716-446655440000",
      amountPaid: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita amountPaid negativo", () => {
    const result = payInstallmentSchema.safeParse({
      installmentId: "550e8400-e29b-41d4-a716-446655440000",
      amountPaid: -100,
    });
    expect(result.success).toBe(false);
  });

  it("aceita sem forma de pagamento e sem notas", () => {
    const result = payInstallmentSchema.safeParse({
      installmentId: "550e8400-e29b-41d4-a716-446655440000",
      amountPaid: 5000,
    });
    expect(result.success).toBe(true);
  });
});

// ── reverseInstallmentSchema ──

describe("reverseInstallmentSchema", () => {
  it("aceita estorno valido", () => {
    const result = reverseInstallmentSchema.safeParse({
      installmentId: "550e8400-e29b-41d4-a716-446655440000",
      reason: "Pagamento duplicado",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita motivo curto (< 3 chars)", () => {
    const result = reverseInstallmentSchema.safeParse({
      installmentId: "550e8400-e29b-41d4-a716-446655440000",
      reason: "ab",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita motivo vazio", () => {
    const result = reverseInstallmentSchema.safeParse({
      installmentId: "550e8400-e29b-41d4-a716-446655440000",
      reason: "",
    });
    expect(result.success).toBe(false);
  });
});

// ── cashFlowSchema ──

describe("cashFlowSchema", () => {
  it("aceita fluxo de caixa valido", () => {
    const result = cashFlowSchema.safeParse({
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      groupBy: "month",
    });
    expect(result.success).toBe(true);
  });

  it("aceita sem groupBy", () => {
    const result = cashFlowSchema.safeParse({
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita dateFrom vazia", () => {
    const result = cashFlowSchema.safeParse({
      dateFrom: "",
      dateTo: "2026-12-31",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita dateTo vazia", () => {
    const result = cashFlowSchema.safeParse({
      dateFrom: "2026-01-01",
      dateTo: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita groupBy invalido", () => {
    const result = cashFlowSchema.safeParse({
      dateFrom: "2026-01-01",
      dateTo: "2026-12-31",
      groupBy: "quarter",
    });
    expect(result.success).toBe(false);
  });
});

// ── overdueSchema ──

describe("overdueSchema", () => {
  it("aceita sem parametros", () => {
    const result = overdueSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("aceita com tipo", () => {
    const result = overdueSchema.safeParse({
      type: "RECEIVABLE",
    });
    expect(result.success).toBe(true);
  });

  it("aceita com paginacao", () => {
    const result = overdueSchema.safeParse({
      type: "PAYABLE",
      page: 0,
      pageSize: 50,
    });
    expect(result.success).toBe(true);
  });
});

// ── Enums ──

describe("transactionTypeEnum", () => {
  it("aceita PAYABLE", () => {
    expect(transactionTypeEnum.safeParse("PAYABLE").success).toBe(true);
  });

  it("aceita RECEIVABLE", () => {
    expect(transactionTypeEnum.safeParse("RECEIVABLE").success).toBe(true);
  });

  it("rejeita valor invalido", () => {
    expect(transactionTypeEnum.safeParse("UNKNOWN").success).toBe(false);
  });
});

describe("transactionStatusEnum", () => {
  it("aceita todos os status", () => {
    const statuses = ["PENDING", "PAID", "OVERDUE", "CANCELLED", "PARTIALLY_PAID"];
    for (const s of statuses) {
      expect(transactionStatusEnum.safeParse(s).success).toBe(true);
    }
  });
});

// ── Labels ──

describe("labels", () => {
  it("TRANSACTION_TYPE_LABELS cobre todos os tipos", () => {
    expect(TRANSACTION_TYPE_LABELS["PAYABLE"]).toBe("A Pagar");
    expect(TRANSACTION_TYPE_LABELS["RECEIVABLE"]).toBe("A Receber");
  });

  it("TRANSACTION_STATUS_LABELS cobre todos os status", () => {
    expect(TRANSACTION_STATUS_LABELS["PENDING"]).toBe("Pendente");
    expect(TRANSACTION_STATUS_LABELS["PAID"]).toBe("Paga");
    expect(TRANSACTION_STATUS_LABELS["OVERDUE"]).toBe("Vencida");
    expect(TRANSACTION_STATUS_LABELS["CANCELLED"]).toBe("Cancelada");
    expect(TRANSACTION_STATUS_LABELS["PARTIALLY_PAID"]).toBe("Parcialmente Paga");
  });

  it("INSTALLMENT_STATUS_LABELS cobre os status de parcela", () => {
    expect(INSTALLMENT_STATUS_LABELS["PENDING"]).toBe("Pendente");
    expect(INSTALLMENT_STATUS_LABELS["PAID"]).toBe("Paga");
    expect(INSTALLMENT_STATUS_LABELS["OVERDUE"]).toBe("Vencida");
    expect(INSTALLMENT_STATUS_LABELS["CANCELLED"]).toBe("Cancelada");
  });
});
