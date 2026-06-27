/**
 * generatePublicPix (pagamento publico via PaymentLink): revalida TODAS as
 * regras no servidor — checkbox de titularidade, CPF obrigatorio+valido, limites
 * min/max e por documento, link ACTIVE. Idempotencia (nao recria deposito).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const linkFindUnique = vi.fn();
const linkUpdate = vi.fn();
const linkUpdateMany = vi.fn();
const txFindUnique = vi.fn();
const validateDepixLimit = vi.fn();
const createDeposit = vi.fn();

const tx = {
  paymentLink: { findUnique: linkFindUnique, update: linkUpdate, updateMany: linkUpdateMany },
  tenantDepixTransaction: { findUnique: txFindUnique },
};

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

const CPF = "52998224725"; // valido no isValidTaxId real
const TOKEN = "tok_public_123456";

function paymentLink(over: Record<string, unknown> = {}) {
  return {
    id: "pl-1",
    tenantId: "tenant-1",
    status: "ACTIVE",
    amountCents: 5000, // R$50 fixo (null = livre)
    description: "Mensalidade",
    expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000), // valido (6h restantes)
    walletTransactionId: null,
    createdById: "user-1",
    ...over,
  };
}

beforeEach(() => {
  for (const m of [linkFindUnique, linkUpdate, linkUpdateMany, txFindUnique, validateDepixLimit, createDeposit]) m.mockReset();
  linkUpdateMany.mockResolvedValue({ count: 1 });
  linkFindUnique.mockResolvedValue(paymentLink());
  linkUpdate.mockResolvedValue({});
  validateDepixLimit.mockResolvedValue({ allowed: true });
  createDeposit.mockResolvedValue({
    id: "wtx-1",
    pixpayDepixId: "qr-eulen-1",
    qrCode: "000201...",
    qrCodeBase64: "iVBOR...",
    expiresAt: new Date("2026-06-27T03:00:00Z"),
  });
});

describe("generatePublicPix (PaymentLink)", () => {
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

  it("rejeita link que nao esta ACTIVE", async () => {
    linkFindUnique.mockResolvedValue(paymentLink({ status: "PAID" }));
    const r = await generatePublicPix({ token: TOKEN, taxId: CPF, amountCents: null, ownershipConfirmed: true });
    expect(r.ok).toBe(false);
    expect(createDeposit).not.toHaveBeenCalled();
  });

  it("rejeita link vencido (expiresAt no passado) e o marca EXPIRED", async () => {
    linkFindUnique.mockResolvedValue(paymentLink({ expiresAt: new Date(Date.now() - 60_000) }));
    const r = await generatePublicPix({ token: TOKEN, taxId: CPF, amountCents: null, ownershipConfirmed: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("expirou");
    expect(createDeposit).not.toHaveBeenCalled();
    // Marcou EXPIRED (updateMany guardado por status ACTIVE).
    const data = linkUpdateMany.mock.calls.at(-1)![0] as { data: { status: string } };
    expect(data.data.status).toBe("EXPIRED");
  });

  it("valor livre abaixo do minimo -> rejeita", async () => {
    linkFindUnique.mockResolvedValue(paymentLink({ amountCents: null }));
    const r = await generatePublicPix({ token: TOKEN, taxId: CPF, amountCents: 500, ownershipConfirmed: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("mínimo");
  });

  it("valor livre acima do maximo -> rejeita", async () => {
    linkFindUnique.mockResolvedValue(paymentLink({ amountCents: null }));
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

  it("caminho feliz (valor fixo): cria deposito com CPF + descricao do link", async () => {
    const r = await generatePublicPix({ token: TOKEN, taxId: CPF, amountCents: null, ownershipConfirmed: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.qrCode).toBe("000201...");
      expect(r.amountCents).toBe(5000);
    }
    expect(createDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        sourceType: "PAYMENT_LINK",
        sourceId: "pl-1",
        payerTaxId: CPF,
        grossAmountCents: 5000,
        sourceDescription: "Mensalidade",
      }),
    );
    // Vincula o deposito ao link.
    expect(linkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { walletTransactionId: "wtx-1" } }),
    );
  });

  it("valor livre: usa o valor do cliente", async () => {
    linkFindUnique.mockResolvedValue(paymentLink({ amountCents: null }));
    const r = await generatePublicPix({ token: TOKEN, taxId: CPF, amountCents: 12300, ownershipConfirmed: true });
    expect(r.ok).toBe(true);
    expect(createDeposit).toHaveBeenCalledWith(expect.objectContaining({ grossAmountCents: 12300 }));
  });

  it("idempotente: deposito PENDING valido existente -> retorna sem recriar", async () => {
    linkFindUnique.mockResolvedValue(paymentLink({ walletTransactionId: "wtx-existente" }));
    txFindUnique.mockResolvedValue({
      status: "PENDING",
      qrCode: "QR-EXISTENTE",
      qrCodeBase64: "b64",
      pixpayDepixId: "qr-x",
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    const r = await generatePublicPix({ token: TOKEN, taxId: CPF, amountCents: null, ownershipConfirmed: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.qrCode).toBe("QR-EXISTENTE");
    expect(createDeposit).not.toHaveBeenCalled();
  });
});
