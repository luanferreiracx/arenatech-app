/**
 * Router da carteira de taxas (ADR 0052) — restrito a SUPER-ADMIN.
 * Acessivel via /admin/depix-fees, gateado por isSuperAdmin.
 *
 * Endpoints:
 *   - provision: provisiona (idempotente) a carteira de taxas custodial.
 *   - status: saldo DePix acumulado (= taxas retidas) + master address.
 *   - listRepayments: repasses (PENDING/FAILED/COMPLETED) com tenant destino.
 *   - retryRepaymentManual: reprocessa um repasse on-demand.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, adminProcedure, CENTRAL_TENANT_SLUG, FEE_WALLET_TENANT_SLUG } from "@/server/api/trpc";
import { withAdmin } from "@/server/db";
import { looksLikeLiquidAddress } from "@/lib/validators/depix-onchain";
import {
  ensureFeeWalletProvisioned,
  getFeeWalletTenantId,
  getFeeWalletMasterAddress,
} from "@/server/services/depix-fee-wallet.service";
import { retryRepayment } from "@/server/services/depix-transaction.service";
import { updateDepixFeeConfigSchema, DEFAULT_DEPIX_FEE } from "@/lib/validators/depix-wallet";
import * as lwk from "@/lib/services/lwk-service";

const REPAYMENT_STATUSES = ["PENDING", "COMPLETED", "FAILED"] as const;

/** Select do responsável (admin mais antigo) para diferenciar tenants. */
const OWNER_SELECT = {
  users: {
    where: { role: "admin" },
    orderBy: { createdAt: "asc" as const },
    take: 1,
    select: { user: { select: { email: true } } },
  },
} as const;

type TenantWithOwner = { name: string | null; slug: string; users: { user: { email: string | null } }[] };

/**
 * Rótulo identificável do tenant. Anexa o e-mail do responsável quando houver —
 * muitos tenants NO-KYC ficam com nome genérico ("Loja NO-KYC") e o slug é opaco;
 * o e-mail do dono é o que os diferencia no seletor de taxas.
 */
function tenantLabel(t: TenantWithOwner): string {
  const base = t.name ?? t.slug;
  const email = t.users[0]?.user.email;
  return email ? `${base} (${email})` : base;
}

export const depixFeeWalletAdminRouter = createTRPCRouter({
  /** Provisiona (idempotente) a carteira de taxas custodial no LWK. */
  provision: adminProcedure.mutation(async () => {
    const res = await ensureFeeWalletProvisioned();
    return res;
  }),

  /**
   * Extrato ON-CHAIN BRUTO da carteira de taxas (ultimas 50 tx) — TODAS as
   * movimentacoes, nao so taxa. NEM toda entrada de DePix e taxa: o legado ADR
   * 0052 fazia o deposito non-custodial cair INTEIRO aqui (e repassava o liquido).
   * Por isso o rotulo e NEUTRO (entrada/saida); a receita REAL de taxa vem do
   * `feeLedger` (fonte de verdade). Read-only (watch-only no LWK).
   */
  transactions: adminProcedure.query(async () => {
    const feeTenantId = await getFeeWalletTenantId();
    if (!feeTenantId) return { provisioned: false, transactions: [] };
    const res = await lwk.listTransactions(feeTenantId, 50);
    if (!res.success || !res.transactions) {
      return { provisioned: true, transactions: [], error: res.error ?? "indisponivel" };
    }
    const items = res.transactions.map((t) => {
      let depixDeltaCents = 0;
      let lbtcDeltaSats = 0;
      for (const [assetId, b] of Object.entries(t.balance)) {
        if (b.is_depix) depixDeltaCents += Math.round(b.amount * 100);
        else if (assetId === lwk.LBTC_ASSET_ID) lbtcDeltaSats += b.satoshis;
      }
      // Rotulo NEUTRO pela direcao do DePix (NAO chama de taxa — pode ser legado).
      const kind =
        depixDeltaCents > 0 ? "depix_in" : depixDeltaCents < 0 ? "depix_out" : "lbtc_only";
      return {
        txid: t.txid,
        timestamp: t.timestamp,
        confirmations: t.confirmations,
        status: t.status,
        depixDeltaCents,
        lbtcDeltaSats,
        kind,
        explorerUrl: `https://blockstream.info/liquid/tx/${t.txid}`,
      };
    });
    return { provisioned: true, transactions: items };
  }),

  /**
   * Extrato de TAXAS REAIS (fonte de verdade = tenant_depix_fee_ledger). Cada
   * linha e uma taxa efetivamente cobrada (deposito ou saque), com o tenant que
   * pagou e o valor exato. NAO depende do delta on-chain (que mistura legado).
   */
  feeLedger: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(100) }).default({ limit: 100 }))
    .query(async ({ input }) => {
      const rows = await withAdmin((tx) =>
        tx.tenantDepixFeeLedger.findMany({
          orderBy: { createdAt: "desc" },
          take: input.limit,
        }),
      );
      const tenantIds = [...new Set(rows.map((r) => r.tenantId))];
      const tenants = await withAdmin((tx) =>
        tx.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true, slug: true, ...OWNER_SELECT } }),
      );
      const nameById = new Map(tenants.map((t) => [t.id, tenantLabel(t)]));
      const settledSum = rows
        .filter((r) => r.status === "SETTLED")
        .reduce((acc, r) => acc + r.amountCents, 0);
      return {
        totalSettledCents: settledSum,
        items: rows.map((r) => ({
          id: r.id,
          tenantName: nameById.get(r.tenantId) ?? r.tenantId,
          kind: r.kind, // DEPOSIT | WITHDRAW
          amountCents: r.amountCents,
          status: r.status, // SETTLED | PENDING_SETTLEMENT
          settlementTxId: r.settlementTxId,
          createdAt: r.createdAt,
        })),
      };
    }),

  /**
   * Envia DePix da CARTEIRA DE TAXAS pra um endereco Liquid externo (consolidar a
   * receita). A arena-fees e custodial -> assina sem passphrase. IRREVERSIVEL:
   * o endereco e validado leve aqui + autoritativamente no LWK (lwk.Address).
   */
  sendOnchain: adminProcedure
    .input(
      z.object({
        toAddress: z.string().trim().min(20).max(110).refine(looksLikeLiquidAddress, {
          message: "Endereco Liquid invalido (use lq1.../ex1...)",
        }),
        amountReais: z.number().positive().max(1_000_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const feeTenantId = await getFeeWalletTenantId();
      if (!feeTenantId) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Carteira de taxas nao provisionada." });
      }
      // Idempotencia best-effort por (admin + valor + minuto) — evita duplo clique.
      const idempotencyKey = `fee-send:${ctx.session.user.id}:${Math.round(input.amountReais * 100)}:${Math.floor(Date.now() / 60_000)}`;
      const res = await lwk.transfer(
        feeTenantId,
        [{ to: input.toAddress.trim(), amountBrl: input.amountReais }],
        { idempotencyKey },
      );
      if (!res.success || !res.txid) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: res.error ?? "Falha ao enviar on-chain",
        });
      }
      return { txid: res.txid, explorerUrl: `https://blockstream.info/liquid/tx/${res.txid}` };
    }),

  /** Estado da carteira de taxas: provisionada? saldo (= taxas retidas)? */
  status: adminProcedure.query(async () => {
    const feeTenantId = await getFeeWalletTenantId();
    if (!feeTenantId) {
      return { provisioned: false, masterAddress: null, depixBalance: 0, balanceError: null };
    }
    const [masterAddress, balance] = await Promise.all([
      getFeeWalletMasterAddress(),
      lwk.getBalance(feeTenantId),
    ]);
    return {
      provisioned: true,
      masterAddress,
      depixBalance: balance.success ? (balance.depixBalance ?? 0) : 0,
      balanceError: balance.success ? null : (balance.error ?? "indisponivel"),
    };
  }),

  /** Lista repasses (default: PENDING) com o nome do tenant destino. */
  listRepayments: adminProcedure
    .input(
      z
        .object({
          status: z.enum(REPAYMENT_STATUSES).optional(),
          limit: z.number().int().min(1).max(100).default(50),
        })
        .default({ limit: 50 }),
    )
    .query(async ({ input }) => {
      const rows = await withAdmin(async (tx) =>
        tx.depixDepositRepayment.findMany({
          where: input.status ? { status: input.status } : undefined,
          orderBy: { createdAt: "desc" },
          take: input.limit,
        }),
      );
      const tenantIds = [...new Set(rows.map((r) => r.tenantId))];
      const tenants = await withAdmin(async (tx) =>
        tx.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, name: true, slug: true, ...OWNER_SELECT },
        }),
      );
      const nameById = new Map(tenants.map((t) => [t.id, tenantLabel(t)]));
      return rows.map((r) => ({
        id: r.id,
        tenantName: nameById.get(r.tenantId) ?? r.tenantId,
        netAmountCents: r.netAmountCents,
        status: r.status,
        attempts: r.attempts,
        lastError: r.lastError,
        repaymentTxId: r.repaymentTxId,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
      }));
    }),

  /**
   * Reprocessa um repasse on-demand (mesma idempotencyKey repay:{id}).
   * `manual` reabre um repasse FAILED (esgotado no cron) — override do superadmin.
   */
  retryRepaymentManual: adminProcedure
    .input(z.object({ repaymentId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      return retryRepayment(input.repaymentId, { manual: true });
    }),

  /**
   * Lista as taxas DePix de cada tenant (deposito, saque PIX, saque on-chain) pro
   * editor do superadmin. Exclui o central e a carteira de taxas (nao pagam taxa).
   */
  listTenantFees: adminProcedure.query(async () => {
    const [tenants, configs] = await withAdmin(async (tx) => [
      await tx.tenant.findMany({
        where: { slug: { notIn: [CENTRAL_TENANT_SLUG, FEE_WALLET_TENANT_SLUG] } },
        select: { id: true, name: true, slug: true, ...OWNER_SELECT },
        orderBy: { name: "asc" },
      }),
      await tx.tenantDepixFeeConfig.findMany(),
    ]);
    const byTenant = new Map(configs.map((c) => [c.tenantId, c]));
    return tenants.map((t) => {
      const c = byTenant.get(t.id);
      return {
        tenantId: t.id,
        tenantName: tenantLabel(t),
        entryFeeFixed: c?.entryFeeFixed ?? DEFAULT_DEPIX_FEE.entryFeeFixed,
        entryFeePercent: Number(c?.entryFeePercent ?? DEFAULT_DEPIX_FEE.entryFeePercent),
        exitFeeFixed: c?.exitFeeFixed ?? DEFAULT_DEPIX_FEE.exitFeeFixed,
        exitFeePercent: Number(c?.exitFeePercent ?? DEFAULT_DEPIX_FEE.exitFeePercent),
        onchainFeeFixed: c?.onchainFeeFixed ?? DEFAULT_DEPIX_FEE.onchainFeeFixed,
        onchainFeePercent: Number(c?.onchainFeePercent ?? DEFAULT_DEPIX_FEE.onchainFeePercent),
      };
    });
  }),

  /** Atualiza (upsert) as taxas DePix de um tenant especifico. Superadmin. */
  updateTenantFee: adminProcedure
    .input(updateDepixFeeConfigSchema.extend({ tenantId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const { tenantId, ...fees } = input;
      await withAdmin((tx) =>
        tx.tenantDepixFeeConfig.upsert({
          where: { tenantId },
          create: { tenantId, ...fees },
          update: { ...fees },
        }),
      );
      return { success: true };
    }),
});
