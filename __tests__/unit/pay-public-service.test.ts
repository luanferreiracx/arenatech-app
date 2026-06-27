/**
 * generatePublicPix (pagamento publico de QuickSale): revalida TODAS as regras
 * no servidor — checkbox de titularidade, CPF obrigatorio+valido, limites
 * min/max e por documento, status AWAITING. Idempotencia (nao recria QR).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const qsFindFirst = vi.fn();
const qsUpdate = vi.fn();
const validateDepixLimit = vi.fn();
const createDeposit = vi.fn();

const tx = { quickSale: { findFirst: qsFindFirst, update: qsUpdate } };

vi.mock("@/server/db", () => ({
  withAdmin: (fn: (t: typeof tx) => unknown) => fn(tx),
}));
vi.mock("@/lib/services/depix-limit-service", () => ({
  validateDepixLimit: (...a: unknown[]) => validateDepixLimit(...a),
}));
vi.mock("@/server/services/depix-transaction.service", () => ({
  createDeposit: (...a: unknown[]) => createDeposit(...a),
  checkTransactionStatus: vi.fn(),
}));

import { generatePublicPix } from "@/server/services/pay-public.service";

// CPF valido (passa no isValidTaxId real).
const CPF = "52998224725";
const TOKEN = "tok_public_123456";

function quickSale(over: Record<string, unknown> = {}) {
  return {
    id: "qs-1",
    tenantId: "tenant-1",
    number: "VA-1",
    status: "AWAITING_PAYMENT",
    totalAmount: 50, // R$50 fixo
    publicAmountOpen: false,
    cpfCnpj: null,
    walletTransactionId: null,
    depixQrCode: null,
    depixQrCodeBase64: null,
    depixTransactionId: null,
    depixExpiresAt: null,
    createdById: "user-1",
    ...over,
  };
}

beforeEach(() => {
  for (const m of [qsFindFirst, qsUpdate, validateDepixLimit, createDeposit]) m.mockReset();
  qsFindFirst.mockResolvedValue(quickSale());
  qsUpdate.mockResolvedValue({});
  validateDepixLimit.mockResolvedValue({ allowed: true });
  createDeposit.mockResolvedValue({
    id: "wtx-1",
    pixpayDepixId: "qr-eulen-1",
    qrCode: "000201...",
    qrCodeBase64: "iVBOR...",
    expiresAt: new Date("2026-06-27T03:00:00Z"),
  });
});

describe("generatePublicPix", () => {
  it("rejeita sem confirmar titularidade (checkbox)", async () => {
    const r = await generatePublicPix({ token: TOKEN, taxId: CPF, amountCents: null, ownershipConfirmed: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("titular");
    expect(createDeposit).not.toHaveBeenCalled();
  });

  it("rejeita CPF/CNPJ invalido", async () => {
    const r = await generatePublicPix({ token: TOKEN, taxId: "111", amountCents: null, ownershipConfirmed: true });
    expect(r.ok).toBe(false);
    expect(createDeposit).not.toHaveBeenCalled();
  });

  it("rejeita venda que nao esta aguardando pagamento", async () => {
    qsFindFirst.mockResolvedValue(quickSale({ status: "PAID" }));
    const r = await generatePublicPix({ token: TOKEN, taxId: CPF, amountCents: null, ownershipConfirmed: true });
    expect(r.ok).toBe(false);
    expect(createDeposit).not.toHaveBeenCalled();
  });

  it("valor aberto abaixo do minimo -> rejeita", async () => {
    qsFindFirst.mockResolvedValue(quickSale({ publicAmountOpen: true, totalAmount: 0 }));
    const r = await generatePublicPix({ token: TOKEN, taxId: CPF, amountCents: 500, ownershipConfirmed: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("mínimo");
  });

  it("valor aberto acima do maximo -> rejeita", async () => {
    qsFindFirst.mockResolvedValue(quickSale({ publicAmountOpen: true, totalAmount: 0 }));
    const r = await generatePublicPix({ token: TOKEN, taxId: CPF, amountCents: 600000, ownershipConfirmed: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("máximo");
  });

  it("respeita o limite por documento", async () => {
    validateDepixLimit.mockResolvedValue({ allowed: false, reason: "Limite diário excedido." });
    const r = await generatePublicPix({ token: TOKEN, taxId: CPF, amountCents: null, ownershipConfirmed: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Limite");
    expect(createDeposit).not.toHaveBeenCalled();
  });

  it("caminho feliz (valor fixo): cria deposito com CPF e retorna QR", async () => {
    const r = await generatePublicPix({ token: TOKEN, taxId: CPF, amountCents: null, ownershipConfirmed: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.qrCode).toBe("000201...");
      expect(r.amountCents).toBe(5000);
    }
    expect(createDeposit).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", sourceType: "QUICK_SALE", sourceId: "qs-1", payerTaxId: CPF, grossAmountCents: 5000 }),
    );
  });

  it("valor aberto: usa o valor do cliente e persiste totalAmount", async () => {
    qsFindFirst.mockResolvedValue(quickSale({ publicAmountOpen: true, totalAmount: 0 }));
    const r = await generatePublicPix({ token: TOKEN, taxId: CPF, amountCents: 12300, ownershipConfirmed: true });
    expect(r.ok).toBe(true);
    expect(createDeposit).toHaveBeenCalledWith(expect.objectContaining({ grossAmountCents: 12300 }));
    const updateData = qsUpdate.mock.calls.at(-1)![0] as { data: { totalAmount?: number } };
    expect(updateData.data.totalAmount).toBe(123);
  });

  it("idempotente: QR PENDING valido existente -> retorna sem recriar deposito", async () => {
    qsFindFirst.mockResolvedValue(
      quickSale({
        walletTransactionId: "wtx-existente",
        depixQrCode: "QR-EXISTENTE",
        depixExpiresAt: new Date(Date.now() + 10 * 60_000),
      }),
    );
    const r = await generatePublicPix({ token: TOKEN, taxId: CPF, amountCents: null, ownershipConfirmed: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.qrCode).toBe("QR-EXISTENTE");
    expect(createDeposit).not.toHaveBeenCalled();
  });
});
