import { TRPCError } from "@trpc/server";
import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";
import { createDeposit } from "@/server/services/depix-transaction.service";
import { nextPeriodEnd } from "@/lib/billing/subscription";
import { CENTRAL_TENANT_SLUG } from "@/server/api/trpc";

/**
 * Cobrança da ASSINATURA via DePix (ADR 0058). O tenant paga a plataforma: o QR
 * cai no tenant CENTRAL (arena-tech = o DEPIX_ADDRESS da Arena). Reusa 100% da
 * máquina de depósito/webhook — só marca `sourceType = SUBSCRIPTION`. A renovação
 * acontece no webhook (applyPixReceivedEffects), idempotente.
 */

/** Resolve o id do tenant CENTRAL (arena-tech), que recebe as cobranças. */
async function resolveCentralTenantId(): Promise<string> {
  const central = await withAdmin((tx) =>
    tx.tenant.findFirst({ where: { slug: CENTRAL_TENANT_SLUG }, select: { id: true } }),
  );
  if (!central) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Tenant central (arena-tech) não encontrado — cobrança indisponível.",
    });
  }
  return central.id;
}

export type SubscriptionChargeResult = {
  transactionId: string; // TenantDepixTransaction.id
  qrCode: string;
  qrCodeBase64: string;
  amountCents: number;
  expiresAt: string | null;
};

/**
 * Gera (ou reaproveita) um QR de cobrança da assinatura de `subscriptionId`.
 *
 * - O QR é criado no tenant CENTRAL com `sourceType=SUBSCRIPTION`, `sourceId=subscriptionId`.
 * - Reaproveita um QR PENDING não expirado da mesma assinatura (evita QR duplicado
 *   quando o tenant clica "Pagar" de novo dentro dos 30 min).
 * - `payerTaxId` é obrigatório (a Eulen exige CPF/CNPJ do pagador em todo QR).
 */
export async function createSubscriptionCharge(args: {
  subscriptionId: string;
  /** Usuário (admin do tenant) que iniciou o pagamento — para auditoria do depósito. */
  userId: string;
  userName?: string | null;
  /** CPF/CNPJ do pagador (obrigatório pela Eulen). */
  payerTaxId: string;
}): Promise<SubscriptionChargeResult> {
  const centralTenantId = await resolveCentralTenantId();

  const subscription = await withAdmin((tx) =>
    tx.subscription.findUnique({
      where: { id: args.subscriptionId },
      select: { id: true, tenantId: true, status: true, amountCents: true },
    }),
  );
  if (!subscription) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Assinatura não encontrada" });
  }
  if (subscription.status === "CANCELLED") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Assinatura cancelada — reative pelo plano." });
  }
  if (subscription.amountCents <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Assinatura sem valor a cobrar." });
  }

  // Reaproveita um QR PENDING não expirado desta assinatura (anti-duplicidade).
  const reusable = await withAdmin((tx) =>
    tx.tenantDepixTransaction.findFirst({
      where: {
        tenantId: centralTenantId,
        kind: "DEPOSIT",
        sourceType: "SUBSCRIPTION",
        sourceId: subscription.id,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, qrCode: true, qrCodeBase64: true, expiresAt: true, grossAmountCents: true },
    }),
  );
  if (reusable?.qrCode) {
    return {
      transactionId: reusable.id,
      qrCode: reusable.qrCode,
      qrCodeBase64: reusable.qrCodeBase64 ?? "",
      amountCents: reusable.grossAmountCents,
      expiresAt: reusable.expiresAt ? reusable.expiresAt.toISOString() : null,
    };
  }

  // Cria o depósito no tenant CENTRAL. Sem override de endereço → o createDeposit
  // gera o endereço LWK do central (que é a conta da plataforma) e o central é
  // isento de taxa (split 0). O valor é o snapshot congelado da assinatura.
  const deposit = await createDeposit({
    tenantId: centralTenantId,
    userId: args.userId,
    userName: args.userName ?? null,
    grossAmountCents: subscription.amountCents,
    sourceType: "SUBSCRIPTION",
    sourceId: subscription.id,
    sourceDescription: `Assinatura ${subscription.tenantId}`,
    payerTaxId: args.payerTaxId,
  });

  if (!deposit.qrCode) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao gerar QR de cobrança." });
  }

  logger.info("Cobrança de assinatura: QR gerado", {
    subscriptionId: subscription.id,
    tenantId: subscription.tenantId,
    depositId: deposit.id,
    amountCents: subscription.amountCents,
  });

  return {
    transactionId: deposit.id,
    qrCode: deposit.qrCode,
    qrCodeBase64: deposit.qrCodeBase64 ?? "",
    amountCents: subscription.amountCents,
    expiresAt: deposit.expiresAt ? deposit.expiresAt.toISOString() : null,
  };
}

/**
 * Renova a assinatura a partir de um depósito de cobrança CONFIRMADO.
 * Chamado pelo efeito de PIX recebido (webhook). IDEMPOTENTE: o período só avança
 * UMA vez por depósito — guarda por `subscriptionAppliedAt` via CAS (updateMany
 * onde `subscription_applied_at IS NULL`). Um webhook duplicado não credita 2×.
 *
 * `depositRow` já vem do webhook (tenant central). Retorna se aplicou.
 */
export async function renewSubscriptionFromPayment(depositRow: {
  id: string;
  tenantId: string;
  sourceType: string;
  sourceId: string | null;
}): Promise<{ applied: boolean }> {
  if (depositRow.sourceType !== "SUBSCRIPTION" || !depositRow.sourceId) {
    return { applied: false };
  }
  const subscriptionId = depositRow.sourceId;

  return withAdmin(async (tx) => {
    // CAS de idempotência: só o PRIMEIRO webhook marca o depósito como aplicado.
    const claim = await tx.tenantDepixTransaction.updateMany({
      where: { id: depositRow.id, subscriptionAppliedAt: null },
      data: { subscriptionAppliedAt: new Date() },
    });
    if (claim.count !== 1) {
      // Outro webhook já aplicou — não renova de novo.
      return { applied: false };
    }

    const subscription = await tx.subscription.findUnique({
      where: { id: subscriptionId },
      select: { id: true, tenantId: true, status: true, billingCycle: true, currentPeriodEnd: true },
    });
    if (!subscription) {
      logger.warn("Renovação de assinatura: assinatura sumiu", { subscriptionId, depositId: depositRow.id });
      return { applied: false };
    }
    if (subscription.status === "CANCELLED") {
      // Pagou uma assinatura cancelada — não reativa automaticamente (decisão de
      // negócio: religar exige ação do superadmin). Registra e segue.
      logger.warn("Renovação de assinatura: pagamento de assinatura CANCELADA", {
        subscriptionId,
        depositId: depositRow.id,
      });
      return { applied: false };
    }

    const periodEnd = nextPeriodEnd({
      cycle: subscription.billingCycle,
      currentPeriodEnd: subscription.currentPeriodEnd,
      now: new Date(),
    });

    await tx.subscription.update({
      where: { id: subscriptionId },
      data: { status: "ACTIVE", currentPeriodEnd: periodEnd },
    });
    // Reativa o acesso do tenant (o cron #529 pode tê-lo suspendido por vencimento).
    await tx.tenant.update({
      where: { id: subscription.tenantId },
      data: { status: "ACTIVE" },
    });

    logger.info("Assinatura renovada por pagamento DePix", {
      subscriptionId,
      tenantId: subscription.tenantId,
      depositId: depositRow.id,
      currentPeriodEnd: periodEnd.toISOString(),
    });

    return { applied: true };
  });
}
