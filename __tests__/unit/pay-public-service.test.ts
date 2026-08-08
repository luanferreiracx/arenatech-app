/**
 * generatePublicPix (pagamento publico via PaymentLink).
 *
 * O link virou FIXO e reutilizável (2026-08-08): não tem mais valor gravado,
 * status nem expiração. O que o servidor continua revalidando, sempre — porque o
 * cliente nunca é fonte de verdade — é titularidade, CPF/CNPJ, limites min/max e
 * limite por documento.
 *
 * A idempotência mudou de chave: antes era o `walletTransactionId` do link
 * ("1 link = 1 pagamento"); agora é (link, pagador, valor). É o que distingue
 * "o cliente recarregou a página" de "outra pessoa está pagando este link
 * agora" — sem isso, cada clique criaria uma cobrança nova na Eulen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const linkFindUnique = vi.fn();
const txFindFirst = vi.fn();
const validateDepixLimit = vi.fn();
const createDeposit = vi.fn();

const tx = {
  paymentLink: { findUnique: linkFindUnique },
  tenantDepixTransaction: { findFirst: txFindFirst },
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
    active: true,
    description: "Loja do Zé",
    createdById: "user-1",
    ...over,
  };
}

function args(over: Record<string, unknown> = {}) {
  return {
    token: TOKEN,
    taxId: CPF,
    amountCents: 5000,
    ownershipConfirmed: true,
    ...over,
  };
}

beforeEach(() => {
  for (const m of [linkFindUnique, txFindFirst, validateDepixLimit, createDeposit]) m.mockReset();
  linkFindUnique.mockResolvedValue(paymentLink());
  txFindFirst.mockResolvedValue(null);
  validateDepixLimit.mockResolvedValue({ allowed: true });
  createDeposit.mockResolvedValue({
    id: "wtx-1",
    pixpayDepixId: "qr-eulen-1",
    qrCode: "000201...",
    qrCodeBase64: "https://resources.eulen.app/qr/pix/abc",
    expiresAt: new Date("2026-08-08T03:00:00Z"),
  });
});

describe("generatePublicPix (PaymentLink fixo)", () => {
  it("rejeita sem confirmar titularidade (checkbox)", async () => {
    const r = await generatePublicPix(args({ ownershipConfirmed: false }));
    expect(r.ok).toBe(false);
    expect(createDeposit).not.toHaveBeenCalled();
  });

  it("rejeita CPF/CNPJ invalido", async () => {
    const r = await generatePublicPix(args({ taxId: "11111111111" }));
    expect(r.ok).toBe(false);
    expect(createDeposit).not.toHaveBeenCalled();
  });

  it("link desligado pelo comerciante NAO recebe", async () => {
    linkFindUnique.mockResolvedValue(paymentLink({ active: false }));
    const r = await generatePublicPix(args());
    expect(r.ok).toBe(false);
    expect(createDeposit).not.toHaveBeenCalled();
  });

  it("token inexistente nao gera cobranca", async () => {
    linkFindUnique.mockResolvedValue(null);
    const r = await generatePublicPix(args());
    expect(r.ok).toBe(false);
    expect(createDeposit).not.toHaveBeenCalled();
  });

  it("valor abaixo do minimo -> rejeita", async () => {
    const r = await generatePublicPix(args({ amountCents: 500 }));
    expect(r.ok).toBe(false);
    expect(createDeposit).not.toHaveBeenCalled();
  });

  it("valor acima do maximo -> rejeita", async () => {
    const r = await generatePublicPix(args({ amountCents: 99_999_99 }));
    expect(r.ok).toBe(false);
    expect(createDeposit).not.toHaveBeenCalled();
  });

  it("respeita o limite por documento", async () => {
    validateDepixLimit.mockResolvedValue({ allowed: false, reason: "Limite excedido" });
    const r = await generatePublicPix(args());
    expect(r).toMatchObject({ ok: false, error: "Limite excedido" });
    expect(createDeposit).not.toHaveBeenCalled();
  });

  it("caminho feliz: cria deposito com o valor do cliente e o CPF informado", async () => {
    const r = await generatePublicPix(args({ amountCents: 15000 }));
    expect(r).toMatchObject({ ok: true, amountCents: 15000 });
    expect(createDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        grossAmountCents: 15000,
        sourceType: "PAYMENT_LINK",
        sourceId: "pl-1",
        payerTaxId: CPF,
      }),
    );
  });

  it("idempotente: mesmo pagador e mesmo valor reusam o QR pendente", async () => {
    txFindFirst.mockResolvedValue({
      qrCode: "000201-existente",
      qrCodeBase64: "https://resources.eulen.app/qr/pix/ja-existe",
      pixpayDepixId: "qr-eulen-existente",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const r = await generatePublicPix(args());
    expect(r).toMatchObject({ ok: true, qrCode: "000201-existente" });
    // O ponto do teste: NAO criou cobranca nova na Eulen.
    expect(createDeposit).not.toHaveBeenCalled();
  });

  it("link reutilizavel: OUTRO pagador no mesmo link gera cobranca propria", async () => {
    // A busca de idempotência é por (link, pagador, valor) — como não há
    // pendente para este pagador, tem de criar. Sem isso, o segundo cliente
    // receberia o QR do primeiro e pagaria a cobrança errada.
    txFindFirst.mockResolvedValue(null);
    const r = await generatePublicPix(args({ taxId: "11144477735" }));
    expect(r.ok).toBe(true);
    expect(createDeposit).toHaveBeenCalledTimes(1);
    expect(txFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ payerTaxId: "11144477735", sourceId: "pl-1" }),
      }),
    );
  });
});
