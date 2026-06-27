/**
 * Pagamento PUBLICO via PaymentLink (cliente paga o QR por /pay/<token> sem
 * login). O link nasce no DePix Wallet — sem conceito de "venda".
 *
 * O cliente adquire tokens DePix que vao para a carteira do comerciante — e o
 * fluxo de deposito DePix iniciado pelo pagador. Toda regra/limite do deposito e
 * REVALIDADA aqui no servidor (cliente nunca e fonte de verdade): CPF/CNPJ
 * obrigatorio + valido, confirmacao de titularidade, limites min/max e por
 * documento, link ACTIVE. Reusa `createDeposit` e `checkTransactionStatus`.
 */
import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";
import { isValidTaxId } from "@/lib/utils/tax-id";
import { DEPIX_LIMITS } from "@/lib/services/depix-transaction-fee";
import { validateDepixLimit } from "@/lib/services/depix-limit-service";
import { createDeposit, checkTransactionStatus } from "@/server/services/depix-transaction.service";

export interface PublicChargeView {
  merchantName: string;
  /** Descricao do que se refere o pagamento (pode ser vazio). */
  description: string;
  /** Centavos. `null` quando o cliente define o valor (amountOpen). */
  amountCents: number | null;
  amountOpen: boolean;
  status: "ACTIVE" | "PAID" | "CANCELLED" | "EXPIRED";
  alreadyPaid: boolean;
}

/** Carrega a cobranca publica por token (sem dados sensiveis do tenant). */
export async function getPublicCharge(token: string): Promise<PublicChargeView | null> {
  return withAdmin(async (tx) => {
    const link = await tx.paymentLink.findUnique({
      where: { token },
      select: { tenantId: true, status: true, description: true, amountCents: true },
    });
    if (!link) return null;
    const tenant = await tx.tenant.findUnique({
      where: { id: link.tenantId },
      select: { name: true },
    });
    return {
      merchantName: tenant?.name ?? "Comerciante",
      description: link.description ?? "",
      amountCents: link.amountCents,
      amountOpen: link.amountCents == null,
      status: link.status,
      alreadyPaid: link.status === "PAID",
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
 * Gera o QR de pagamento publico. Revalida tudo no servidor. Idempotente: se o
 * link ja tem um deposito PENDING valido, retorna o QR existente (nao recria).
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

  const link = await withAdmin(async (tx) =>
    tx.paymentLink.findUnique({
      where: { token: args.token },
      select: {
        id: true,
        tenantId: true,
        status: true,
        amountCents: true,
        description: true,
        walletTransactionId: true,
        createdById: true,
      },
    }),
  );
  if (!link) return { ok: false, error: "Cobrança não encontrada." };
  if (link.status !== "ACTIVE") {
    return { ok: false, error: "Esta cobrança não está mais disponível para pagamento." };
  }

  // 3) Valor: livre -> usa o do cliente; fixo -> usa o do link. Limites sempre.
  const amountOpen = link.amountCents == null;
  const amountCents = amountOpen ? (args.amountCents ?? 0) : link.amountCents!;
  if (!Number.isInteger(amountCents) || amountCents < DEPIX_LIMITS.MIN_CENTS) {
    return { ok: false, error: `Valor mínimo de R$ ${(DEPIX_LIMITS.MIN_CENTS / 100).toFixed(2)}.` };
  }
  if (amountCents > DEPIX_LIMITS.MAX_CENTS) {
    return { ok: false, error: `Valor máximo de R$ ${(DEPIX_LIMITS.MAX_CENTS / 100).toFixed(2)}.` };
  }

  // 4) Limite por documento (R$ 5.000/tx + acumulado).
  const amountReais = amountCents / 100;
  const limit = await withAdmin(async (tx) => validateDepixLimit(tx, link.tenantId, taxDigits, amountReais));
  if (!limit.allowed) {
    return { ok: false, error: limit.reason ?? "Limite DePix excedido." };
  }

  // 5) Idempotencia: ja existe um deposito PENDING valido vinculado? Reusa o QR.
  if (link.walletTransactionId) {
    const existing = await withAdmin(async (tx) =>
      tx.tenantDepixTransaction.findUnique({
        where: { id: link.walletTransactionId! },
        select: { status: true, qrCode: true, qrCodeBase64: true, pixpayDepixId: true, expiresAt: true },
      }),
    );
    const notExpired = !existing?.expiresAt || existing.expiresAt > new Date();
    if (existing?.qrCode && existing.status === "PENDING" && notExpired) {
      return {
        ok: true,
        qrCode: existing.qrCode,
        qrCodeBase64: existing.qrCodeBase64 ?? "",
        transactionId: existing.pixpayDepixId ?? "",
        amountCents,
        expiresAt: existing.expiresAt ? existing.expiresAt.toISOString() : null,
      };
    }
  }

  // 6) Cria o deposito (mesmo caminho do balcao). A descricao do link vira a
  // descricao do recebimento. sourceType PAYMENT_LINK liga o status na confirmacao.
  const deposit = await createDeposit({
    tenantId: link.tenantId,
    userId: link.createdById,
    grossAmountCents: amountCents,
    sourceType: "PAYMENT_LINK",
    sourceId: link.id,
    sourceDescription: link.description ?? "Link de pagamento",
    payerTaxId: taxDigits,
  });

  // 7) Vincula o deposito ao link.
  await withAdmin(async (tx) =>
    tx.paymentLink.update({
      where: { id: link.id },
      data: { walletTransactionId: deposit.id },
    }),
  );

  logger.info("Pagamento publico: QR gerado", {
    paymentLinkId: link.id,
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
  const link = await withAdmin(async (tx) =>
    tx.paymentLink.findUnique({
      where: { token },
      select: { tenantId: true, status: true, walletTransactionId: true },
    }),
  );
  if (!link) return "failed";
  if (link.status === "PAID") return "paid";
  if (link.status === "EXPIRED") return "expired";
  if (link.status === "CANCELLED") return "failed";
  if (!link.walletTransactionId) return "pending";

  const tx = await checkTransactionStatus(link.tenantId, link.walletTransactionId);
  if (!tx) return "pending";
  // PIX recebido (pixApprovedAt) ou concluido -> pago.
  if (tx.status === "COMPLETED" || tx.status === "COMPLETED_FEE_PENDING" || tx.pixApprovedAt != null) {
    return "paid";
  }
  if (tx.status === "EXPIRED") return "expired";
  if (tx.status === "FAILED" || tx.status === "CANCELLED") return "failed";
  return "pending";
}
