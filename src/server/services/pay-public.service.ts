/**
 * Pagamento PUBLICO de QuickSale (cliente paga o QR por /pay/<token> sem login).
 *
 * O cliente adquire tokens DePix que vao para a carteira do comerciante — e o
 * fluxo de deposito DePix iniciado pelo pagador. Toda regra/limite do deposito e
 * REVALIDADA aqui no servidor (cliente nunca e fonte de verdade): CPF/CNPJ
 * obrigatorio + valido, confirmacao de titularidade, limites min/max e por
 * documento, status AWAITING_PAYMENT. Reusa `createDeposit` e
 * `checkTransactionStatus`.
 */
import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";
import { isValidTaxId } from "@/lib/utils/tax-id";
import { DEPIX_LIMITS } from "@/lib/services/depix-transaction-fee";
import { validateDepixLimit } from "@/lib/services/depix-limit-service";
import { createDeposit, checkTransactionStatus } from "@/server/services/depix-transaction.service";

export interface PublicChargeView {
  merchantName: string;
  productDescription: string;
  /** Centavos. `null` quando o cliente define o valor (amountOpen). */
  amountCents: number | null;
  amountOpen: boolean;
  status: "AWAITING_PAYMENT" | "PAID" | "CANCELLED" | "REFUNDED" | "EXPIRED";
  alreadyPaid: boolean;
}

/** Carrega a cobranca publica por token (sem dados sensiveis do tenant). */
export async function getPublicCharge(token: string): Promise<PublicChargeView | null> {
  return withAdmin(async (tx) => {
    const qs = await tx.quickSale.findFirst({
      where: { publicToken: token, deletedAt: null },
      select: {
        tenantId: true,
        status: true,
        productDescription: true,
        totalAmount: true,
        publicAmountOpen: true,
      },
    });
    if (!qs) return null;
    const tenant = await tx.tenant.findUnique({
      where: { id: qs.tenantId },
      select: { name: true },
    });
    const amountCents = Math.round(Number(qs.totalAmount) * 100);
    return {
      merchantName: tenant?.name ?? "Comerciante",
      productDescription: qs.productDescription,
      amountCents: qs.publicAmountOpen ? null : amountCents,
      amountOpen: qs.publicAmountOpen,
      status: qs.status,
      alreadyPaid: qs.status === "PAID",
    };
  });
}

export type GeneratePublicPixResult =
  | {
      ok: true;
      qrCode: string;
      qrCodeBase64: string;
      transactionId: string;
      amountCents: number;
      expiresAt: string | null;
    }
  | { ok: false; error: string };

/**
 * Gera o QR de pagamento publico. Revalida tudo no servidor. Idempotente: se a
 * venda ja tem um QR PENDING valido, retorna o existente (nao recria deposito).
 */
export async function generatePublicPix(args: {
  token: string;
  taxId: string;
  amountCents: number | null;
  ownershipConfirmed: boolean;
}): Promise<GeneratePublicPixResult> {
  const taxDigits = (args.taxId ?? "").replace(/\D/g, "");

  // 1) Titularidade (checkbox) — defesa server-side do requisito.
  if (args.ownershipConfirmed !== true) {
    return { ok: false, error: "Confirme que o CPF/CNPJ informado é o titular da conta de pagamento." };
  }
  // 2) CPF/CNPJ obrigatorio + valido (sempre, neste fluxo publico).
  if (!taxDigits || !isValidTaxId(taxDigits)) {
    return { ok: false, error: "Informe um CPF ou CNPJ válido." };
  }

  const qs = await withAdmin(async (tx) =>
    tx.quickSale.findFirst({
      where: { publicToken: args.token, deletedAt: null },
      select: {
        id: true,
        tenantId: true,
        number: true,
        status: true,
        totalAmount: true,
        publicAmountOpen: true,
        cpfCnpj: true,
        walletTransactionId: true,
        depixQrCode: true,
        depixQrCodeBase64: true,
        depixTransactionId: true,
        depixExpiresAt: true,
        createdById: true,
      },
    }),
  );
  if (!qs) return { ok: false, error: "Cobrança não encontrada." };
  if (qs.status !== "AWAITING_PAYMENT") {
    return { ok: false, error: "Esta cobrança não está mais disponível para pagamento." };
  }

  // 3) Valor: aberto -> usa o do cliente; fixo -> usa o da venda. Limites sempre.
  const fixedCents = Math.round(Number(qs.totalAmount) * 100);
  const amountCents = qs.publicAmountOpen ? (args.amountCents ?? 0) : fixedCents;
  if (!Number.isInteger(amountCents) || amountCents < DEPIX_LIMITS.MIN_CENTS) {
    return { ok: false, error: `Valor mínimo de R$ ${(DEPIX_LIMITS.MIN_CENTS / 100).toFixed(2)}.` };
  }
  if (amountCents > DEPIX_LIMITS.MAX_CENTS) {
    return { ok: false, error: `Valor máximo de R$ ${(DEPIX_LIMITS.MAX_CENTS / 100).toFixed(2)}.` };
  }

  // 4) Limite por documento (R$ 5.000/tx + acumulado).
  const amountReais = amountCents / 100;
  const limit = await withAdmin(async (tx) => validateDepixLimit(tx, qs.tenantId, taxDigits, amountReais));
  if (!limit.allowed) {
    return { ok: false, error: limit.reason ?? "Limite DePix excedido." };
  }

  // 5) Idempotencia: ja existe QR PENDING valido (nao expirado)? Reusa.
  const notExpired = !qs.depixExpiresAt || qs.depixExpiresAt > new Date();
  if (qs.walletTransactionId && qs.depixQrCode && notExpired) {
    return {
      ok: true,
      qrCode: qs.depixQrCode,
      qrCodeBase64: qs.depixQrCodeBase64 ?? "",
      transactionId: qs.depixTransactionId ?? "",
      amountCents,
      expiresAt: qs.depixExpiresAt ? qs.depixExpiresAt.toISOString() : null,
    };
  }

  // 6) Cria o deposito (mesmo caminho do balcao). userId = quem criou a venda.
  const deposit = await createDeposit({
    tenantId: qs.tenantId,
    userId: qs.createdById,
    grossAmountCents: amountCents,
    sourceType: "QUICK_SALE",
    sourceId: qs.id,
    sourceDescription: `Pagamento público ${qs.number}`,
    payerTaxId: taxDigits,
  });

  // 7) Persiste vinculo + QR + valor (se aberto) + CPF na venda.
  await withAdmin(async (tx) =>
    tx.quickSale.update({
      where: { id: qs.id },
      data: {
        walletTransactionId: deposit.id,
        depixTransactionId: deposit.pixpayDepixId ?? null,
        depixStatus: "pending",
        depixQrCode: deposit.qrCode ?? null,
        depixQrCodeBase64: deposit.qrCodeBase64 ?? null,
        cpfCnpj: taxDigits,
        ...(qs.publicAmountOpen ? { totalAmount: amountReais, unitPrice: amountReais } : {}),
      },
    }),
  );

  logger.info("Pagamento publico: QR gerado", {
    quickSaleId: qs.id,
    walletTransactionId: deposit.id,
    amountCents,
  });

  return {
    ok: true,
    qrCode: deposit.qrCode ?? "",
    qrCodeBase64: deposit.qrCodeBase64 ?? "",
    transactionId: deposit.pixpayDepixId ?? "",
    amountCents,
    expiresAt: deposit.expiresAt ? deposit.expiresAt.toISOString() : null,
  };
}

export type PublicPixStatus = "pending" | "paid" | "expired" | "failed";

/** Consulta o status do pagamento publico (reusa checkTransactionStatus). */
export async function getPublicPixStatus(token: string): Promise<PublicPixStatus> {
  const qs = await withAdmin(async (tx) =>
    tx.quickSale.findFirst({
      where: { publicToken: token, deletedAt: null },
      select: { tenantId: true, status: true, walletTransactionId: true },
    }),
  );
  if (!qs) return "failed";
  if (qs.status === "PAID") return "paid";
  if (qs.status === "EXPIRED") return "expired";
  if (qs.status === "CANCELLED" || qs.status === "REFUNDED") return "failed";
  if (!qs.walletTransactionId) return "pending";

  const tx = await checkTransactionStatus(qs.tenantId, qs.walletTransactionId);
  if (!tx) return "pending";
  // PIX recebido (pixApprovedAt) ou concluido -> pago (libera a venda).
  if (tx.status === "COMPLETED" || tx.status === "COMPLETED_FEE_PENDING" || tx.pixApprovedAt != null) {
    return "paid";
  }
  if (tx.status === "EXPIRED") return "expired";
  if (tx.status === "FAILED" || tx.status === "CANCELLED") return "failed";
  return "pending";
}
