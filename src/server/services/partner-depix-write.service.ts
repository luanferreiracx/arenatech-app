/**
 * API de parceiros — escrita DePix (ADR 0057, Fase 3): criar depósito e sacar.
 * Reusa os services internos (`createDeposit`/`createWithdraw`), SEM 2FA (parceiro
 * é máquina). Saque é SÓ PIX (off-ramp Eulen); on-chain não é exposto na API (só no
 * painel). Mantém os guards de negócio (CPF, cap diário, advisory lock, cross-check).
 * Adiciona um CAP PRÓPRIO da API por tenant.
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
  createExternalWithdraw,
} from "@/server/services/depix-transaction.service";
import { requestWithdrawAuthorization } from "@/server/services/depix-withdraw-authorization.service";
import { resolveDailyCapCents } from "@/lib/depix/daily-cap";
import type { PartnerDepositInput, PartnerWithdrawInput } from "@/lib/partner-api/write-schemas";
import type { PartnerDepositResult, PartnerWithdrawResult } from "@/lib/partner-api/openapi-schemas";

export type { PartnerDepositResult, PartnerWithdrawResult };

/**
 * Cap diário ESPECÍFICO da API de parceiros (defesa extra; soma à do painel).
 *
 * FALLBACK: o superadmin pode definir um teto por tenant
 * (`Tenant.partnerApiWithdrawDailyCapCents`) — assim um parceiro de volume alto
 * sobe sozinho, sem subir o teto de todo mundo.
 *
 * Vale separado do teto do painel porque o caminho é outro: aqui quem saca é uma
 * MÁQUINA, sem 2FA. Este número é o limite de estrago se uma API-key vazar; e
 * para a carteira central (isenta do teto do painel) é o ÚNICO limite diário.
 */
export const PARTNER_DAILY_WITHDRAW_CAP_CENTS = Number(
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
  const byowAddress = args.input.depositAddress?.trim() || null;
  logger.info("partner-api: deposito", {
    tenantId: args.tenantId,
    keyPrefix: args.keyPrefix,
    amountCents: args.input.amountCents,
    byow: !!byowAddress,
  });
  // byowAddress: o createDeposit valida contra a allowlist do tenant
  // (assertAddressAllowed) — endereço não autorizado → 400. A API NUNCA cadastra
  // endereço; só pode usar um já aprovado por um humano no painel (2FA+email+WA).
  const tx = await createDeposit({
    tenantId: args.tenantId,
    userId,
    userName: `API:${args.keyPrefix}`,
    grossAmountCents: args.input.amountCents,
    sourceType: "WALLET",
    sourceDescription: args.input.description ?? "Depósito via API de parceiro",
    payerTaxId: args.input.payerTaxId ?? null,
    idempotencyKey: args.idempotencyKey ?? undefined,
    byowAddress,
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

/**
 * Modelo de custódia da carteira — decide POR ONDE o saque da API sai.
 *
 * Antes daqui saía um bloqueio: saque via API exigia carteira custodial. Só que
 * desde o ADR 0051 nenhum cliente é custodial (`setupWallet` só cria
 * `non_custodial` ou `external`), então o endpoint estava inalcançável por 100%
 * dos tenants reais — superfície morta, não lacuna.
 */
async function resolveCustodyModel(tenantId: string): Promise<string> {
  const wallet = await withAdmin((tx) =>
    tx.tenantDepixWallet.findUnique({
      where: { tenantId },
      select: { custodyModel: true, provisionedAt: true },
    }),
  );
  if (!wallet?.provisionedAt) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Carteira DePix ainda não configurada para este tenant.",
    });
  }
  return wallet.custodyModel;
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
  const tenantRow = await withAdmin((tx) =>
    tx.tenant.findUnique({
      where: { id: tenantId },
      select: { partnerApiWithdrawDailyCapCents: true },
    }),
  );
  const capCents = resolveDailyCapCents(
    tenantRow?.partnerApiWithdrawDailyCapCents,
    PARTNER_DAILY_WITHDRAW_CAP_CENTS,
  );
  if (used + nextGrossCents > capCents) {
    const remaining = Math.max(0, capCents - used) / 100;
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
  // Idempotency-Key OBRIGATÓRIA no saque. Saque é irreversível: sem ela, um
  // cliente HTTP com retry automático (axios-retry, timeout+retry) cria um SEGUNDO
  // saque quando a resposta se perde no caminho. Não é hipótese — foi assim que o
  // TXW20260727-00002 virou pagamento em dobro, com a diferença de que ali quem
  // retentou foi um humano; uma máquina retenta em milissegundos.
  //
  // Exigimos aqui, junto do dinheiro, e não só na borda REST: qualquer caller
  // futuro herda a proteção. O `@@unique([tenantId, idempotencyKey])` é o backstop.
  if (!args.idempotencyKey?.trim()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Header Idempotency-Key é obrigatório em saques (UUID por intenção). " +
        "Sem ele, uma reentrega da mesma requisição criaria um segundo saque.",
    });
  }

  const custodyModel = await resolveCustodyModel(args.tenantId);
  // Cap próprio da API (defesa extra; o cap do painel continua valendo no service).
  await assertApiDailyCap(args.tenantId, args.input.amountCents);
  const userId = await resolveTenantUserId(args.tenantId);

  logger.info("partner-api: saque", {
    tenantId: args.tenantId,
    keyPrefix: args.keyPrefix,
    method: "pix",
    custodyModel,
    amountCents: args.input.amountCents,
  });

  // NON-CUSTODIAL: o servidor não tem a chave. Vira um pedido na fila do humano,
  // que conclui no painel com a senha da carteira. Aceitar a passphrase aqui,
  // num header de API, desmontaria a garantia inteira do ADR 0051 — a Arena
  // passaria a poder gastar sozinha o dinheiro do cliente.
  if (custodyModel === "non_custodial") {
    const authorization = await requestWithdrawAuthorization({
      tenantId: args.tenantId,
      keyPrefix: args.keyPrefix,
      idempotencyKey: args.idempotencyKey,
      pixKeyType: args.input.pixKeyType,
      pixKey: args.input.pixKey,
      recipientName: args.input.recipientName ?? null,
      recipientTaxId: args.input.recipientTaxId,
      netAmountCents: args.input.amountCents,
    });
    return {
      id: authorization.id,
      number: null,
      status: "AWAITING_AUTHORIZATION",
      method: "pix",
      amountCents: authorization.netAmountCents,
      onchainTxId: null,
    };
  }

  // EXTERNAL: o tenant administra a própria carteira e envia o DePix da mão
  // dele. Não há chave nossa envolvida, então o caminho é o mesmo do painel.
  if (custodyModel === "external") {
    const tx = await createExternalWithdraw({
      tenantId: args.tenantId,
      userId,
      userName: `API:${args.keyPrefix}`,
      pixKeyType: args.input.pixKeyType,
      pixKey: args.input.pixKey,
      recipientName: args.input.recipientName ?? null,
      recipientTaxId: args.input.recipientTaxId,
      netAmountCents: args.input.amountCents,
      idempotencyKey: args.idempotencyKey ?? undefined,
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

  // CUSTODIAL: caminho direto (hoje, só as carteiras de infraestrutura da Arena).
  // Só PIX (off-ramp Eulen). On-chain não é exposto na API — ver partnerWithdrawSchema.
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
