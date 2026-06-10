/**
 * Webhook Autentique — assinatura de OS de entrada e de revisao de orcamento.
 *
 * Regressao: orcamento revisado enviado ao cliente agora vai para assinatura
 * no Autentique (com botao "Assinar"). Quando o cliente assina, o webhook
 * `signature.accepted` deve aprovar o orcamento (status approved, OS sai de
 * WAITING_APPROVAL) — antes o documentId so era reconhecido como OS de entrada.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

const state = vi.hoisted(() => ({
  recordWebhookEvent: vi.fn().mockResolvedValue(true),
  markWebhookProcessed: vi.fn().mockResolvedValue(undefined),
  cancelPixPayment: vi.fn().mockResolvedValue(undefined),
  quote: null as Record<string, unknown> | null,
  order: null as Record<string, unknown> | null,
  entryOrder: null as Record<string, unknown> | null,
  tx: {
    serviceOrderQuote: {
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    serviceOrder: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    serviceOrderItem: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    serviceOrderHistory: {
      findFirst: vi.fn().mockResolvedValue({ previousStatus: "IN_PROGRESS" }),
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (tx: typeof state.tx) => unknown) => fn(state.tx),
}));

vi.mock("@/lib/webhooks/replay-guard", () => ({
  recordWebhookEvent: (args: unknown) => state.recordWebhookEvent(args),
  markWebhookProcessed: (...args: unknown[]) => state.markWebhookProcessed(...args),
  extractSourceIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/services/depix-service", () => ({
  cancelPixPayment: (id: string) => state.cancelPixPayment(id),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from "@/app/api/webhooks/autentique/route";

function makeRequest(payload: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/webhooks/autentique", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function signaturePayload(documentId: string) {
  return {
    event: {
      type: "signature.accepted",
      data: { document: documentId, signed: "2026-06-10T12:00:00Z" },
    },
  };
}

beforeEach(() => {
  delete process.env.AUTENTIQUE_WEBHOOK_SECRET;
  vi.clearAllMocks();
  state.recordWebhookEvent.mockResolvedValue(true);
  state.tx.serviceOrderItem.findMany.mockResolvedValue([]);
  state.tx.serviceOrderHistory.findFirst.mockResolvedValue({ previousStatus: "IN_PROGRESS" });
});

describe("POST /api/webhooks/autentique — assinatura de orcamento", () => {
  it("aprova o orcamento quando o documento assinado e um ServiceOrderQuote", async () => {
    state.tx.serviceOrderQuote.findFirst.mockResolvedValue({
      id: "quote-1",
      orderId: "order-1",
      status: "pending",
      newTotal: new Prisma.Decimal(500),
      previousTotal: new Prisma.Decimal(300),
    });
    state.tx.serviceOrder.findUnique.mockResolvedValue({
      id: "order-1",
      tenantId: "tenant-1",
      createdById: "user-1",
      deletedAt: null,
      depixStatus: null,
      walletTransactionId: null,
      depixTransactionId: null,
    });

    const res = await POST(makeRequest(signaturePayload("doc-quote")));

    expect(res.status).toBe(200);
    expect(state.tx.serviceOrderQuote.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "quote-1" },
        data: expect.objectContaining({ status: "approved" }),
      }),
    );
    expect(state.tx.serviceOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "order-1" },
        data: expect.objectContaining({ pendingQuoteId: null, budgetPending: false }),
      }),
    );
    // Nao deve cair no fluxo de OS de entrada.
    expect(state.tx.serviceOrder.findFirst).not.toHaveBeenCalled();
  });

  it("cancela o PIX quando o valor do orcamento mudou e havia deposito pendente", async () => {
    state.tx.serviceOrderQuote.findFirst.mockResolvedValue({
      id: "quote-2",
      orderId: "order-2",
      status: "pending",
      newTotal: new Prisma.Decimal(800),
      previousTotal: new Prisma.Decimal(300),
    });
    state.tx.serviceOrder.findUnique.mockResolvedValue({
      id: "order-2",
      tenantId: "tenant-1",
      createdById: "user-1",
      deletedAt: null,
      depixStatus: "pending",
      walletTransactionId: null,
      depixTransactionId: "pix-tx-1",
    });

    const res = await POST(makeRequest(signaturePayload("doc-quote-2")));

    expect(res.status).toBe(200);
    expect(state.cancelPixPayment).toHaveBeenCalledWith("pix-tx-1");
  });

  it("e idempotente: nao reaplica se o quote ja foi aprovado", async () => {
    state.tx.serviceOrderQuote.findFirst.mockResolvedValue({
      id: "quote-3",
      orderId: "order-3",
      status: "approved",
      newTotal: new Prisma.Decimal(500),
      previousTotal: new Prisma.Decimal(300),
    });

    const res = await POST(makeRequest(signaturePayload("doc-quote-3")));

    expect(res.status).toBe(200);
    expect(state.tx.serviceOrderQuote.update).not.toHaveBeenCalled();
    expect(state.tx.serviceOrder.update).not.toHaveBeenCalled();
  });

  it("cai no fluxo de OS de entrada quando o documento nao e um quote", async () => {
    state.tx.serviceOrderQuote.findFirst.mockResolvedValue(null);
    state.tx.serviceOrder.findFirst.mockResolvedValue({
      id: "order-entry",
      tenantId: "tenant-1",
      customerId: "cust-1",
      number: "123",
      status: "RECEIVED",
      signatureSignedAt: null,
      createdById: "user-1",
    });

    const res = await POST(makeRequest(signaturePayload("doc-entry")));

    expect(res.status).toBe(200);
    expect(state.tx.serviceOrder.findFirst).toHaveBeenCalled();
    expect(state.tx.serviceOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "order-entry" },
        data: expect.objectContaining({ signatureSignedAt: expect.any(Date) }),
      }),
    );
  });
});
