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
  /** Descricao exibida ao cliente (pode ser vazio). */
  description: string;
  /** Link desligado pelo comerciante: a tela recusa o pagamento. */
  active: boolean;
}

/** Carrega o link publico por token (sem dados sensiveis do tenant). */
export async function getPublicCharge(token: string): Promise<PublicChargeView | null> {
  return withAdmin(async (tx) => {
    const link = await tx.paymentLink.findUnique({
      where: { token },
      select: { tenantId: true, description: true, active: true },
    });
    if (!link) return null;

    const tenant = await tx.tenant.findUnique({
      where: { id: link.tenantId },
      select: { name: true },
    });
    return {
      merchantName: tenant?.name ?? "Comerciante",
      description: link.description ?? "",
      active: link.active,
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
        active: true,
        description: true,
        createdById: true,
      },
    }),
  );
  if (!link) return { ok: false, error: "Link de pagamento não encontrado." };
  if (!link.active) {
    return { ok: false, error: "Este link de pagamento está desativado. Procure o comerciante." };
  }

  // 3) Valor: sempre do cliente (o link é fixo e não carrega valor). Quando o
  //    operador manda `?valor=`, a tela envia esse número já bloqueado.
  const amountCents = args.amountCents ?? 0;
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

  // 5) Idempotência: reusa um QR PENDENTE do MESMO pagador e MESMO valor.
  //
  //    O link agora é reutilizável, então não dá mais para amarrar "o depósito
  //    deste link" num campo único. A chave passa a ser (link, pagador, valor):
  //    é o que distingue "o cliente recarregou a página" de "outra pessoa está
  //    pagando agora". Sem isso, cada clique em Gerar QR criaria uma cobrança
  //    nova na Eulen para o mesmo pagamento.
  const existing = await withAdmin(async (tx) =>
    tx.tenantDepixTransaction.findFirst({
      where: {
        tenantId: link.tenantId,
        kind: "DEPOSIT",
        status: "PENDING",
        sourceType: "PAYMENT_LINK",
        sourceId: link.id,
        payerTaxId: taxDigits,
        grossAmountCents: amountCents,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
      select: { qrCode: true, qrCodeBase64: true, pixpayDepixId: true, expiresAt: true },
    }),
  );
  if (existing?.qrCode) {
    return {
      ok: true,
      qrCode: existing.qrCode,
      qrCodeBase64: existing.qrCodeBase64 ?? "",
      transactionId: existing.pixpayDepixId ?? "",
      amountCents,
      expiresAt: existing.expiresAt ? existing.expiresAt.toISOString() : null,
    };
  }

  // 6) Cria o deposito (mesmo caminho do balcao). `sourceId` continua apontando
  //    para o link — é o que dá o histórico de "quanto entrou por este link".
  const deposit = await createDeposit({
    tenantId: link.tenantId,
    userId: link.createdById,
    grossAmountCents: amountCents,
    sourceType: "PAYMENT_LINK",
    sourceId: link.id,
    sourceDescription: link.description ?? "Link de pagamento",
    payerTaxId: taxDigits,
  });

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

/**
 * Consulta o status de UM pagamento do link (reusa checkTransactionStatus).
 *
 * Recebe o `depixId` da cobrança, não só o token: o link é reutilizável e pode
 * ter vários pagamentos em curso ao mesmo tempo. Perguntar "este link foi pago?"
 * deixou de fazer sentido — a pergunta certa é "esta cobrança foi paga?".
 *
 * O `depixId` vem do QR que o próprio cliente acabou de gerar, e a busca é
 * restrita ao tenant do token: ninguém consulta o pagamento de outro comerciante
 * conhecendo só um identificador.
 */
export async function getPublicPixStatus(
  token: string,
  depixId: string,
): Promise<PublicPixStatus> {
  const link = await withAdmin(async (tx) =>
    tx.paymentLink.findUnique({
      where: { token },
      select: { id: true, tenantId: true },
    }),
  );
  if (!link) return "failed";

  const deposit = await withAdmin(async (tx) =>
    tx.tenantDepixTransaction.findFirst({
      where: {
        tenantId: link.tenantId,
        sourceType: "PAYMENT_LINK",
        sourceId: link.id,
        pixpayDepixId: depixId,
      },
      select: { id: true },
    }),
  );
  if (!deposit) return "pending";

  const tx = await checkTransactionStatus(link.tenantId, deposit.id);
  if (!tx) return "pending";
  // PIX recebido (pixApprovedAt) ou concluido -> pago.
  if (tx.status === "COMPLETED" || tx.status === "COMPLETED_FEE_PENDING" || tx.pixApprovedAt != null) {
    return "paid";
  }
  if (tx.status === "EXPIRED") return "expired";
  if (tx.status === "FAILED" || tx.status === "CANCELLED") return "failed";
  return "pending";
}
