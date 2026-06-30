/**
 * API de parceiros — escrita DePix (ADR 0057, Fase 3): criar depósito e sacar.
 * Reusa os services internos (`createDeposit`/`createWithdraw`/`createOnchainWithdraw`),
 * SEM 2FA (parceiro é máquina). Mantém os guards de negócio (CPF≥R$500, cap diário,
 * advisory lock, cross-check). Adiciona um CAP PRÓPRIO da API por tenant.
 *
 * Atribuição: sem usuário humano, a ação é registrada num membro do tenant
 * (mesmo padrão do depósito externo/QR estático). O `keyPrefix` vai no log.
 */
import { TRPCError } from "@trpc/server";
import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";
import {
  createDeposit,
  createWithdraw,
  createOnchainWithdraw,
} from "@/server/services/depix-transaction.service";
import type { PartnerDepositInput, PartnerWithdrawInput } from "@/lib/partner-api/write-schemas";
import type { PartnerDepositResult, PartnerWithdrawResult } from "@/lib/partner-api/openapi-schemas";

export type { PartnerDepositResult, PartnerWithdrawResult };

/** Cap diário ESPECÍFICO da API de parceiros (defesa extra; soma à do painel). */
const PARTNER_DAILY_WITHDRAW_CAP_CENTS = Number(
  process.env.PARTNER_DEPIX_WITHDRAW_DAILY_CAP_CENTS ?? "1000000", // R$ 10.000/24h default
);

async function resolveTenantUserId(tenantId: string): Promise<string> {
  const member = await withAdmin((tx) =>
    tx.userTenant.findFirst({ where: { tenantId }, select: { userId: true } }),
  );
  if (!member) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tenant sem usuário vinculado." });
  }
  return member.userId;
}

// ── Depósito ────────────────────────────────────────────────────────────────

export async function partnerCreateDeposit(args: {
  tenantId: string;
  keyPrefix: string;
  input: PartnerDepositInput;
  idempotencyKey?: string | null;
}): Promise<PartnerDepositResult> {
  const userId = await resolveTenantUserId(args.tenantId);
  logger.info("partner-api: deposito", {
    tenantId: args.tenantId,
    keyPrefix: args.keyPrefix,
    amountCents: args.input.amountCents,
  });
  const tx = await createDeposit({
    tenantId: args.tenantId,
    userId,
    userName: `API:${args.keyPrefix}`,
    grossAmountCents: args.input.amountCents,
    sourceType: "WALLET",
    sourceDescription: args.input.description ?? "Depósito via API de parceiro",
    payerTaxId: args.input.payerTaxId ?? null,
  });
  return {
    id: tx.id,
    number: tx.number,
    status: tx.status,
    amountCents: tx.grossAmountCents,
    qrCode: tx.qrCode ?? null,
    qrCodeBase64: tx.qrCodeBase64 ?? null,
  };
}

// ── Saque ────────────────────────────────────────────────────────────────────

/** Bloqueia saque via API em carteira non-custodial (exige passphrase do humano). */
async function assertCustodialForApiWithdraw(tenantId: string): Promise<void> {
  const wallet = await withAdmin((tx) =>
    tx.tenantDepixWallet.findUnique({ where: { tenantId }, select: { custodyModel: true } }),
  );
  if (wallet?.custodyModel === "non_custodial") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Saque via API indisponível para carteira non-custodial (exige a senha do titular). Use o painel.",
    });
  }
}

/** Cap diário próprio da API: soma os saques do tenant nas últimas 24h. */
async function assertApiDailyCap(tenantId: string, nextGrossCents: number): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60_000);
  const agg = await withAdmin((tx) =>
    tx.tenantDepixTransaction.aggregate({
      where: {
        tenantId,
        kind: "WITHDRAW",
        status: { notIn: ["FAILED", "CANCELLED", "EXPIRED"] },
        createdAt: { gte: since },
      },
      _sum: { grossAmountCents: true },
    }),
  );
  const used = agg._sum.grossAmountCents ?? 0;
  if (used + nextGrossCents > PARTNER_DAILY_WITHDRAW_CAP_CENTS) {
    const remaining = Math.max(0, PARTNER_DAILY_WITHDRAW_CAP_CENTS - used) / 100;
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cap diário de saque via API atingido. Restante hoje: R$ ${remaining.toFixed(2)}.`,
    });
  }
}

export async function partnerCreateWithdraw(args: {
  tenantId: string;
  keyPrefix: string;
  input: PartnerWithdrawInput;
  idempotencyKey?: string | null;
}): Promise<PartnerWithdrawResult> {
  await assertCustodialForApiWithdraw(args.tenantId);
  // Cap próprio da API (defesa extra; o cap do painel continua valendo no service).
  await assertApiDailyCap(args.tenantId, args.input.amountCents);
  const userId = await resolveTenantUserId(args.tenantId);

  logger.info("partner-api: saque", {
    tenantId: args.tenantId,
    keyPrefix: args.keyPrefix,
    method: args.input.method,
    amountCents: args.input.amountCents,
  });

  if (args.input.method === "onchain") {
    const tx = await createOnchainWithdraw({
      tenantId: args.tenantId,
      userId,
      userName: `API:${args.keyPrefix}`,
      toAddress: args.input.toAddress,
      amountCents: args.input.amountCents,
      idempotencyKey: args.idempotencyKey ?? undefined,
    });
    return {
      id: tx.id,
      number: tx.number,
      status: tx.status,
      method: "onchain",
      amountCents: tx.netAmountCents ?? args.input.amountCents,
      onchainTxId: tx.withdrawTxId ?? null,
    };
  }

  // PIX
  const tx = await createWithdraw({
    tenantId: args.tenantId,
    userId,
    userName: `API:${args.keyPrefix}`,
    pixKeyType: args.input.pixKeyType,
    pixKey: args.input.pixKey,
    recipientName: args.input.recipientName ?? null,
    recipientTaxId: args.input.recipientTaxId,
    netAmountCents: args.input.amountCents,
    idempotencyKey: args.idempotencyKey ?? undefined,
    sourceType: "WALLET",
    sourceDescription: `Saque via API de parceiro (${args.keyPrefix})`,
  });
  return {
    id: tx.id,
    number: tx.number,
    status: tx.status,
    method: "pix",
    amountCents: tx.netAmountCents ?? args.input.amountCents,
    onchainTxId: tx.withdrawTxId ?? null,
  };
}
