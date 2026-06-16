/**
 * Servico orquestrador das transacoes DePix multi-tenant (modulo LWK).
 *
 * Padrao ETAPA 1/2/3 do projeto: tx Postgres curtas; chamadas HTTP externas
 * (LWK + PixPay) SEMPRE fora de qualquer transacao Prisma — evita lock + db
 * timeouts e nao reverte estado financeiro on-chain caso o Postgres caia.
 *
 * Idempotencia:
 *   - createWithdraw: aceita idempotencyKey client-side (UUID). 2a chamada
 *     com mesma key retorna o registro existente sem efeito.
 *   - cobrancaTaxa do deposito: idempotencyKey = `${transactionId}:fee` (LWK
 *     garante mesmo txid em retry).
 *   - saque (etapa 4): idempotencyKey = transaction.id (LWK idempotency).
 */

import { TRPCError } from "@trpc/server";
import { Prisma, type DepixTransactionSourceType } from "@prisma/client";
import { withTenant, withAdmin } from "@/server/db";
import { CENTRAL_TENANT_SLUG } from "@/server/api/trpc";
import { logger } from "@/lib/logger";
import {
  calcDepositFee,
  calcWithdrawFromNet,
  type DepixFeeConfig,
} from "@/lib/services/depix-transaction-fee";
import * as lwk from "@/lib/services/lwk-service";
import { getFeeWalletTenantId } from "@/server/services/depix-fee-wallet.service";
import {
  createPixPayment,
  createDepixWithdraw,
  getPixStatus,
  getDepixWithdrawStatus,
} from "@/lib/services/depix-service";
import { extractDepixWithdrawReceiptUrl } from "@/lib/depix/receipt-url";

const ZERO_FEE: DepixFeeConfig = {
  entryFeeFixed: 0,
  entryFeePercent: 0,
  exitFeeFixed: 0,
  exitFeePercent: 0,
};

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Cache do id do tenant central — invalida raramente (so muda em recreate). */
let _centralTenantIdCache: string | null = null;
async function getCentralTenantId(): Promise<string | null> {
  if (_centralTenantIdCache) return _centralTenantIdCache;
  const t = await withAdmin(async (tx) =>
    tx.tenant.findUnique({ where: { slug: CENTRAL_TENANT_SLUG }, select: { id: true } }),
  );
  if (t) _centralTenantIdCache = t.id;
  return t?.id ?? null;
}

/** Cap diario de saque por tenant (em centavos). Default R$ 25.000.
 *  Defesa em profundidade contra drain via sessao comprometida. */
const DAILY_WITHDRAW_CAP_CENTS = Number(
  process.env.DEPIX_WITHDRAW_DAILY_CAP_CENTS ?? "2500000",
);

/** Sanitiza mensagem de erro pra exibir ao client: remove hostnames, IPs,
 *  stack traces e qualquer string suspeita de detalhe interno. Mantem
 *  mensagens curtas PT-BR (codigos LWK ja traduzidos). */
function sanitizeUserError(rawError: string | null | undefined, fallback: string): string {
  if (!rawError) return fallback;
  const trimmed = rawError.trim();
  // Suspeitas de detalhe interno: stack, ECONNREFUSED, ENOTFOUND, host:port,
  // dump JSON com chave/aspas estranhas.
  const suspect =
    /\b(?:ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|getaddrinfo|fetch failed|TypeError|Error: )\b/i.test(
      trimmed,
    ) ||
    /\b[a-z0-9.-]+:\d{2,5}\b/i.test(trimmed) || // host:port
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(trimmed) || // IPv4
    trimmed.length > 200;
  return suspect ? fallback : trimmed;
}

/** Soma o gross dos saques do tenant nas ultimas 24h (status nao-FAILED). */
async function checkDailyWithdrawCap(
  tx: Prisma.TransactionClient,
  tenantId: string,
  nextGrossCents: number,
): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const agg = await tx.tenantDepixTransaction.aggregate({
    where: {
      tenantId,
      kind: "WITHDRAW",
      createdAt: { gte: since },
      // Exclui FAILED/CANCELLED — esses nao consumiram saldo.
      status: { notIn: ["FAILED", "CANCELLED", "EXPIRED"] },
    },
    _sum: { grossAmountCents: true },
  });
  const usedCents = agg._sum.grossAmountCents ?? 0;
  if (usedCents + nextGrossCents > DAILY_WITHDRAW_CAP_CENTS) {
    const remainingBrl = Math.max(0, DAILY_WITHDRAW_CAP_CENTS - usedCents) / 100;
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cap diario de saque atingido. Restante hoje: R$ ${remainingBrl.toFixed(2)} (limite R$ ${(DAILY_WITHDRAW_CAP_CENTS / 100).toFixed(2)}/24h)`,
    });
  }
}

export async function loadFeeConfig(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<DepixFeeConfig> {
  // GUARD: tenant central (Arena Tech) eh quem RECEBE as taxas — nao paga
  // taxa pra si mesmo. Mesmo se a config no DB tiver valores, retorna ZERO.
  // Isto evita: (a) tx on-chain desnecessaria pagando taxa pra Arena Tech
  // de Arena Tech, (b) desperdicio de fee L-BTC, (c) erro humano que
  // configure cobranca por engano no tenant central.
  const centralId = await getCentralTenantId();
  if (centralId && tenantId === centralId) {
    return ZERO_FEE;
  }
  const cfg = await tx.tenantDepixFeeConfig.findUnique({ where: { tenantId } });
  // Defaults se ainda nao foi criado (fail-safe).
  return {
    entryFeeFixed: cfg?.entryFeeFixed ?? 99,
    entryFeePercent: Number(cfg?.entryFeePercent ?? 1.5),
    exitFeeFixed: cfg?.exitFeeFixed ?? 99,
    exitFeePercent: Number(cfg?.exitFeePercent ?? 1.7),
  };
}

async function nextTransactionNumber(
  tx: Prisma.TransactionClient,
  kind: "DEPOSIT" | "WITHDRAW",
): Promise<string> {
  const today = new Date();
  const prefix = `${kind === "DEPOSIT" ? "TXD" : "TXW"}${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}-`;
  const last = await tx.tenantDepixTransaction.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: "desc" },
  });
  let seq = 1;
  if (last) {
    const lastSeq = parseInt(last.number.slice(-5), 10);
    if (Number.isFinite(lastSeq)) seq = lastSeq + 1;
  }
  return `${prefix}${String(seq).padStart(5, "0")}`;
}

/** Endereco mestre do tenant central (destino da taxa Arena Tech on-chain). */
async function getArenaMasterAddress(): Promise<string> {
  const tenant = await withAdmin(async (tx) =>
    tx.tenant.findUnique({ where: { slug: "arena-tech" }, select: { id: true } }),
  );
  if (!tenant) throw new Error("Tenant central 'arena-tech' nao encontrado");
  const wallet = await withAdmin(async (tx) =>
    tx.tenantDepixWallet.findUnique({
      where: { tenantId: tenant.id },
      select: { masterAddress: true },
    }),
  );
  if (!wallet?.masterAddress) {
    throw new Error("Carteira Arena Tech nao provisionada (TenantDepixWallet ausente)");
  }
  return wallet.masterAddress;
}

// ────────────────────────────────────────────────────────────────────────────
// DEPOSITO
// ────────────────────────────────────────────────────────────────────────────

export interface CreateDepositArgs {
  tenantId: string;
  userId: string;
  userName?: string | null;
  grossAmountCents: number;
  sourceType?: DepixTransactionSourceType;
  sourceId?: string | null;
  sourceDescription?: string | null;
  payerTaxId?: string | null;
  payerPhone?: string | null;
}

export async function createDeposit(args: CreateDepositArgs) {
  const payerTaxId = args.payerTaxId?.replace(/\D/g, "") || null;
  const payerPhone = args.payerPhone?.replace(/\D/g, "") || null;

  // ETAPA 1: cria registro PENDING + gera numero.
  const created = await withTenant(args.tenantId, async (tx) => {
    const number = await nextTransactionNumber(tx, "DEPOSIT");
    return tx.tenantDepixTransaction.create({
      data: {
        tenantId: args.tenantId,
        number,
        kind: "DEPOSIT",
        status: "PENDING",
        grossAmountCents: args.grossAmountCents,
        sourceType: args.sourceType ?? "WALLET",
        sourceId: args.sourceId ?? null,
        sourceDescription: args.sourceDescription ?? null,
        payerTaxId,
        payerPhone,
        userId: args.userId,
        userName: args.userName ?? null,
        // 30 min de validade do PIX (padrao PixPay).
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
  });

  // ETAPA 2: decide a carteira que RECEBE o DePix (ADR 0052).
  // Tenant non-custodial nao consegue assinar a cobranca da taxa no webhook
  // (sem passphrase). Por isso o deposito cai na CARTEIRA DE TAXAS custodial,
  // que retem a taxa e repassa o liquido. Custodial mantem o fluxo atual
  // (recebe na propria carteira). A tx continua pertencendo ao TENANT REAL.
  const depositWallet = await withTenant(args.tenantId, async (tx) =>
    tx.tenantDepixWallet.findUnique({
      where: { tenantId: args.tenantId },
      select: { custodyModel: true },
    }),
  );
  const isNonCustodial = depositWallet?.custodyModel === "non_custodial";

  let receivingTenantId = args.tenantId;
  if (isNonCustodial) {
    const feeWalletTenantId = await getFeeWalletTenantId();
    // Fail-closed: sem carteira de taxas provisionada, NAO cai no fluxo antigo
    // (que deixaria a taxa pendente). Bloqueia ate provisionar (ADR 0052).
    if (!feeWalletTenantId) {
      await withTenant(args.tenantId, async (tx) =>
        tx.tenantDepixTransaction.update({
          where: { id: created.id },
          data: { status: "FAILED", errorMessage: "Carteira de taxas nao provisionada" },
        }),
      );
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Carteira de taxas da Arena Tech ainda nao foi configurada. Contate o suporte.",
      });
    }
    receivingTenantId = feeWalletTenantId;
  }

  // Gera endereco LWK dedicado pra este deposito NA carteira de recebimento.
  // label = transactionId -> match exato no webhook do monitor.
  const addr = await lwk.generateAddress(receivingTenantId, created.id);
  if (!addr.success || !addr.address) {
    await withTenant(args.tenantId, async (tx) =>
      tx.tenantDepixTransaction.update({
        where: { id: created.id },
        data: { status: "FAILED", errorMessage: addr.error ?? "LWK indisponivel" },
      }),
    );
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Falha ao gerar endereco de recebimento",
    });
  }

  logger.info("Deposito DePix wallet usando endereco LWK dedicado", {
    tenantId: args.tenantId,
    receivingTenantId,
    nonCustodial: isNonCustodial,
    transactionId: created.id,
    sourceType: args.sourceType ?? "WALLET",
    sourceId: args.sourceId ?? null,
    depixAddress: addr.address,
  });

  // ETAPA 3: gera PIX no PixPay apontando pro endereco LWK do tenant.
  const pix = await createPixPayment(
    args.grossAmountCents / 100,
    args.sourceDescription ?? `Deposito DePix ${created.number}`,
    created.id,
    payerTaxId,
    { depixAddress: addr.address, requireDepixAddress: true },
  );
  if (!pix.success || !pix.transactionId) {
    await withTenant(args.tenantId, async (tx) =>
      tx.tenantDepixTransaction.update({
        where: { id: created.id },
        data: { status: "FAILED", errorMessage: pix.error ?? "PixPay indisponivel" },
      }),
    );
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: pix.error ?? "Falha ao gerar QR PIX",
    });
  }

  // ETAPA 4: persiste address + qrcode.
  const updated = await withTenant(args.tenantId, async (tx) =>
    tx.tenantDepixTransaction.update({
      where: { id: created.id },
      data: {
        depositAddress: addr.address,
        // O monitor LWK reporta o label do deposito como `label.user` no
        // webhook (lwk-deposit-handler usa payload.label.user) — que eh o
        // `user` que passamos a generateAddress, i.e. created.id. NAO usar
        // addr.label: o servico LWK transforma o user num label proprio
        // (trunca sem hifen + sufixo aleatorio, ex "<uuid-sem-hifen>_a1b2"),
        // que NUNCA bate com o que o webhook envia → deposito travava em
        // PROCESSING/PENDING sem nunca confirmar.
        depositLabel: created.id,
        // Carteira que recebe o DePix: a de taxas (non-custodial) ou a propria
        // (custodial). O settle usa isto p/ rotear sem reconsultar custodyModel.
        depositReceivingTenantId: receivingTenantId,
        pixpayDepixId: pix.transactionId,
        qrCode: pix.qrCode ?? null,
        qrCodeBase64: pix.qrCodeBase64 ?? null,
      },
    }),
  );

  return updated;
}

/**
 * Chamado pelo webhook do monitor LWK quando confirma o deposito on-chain.
 * Calcula taxa, debita on-chain (2a tx), atualiza pra COMPLETED.
 * Idempotente: se ja foi processado, e no-op.
 */
export async function settleDepositConfirmed(args: {
  tenantId: string;
  depositLabel: string;
  depositTxId: string;
  depixAmount: number; // em DePix (= reais)
  confirmations: number;
}) {
  const grossActualCents = Math.round(args.depixAmount * 100);
  // Localiza a transaction pelo label exato.
  // NAO inclui PROCESSING_FEE no WHERE: tx em PROCESSING_FEE ja teve gross
  // fixado e taxa em curso — reprocessar permitiria sobrescrita do gross
  // por um 2o deposito on-chain no mesmo endereco (HIGH #5).
  const txRow = await withTenant(args.tenantId, async (tx) =>
    tx.tenantDepixTransaction.findFirst({
      where: {
        tenantId: args.tenantId,
        kind: "DEPOSIT",
        depositLabel: args.depositLabel,
        status: { in: ["PENDING", "PROCESSING"] },
      },
    }),
  );
  if (!txRow) {
    logger.warn("settleDepositConfirmed: nao achou tx PENDING/PROCESSING para o label", {
      depositLabel: args.depositLabel,
      depositTxId: args.depositTxId,
    });
    return { matched: false };
  }

  // Calcula taxa Arena Tech sobre o valor REAL recebido on-chain (pode
  // diferir do gross solicitado se o cliente pagou outro valor — usamos o
  // que de fato chegou).
  const cfg = await withTenant(args.tenantId, async (tx) => loadFeeConfig(tx, args.tenantId));
  const breakdown = calcDepositFee(grossActualCents, cfg);

  // Transicao atomica PENDING/PROCESSING -> PROCESSING_FEE.
  // updateMany com guard de status evita race: se 2 webhooks chegarem
  // concorrentes, so 1 passa. O outro recebe count=0 e desiste.
  const transitioned = await withTenant(args.tenantId, async (tx) =>
    tx.tenantDepixTransaction.updateMany({
      where: {
        id: txRow.id,
        status: { in: ["PENDING", "PROCESSING"] },
      },
      data: {
        status: "PROCESSING_FEE",
        depositTxId: args.depositTxId,
        confirmations: args.confirmations,
        feeArenaTechCents: breakdown.feeArenaTechCents,
        netAmountCents: breakdown.netCents,
        grossAmountCents: grossActualCents,
      },
    }),
  );
  if (transitioned.count === 0) {
    // Outro processo ja moveu pra PROCESSING_FEE/COMPLETED — idempotente.
    logger.info("settleDepositConfirmed: race detectada, ja processado", {
      txId: txRow.id,
    });
    return { matched: true, alreadyCompleted: true };
  }

  // Fee zero (tenant central) -> nao dispara tx on-chain. Marca COMPLETED direto.
  if (breakdown.feeArenaTechCents <= 0) {
    await withTenant(args.tenantId, async (tx) => {
      await tx.tenantDepixTransaction.update({
        where: { id: txRow.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    });
    await applyDepositBusinessEffects(args.tenantId, txRow.id);
    logger.info("Deposito DePix concluido (sem taxa — tenant central)", {
      txId: txRow.id,
      grossCents: grossActualCents,
    });
    return { matched: true, completed: true };
  }

  // Dispara a TX LWK de cobranca de taxa: tenant -> Arena Tech.
  let arenaMaster: string;
  try {
    arenaMaster = await getArenaMasterAddress();
  } catch (err) {
    logger.error("settleDepositConfirmed: arenaMaster indisponivel", {
      txId: txRow.id,
      err: String(err),
    });
    await markFeeMissing(args.tenantId, txRow.id, "arenaMaster ausente");
    return { matched: true, feePending: true };
  }

  const feeTx = await lwk.transfer(
    args.tenantId,
    [{ to: arenaMaster, amountBrl: breakdown.feeArenaTechCents / 100 }],
    { idempotencyKey: `${txRow.id}:fee` },
  );
  if (!feeTx.success || !feeTx.txid) {
    logger.error("settleDepositConfirmed: transfer da taxa falhou", {
      txId: txRow.id,
      error: feeTx.error,
    });
    await markFeeMissing(args.tenantId, txRow.id, feeTx.error ?? "transfer falhou");
    return { matched: true, feePending: true };
  }

  // ETAPA final: marca COMPLETED + ledger SETTLED.
  // updateMany com guard de status: so transiciona PROCESSING_FEE -> COMPLETED
  // (impede COMPLETED -> COMPLETED). Upsert no ledger (unique [transactionId,
  // kind]) impede entry duplicada se 2 webhooks chegarem confirmados.
  await withTenant(args.tenantId, async (tx) => {
    await tx.tenantDepixTransaction.updateMany({
      where: { id: txRow.id, status: "PROCESSING_FEE" },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await tx.tenantDepixFeeLedger.upsert({
      where: {
        transactionId_kind: {
          transactionId: txRow.id,
          kind: "DEPOSIT",
        },
      },
      create: {
        tenantId: args.tenantId,
        transactionId: txRow.id,
        kind: "DEPOSIT",
        amountCents: breakdown.feeArenaTechCents,
        status: "SETTLED",
        settlementTxId: feeTx.txid!,
        settledAt: new Date(),
      },
      update: {
        amountCents: breakdown.feeArenaTechCents,
        status: "SETTLED",
        settlementTxId: feeTx.txid!,
        settledAt: new Date(),
      },
    });
  });

  logger.info("Deposito DePix concluido", {
    txId: txRow.id,
    grossCents: grossActualCents,
    feeArenaTechCents: breakdown.feeArenaTechCents,
    feeSettlementTxId: feeTx.txid,
  });
  await applyDepositBusinessEffects(args.tenantId, txRow.id);
  return { matched: true, completed: true };
}

export async function applyDepositBusinessEffects(tenantId: string, transactionId: string) {
  const row = await withTenant(tenantId, async (tx) =>
    tx.tenantDepixTransaction.findUnique({
      where: { id: transactionId },
      select: {
        id: true,
        tenantId: true,
        sourceType: true,
        sourceId: true,
        grossAmountCents: true,
        status: true,
      },
    }),
  );
  if (!row || row.status !== "COMPLETED") return { applied: false };

  if (row.sourceType === "QUICK_SALE" && row.sourceId) {
    await withTenant(tenantId, async (tx) => {
      const quickSale = await tx.quickSale.findFirst({
        where: {
          id: row.sourceId!,
          walletTransactionId: row.id,
          status: "AWAITING_PAYMENT",
        },
        select: { id: true, number: true },
      });
      if (!quickSale) return;

      await tx.quickSale.update({
        where: { id: quickSale.id },
        data: { status: "PAID", paidAt: new Date(), depixStatus: "paid" },
      });
      const notifyPayload = JSON.stringify({
        kind: "quick_sale",
        id: quickSale.id,
        transactionId: row.id,
        walletTransactionId: row.id,
      });
      await tx.$executeRaw`SELECT pg_notify('depix_paid', ${notifyPayload})`;
    });
    return { applied: true, sourceType: row.sourceType, sourceId: row.sourceId };
  }

  if (row.sourceType === "SERVICE_ORDER" && row.sourceId) {
    await withTenant(tenantId, async (tx) => {
      const order = await tx.serviceOrder.findFirst({
        where: { id: row.sourceId!, depixStatus: "pending" },
        select: {
          id: true,
          tenantId: true,
          status: true,
          number: true,
          totalAmount: true,
          createdById: true,
        },
      });
      if (!order) return;

      await tx.serviceOrder.update({
        where: { id: order.id },
        data: {
          status: "PAID",
          paidAmount: order.totalAmount,
          paymentMethod: "pix_depix",
          paymentDate: new Date(),
          depixStatus: "confirmed",
        },
      });
      await tx.serviceOrderHistory.create({
        data: {
          tenantId: order.tenantId,
          orderId: order.id,
          userId: order.createdById,
          previousStatus: order.status,
          newStatus: "PAID",
          notes: `Pagamento Pix DePix confirmado pela wallet (${row.id})`,
        },
      });
      const notifyPayload = JSON.stringify({
        kind: "order",
        id: order.id,
        transactionId: row.id,
        walletTransactionId: row.id,
      });
      await tx.$executeRaw`SELECT pg_notify('depix_paid', ${notifyPayload})`;
    });
    return { applied: true, sourceType: row.sourceType, sourceId: row.sourceId };
  }

  if (row.sourceType === "SALE" && row.sourceId) {
    await withTenant(tenantId, async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: row.sourceId! },
        select: { id: true, number: true },
      });
      if (!sale) return;
      const notifyPayload = JSON.stringify({
        kind: "sale",
        id: sale.id,
        transactionId: row.id,
        walletTransactionId: row.id,
      });
      await tx.$executeRaw`SELECT pg_notify('depix_paid', ${notifyPayload})`;
    });
    return { applied: true, sourceType: row.sourceType, sourceId: row.sourceId };
  }

  return { applied: false, sourceType: row.sourceType, sourceId: row.sourceId };
}

async function markFeeMissing(tenantId: string, txId: string, reason: string) {
  await withTenant(tenantId, async (tx) => {
    await tx.tenantDepixTransaction.update({
      where: { id: txId },
      data: {
        status: "COMPLETED_FEE_PENDING",
        completedAt: new Date(),
        errorMessage: `Taxa nao cobrada: ${reason}`,
      },
    });
    // Ledger PENDING_SETTLEMENT pra reconciliacao posterior. Pega valor
    // do registro pra nao recalcular.
    const cur = await tx.tenantDepixTransaction.findUnique({
      where: { id: txId },
      select: { feeArenaTechCents: true },
    });
    if (cur && cur.feeArenaTechCents > 0) {
      await tx.tenantDepixFeeLedger.create({
        data: {
          tenantId,
          transactionId: txId,
          kind: "DEPOSIT",
          amountCents: cur.feeArenaTechCents,
          status: "PENDING_SETTLEMENT",
        },
      });
    }
  });
}

// ────────────────────────────────────────────────────────────────────────────
// SAQUE
// ────────────────────────────────────────────────────────────────────────────

export interface CreateWithdrawArgs {
  tenantId: string;
  userId: string;
  userName?: string | null;
  pixKeyType: "RANDOM" | "CPF" | "CNPJ" | "EMAIL" | "PHONE";
  pixKey: string;
  recipientName?: string | null;
  recipientTaxId: string;
  /** Quanto o DESTINATARIO recebe (em centavos). Sistema calcula o bruto. */
  netAmountCents: number;
  idempotencyKey?: string;
  sourceType?: DepixTransactionSourceType;
  sourceId?: string | null;
  sourceDescription?: string | null;
  /** Non-custodial (ADR 0051): passphrase da carteira p/ assinar o saque.
   *  Obrigatoria se a carteira do tenant for non_custodial; ignorada se
   *  custodial. NUNCA logada nem persistida. */
  passphrase?: string;
}

export async function createWithdraw(args: CreateWithdrawArgs) {
  const taxId = args.recipientTaxId.replace(/\D/g, "");
  let pixKey = args.pixKey.trim();
  if (["CPF", "CNPJ", "PHONE"].includes(args.pixKeyType)) {
    pixKey = pixKey.replace(/\D/g, "");
  }

  // Idempotencia: se ja existe transaction com a mesma key, retorna.
  if (args.idempotencyKey) {
    const existing = await withTenant(args.tenantId, async (tx) =>
      tx.tenantDepixTransaction.findFirst({
        where: { tenantId: args.tenantId, idempotencyKey: args.idempotencyKey },
      }),
    );
    if (existing) return existing;
  }

  // Custodia (ADR 0051): carrega o modelo da carteira. Se non_custodial, o
  // saque EXIGE a passphrase do usuario (o LWK assina decifrando a seed em
  // memoria). Fail-fast aqui, antes de criar a intencao de saque / chamar a
  // LiquidX — assim passphrase ausente nao gera registro orfao.
  const wallet = await withTenant(args.tenantId, async (tx) =>
    tx.tenantDepixWallet.findUnique({
      where: { tenantId: args.tenantId },
      select: { custodyModel: true, encryptedSeed: true },
    }),
  );
  const isNonCustodial = wallet?.custodyModel === "non_custodial";
  if (isNonCustodial) {
    if (!args.passphrase) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Informe a senha da carteira (2FA da carteira) para sacar.",
      });
    }
    if (!wallet?.encryptedSeed) {
      // Estado inconsistente: non_custodial sem blob. Bloqueia em vez de cair
      // pro caminho custodial (que assinaria com a seed em claro).
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Carteira non-custodial sem seed cifrada. Contate o suporte.",
      });
    }
  }

  // Limite PIX por CPF/CNPJ do destinatario (R$ 5.000/tx).
  // Validator Zod ja barra > R$ 5k, mas mantemos paridade com PDV/OS/QuickSale.
  if (taxId && (taxId.length === 11 || taxId.length === 14)) {
    const { validateDepixLimit } = await import("@/lib/services/depix-limit-service");
    const limit = await withTenant(args.tenantId, async (tx) =>
      validateDepixLimit(tx, args.tenantId, taxId, args.netAmountCents / 100),
    );
    if (!limit.allowed) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: limit.reason ?? "Limite DePix excedido.",
      });
    }
  }

  // Calcula o BRUTO a partir do liquido (inverso): destinatario recebe
  // netAmountCents, sistema debita gross do saldo (cobrindo taxa Arena
  // Tech + taxa do provedor estimada).
  const cfg = await withTenant(args.tenantId, async (tx) => loadFeeConfig(tx, args.tenantId));
  // A estimativa local pode divergir da LiquidX; apos criar a intencao de
  // saque, o gross real e revalidado contra o saldo disponivel.
  const breakdown = calcWithdrawFromNet(args.netAmountCents, cfg);
  const grossAmountCents = breakdown.grossCents;

  // Valida saldo DePix do tenant: precisa cobrir o gross calculado.
  // Reserva contabil: saldo disponivel = saldo on-chain - saques pendentes.
  // Sem isso, N saques concorrentes passam pelo gate, depois LWK rejeita o 2o
  // por insufficient_depix mas o PixPay ja alocou payout orfao (HIGH #6).
  const balance = await lwk.getBalance(args.tenantId);
  if (!balance.success) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Nao foi possivel consultar saldo (LWK indisponivel)",
    });
  }
  const reservedCents = await withTenant(args.tenantId, async (tx) => {
    const agg = await tx.tenantDepixTransaction.aggregate({
      where: {
        tenantId: args.tenantId,
        kind: "WITHDRAW",
        status: { in: ["PENDING", "PROCESSING"] },
      },
      _sum: { grossAmountCents: true },
    });
    return agg._sum.grossAmountCents ?? 0;
  });
  const onchainCents = Math.floor((balance.depixBalance ?? 0) * 100);
  const availableCents = onchainCents - reservedCents;
  if (availableCents < grossAmountCents) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Saldo disponivel insuficiente. Necessario R$ ${(grossAmountCents / 100).toFixed(2)}; disponivel R$ ${(availableCents / 100).toFixed(2)} (saldo on-chain R$ ${(onchainCents / 100).toFixed(2)}, reservado em saques pendentes R$ ${(reservedCents / 100).toFixed(2)})`,
    });
  }

  // Cap diario (defesa em profundidade contra drain via sessao roubada).
  // Tenant central (Arena Tech) eh isento — eh quem recebe os saques.
  const centralId = await getCentralTenantId();
  if (args.tenantId !== centralId) {
    await withTenant(args.tenantId, async (tx) =>
      checkDailyWithdrawCap(tx, args.tenantId, grossAmountCents),
    );
  }

  // ETAPA 1: persiste PENDING + gera numero.
  const created = await withTenant(args.tenantId, async (tx) => {
    const number = await nextTransactionNumber(tx, "WITHDRAW");
    return tx.tenantDepixTransaction.create({
      data: {
        tenantId: args.tenantId,
        number,
        kind: "WITHDRAW",
        status: "PENDING",
        // grossAmountCents aqui guarda a ESTIMATIVA inicial — sera ajustado
        // apos a LiquidX retornar o depositAmountInCents real (etapa 3).
        grossAmountCents,
        feeArenaTechCents: breakdown.feeArenaTechCents,
        // O netAmountCents do registro eh o que o destinatario recebe — eh
        // o input do usuario, valor pretendido. LiquidX confirma o valor real.
        netAmountCents: args.netAmountCents,
        sourceType: args.sourceType ?? "WALLET",
        sourceId: args.sourceId ?? null,
        sourceDescription: args.sourceDescription ?? null,
        pixKeyType: args.pixKeyType,
        pixKey,
        recipientName: args.recipientName ?? null,
        recipientTaxId: taxId,
        userId: args.userId,
        userName: args.userName ?? null,
        idempotencyKey: args.idempotencyKey ?? null,
      },
    });
  });

  // ETAPA 2: chama LiquidX Pro createDepixWithdraw passando o valor LIQUIDO
  // (o que o destinatario recebe).
  const withdrawResult = await createDepixWithdraw(
    pixKey,
    args.pixKeyType,
    args.netAmountCents / 100,
    taxId,
  );
  if (!withdrawResult.success || !withdrawResult.id || !withdrawResult.depositAddress) {
    logger.error("createWithdraw: LiquidX falhou", {
      tenantId: args.tenantId,
      error: withdrawResult.error,
    });
    await withTenant(args.tenantId, async (tx) =>
      tx.tenantDepixTransaction.update({
        where: { id: created.id },
        data: { status: "FAILED", errorMessage: withdrawResult.error ?? "LiquidX falhou" },
      }),
    );
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: sanitizeUserError(withdrawResult.error, "Falha ao iniciar saque no provedor PIX"),
    });
  }

  const payoutAmountCents = withdrawResult.payoutAmountInCents ?? args.netAmountCents;
  const depositAmountCents = withdrawResult.depositAmountInCents ?? payoutAmountCents;
  const providerFeeCents = Math.max(0, depositAmountCents - payoutAmountCents);
  const feePixPayCents = providerFeeCents;
  const finalGrossCents = depositAmountCents + breakdown.feeArenaTechCents;

  if (availableCents < finalGrossCents) {
    await withTenant(args.tenantId, async (tx) =>
      tx.tenantDepixTransaction.update({
        where: { id: created.id },
        data: {
          status: "FAILED",
          errorMessage: "Saldo insuficiente para taxa final do provedor",
          apiResponse: withdrawResult.raw as never,
        },
      }),
    );
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Saldo disponivel insuficiente apos cotacao LiquidX. Necessario R$ ${(finalGrossCents / 100).toFixed(2)}; disponivel R$ ${(availableCents / 100).toFixed(2)}`,
    });
  }

  await withTenant(args.tenantId, async (tx) =>
    tx.tenantDepixTransaction.update({
      where: { id: created.id },
      data: {
        pixpayDepixId: withdrawResult.id,
        pixpayDepositAddress: withdrawResult.depositAddress,
        feePixPayCents,
        netAmountCents: payoutAmountCents,
        grossAmountCents: finalGrossCents,
        apiResponse: withdrawResult.raw as never,
      },
    }),
  );

  const recipients: lwk.LwkTransferRecipient[] = [
    { to: withdrawResult.depositAddress, amountBrl: depositAmountCents / 100 },
  ];
  if (breakdown.feeArenaTechCents > 0) {
    try {
      const arenaMaster = await getArenaMasterAddress();
      recipients.push({
        to: arenaMaster,
        amountBrl: breakdown.feeArenaTechCents / 100,
      });
    } catch (err) {
      await withTenant(args.tenantId, async (tx) =>
        tx.tenantDepixTransaction.update({
          where: { id: created.id },
          data: { status: "FAILED", errorMessage: `Arena Tech master indisponivel: ${String(err)}` },
        }),
      );
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Carteira mestre Arena Tech indisponivel",
      });
    }
  }

  const sweep = await lwk.transfer(args.tenantId, recipients, {
    idempotencyKey: created.id,
    // Non-custodial: o LWK assina decifrando a seed com a passphrase. Custodial:
    // ambos undefined -> LWK usa o mnemonic.txt (caminho atual).
    ...(isNonCustodial
      ? { encryptedSeed: wallet!.encryptedSeed, passphrase: args.passphrase }
      : {}),
  });
  if (!sweep.success || !sweep.txid) {
    logger.error("createWithdraw: LWK transfer falhou", {
      tenantId: args.tenantId,
      txId: created.id,
      error: sweep.error,
    });
    await withTenant(args.tenantId, async (tx) =>
      tx.tenantDepixTransaction.update({
        where: { id: created.id },
        data: { status: "FAILED", errorMessage: sweep.error ?? "LWK transfer falhou" },
      }),
    );
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: sanitizeUserError(sweep.error, "Falha ao transmitir saque on-chain"),
    });
  }

  const final = await withTenant(args.tenantId, async (tx) => {
    const updated = await tx.tenantDepixTransaction.update({
      where: { id: created.id },
      data: {
        withdrawTxId: sweep.txid,
        status: "PROCESSING",
      },
    });
    if (breakdown.feeArenaTechCents > 0) {
      await tx.tenantDepixFeeLedger.create({
        data: {
          tenantId: args.tenantId,
          transactionId: created.id,
          kind: "WITHDRAW",
          amountCents: breakdown.feeArenaTechCents,
          status: "SETTLED",
          settlementTxId: sweep.txid!,
          settledAt: new Date(),
        },
      });
    }
    return updated;
  });

  logger.info("Saque DePix transmitido", {
    txId: created.id,
    withdrawTxId: sweep.txid,
    grossCents: finalGrossCents,
    feeArenaTechCents: breakdown.feeArenaTechCents,
    feePixPayCents,
    netCents: payoutAmountCents,
  });
  return final;
}

// ────────────────────────────────────────────────────────────────────────────
// Poll status (UI fallback)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Side-effects pos-conclusao de saque: registra uso no DepixDailyLimit (auditoria
 * por CPF) e dispara reposicao de L-BTC se ficou baixa. Best-effort — nao
 * propaga erro pro caller (saque ja concluiu on-chain, side-effect nao deve
 * derrubar a resposta).
 */
export async function onWithdrawCompleted(tenantId: string, transactionId: string) {
  try {
    const row = await withTenant(tenantId, async (tx) =>
      tx.tenantDepixTransaction.findUnique({
        where: { id: transactionId },
        select: { recipientTaxId: true, netAmountCents: true },
      }),
    );
    if (row?.recipientTaxId && row.netAmountCents) {
      const { registerDepixUse } = await import("@/lib/services/depix-limit-service");
      await withTenant(tenantId, async (tx) =>
        registerDepixUse(tx, tenantId, row.recipientTaxId!, row.netAmountCents! / 100),
      );
    }
  } catch (err) {
    logger.warn("onWithdrawCompleted: registerDepixUse falhou", {
      tenantId,
      transactionId,
      err: String(err),
    });
  }
  // Reposicao de L-BTC (best-effort, fire-and-forget interno).
  try {
    const { ensureLbtcFor } = await import("./depix-lbtc-refill.service");
    await ensureLbtcFor(tenantId, { source: "auto" });
  } catch (err) {
    logger.warn("onWithdrawCompleted: ensureLbtcFor falhou", {
      tenantId,
      err: String(err),
    });
  }
}

export async function checkTransactionStatus(tenantId: string, transactionId: string) {
  const txRow = await withTenant(tenantId, async (tx) =>
    tx.tenantDepixTransaction.findUnique({ where: { id: transactionId } }),
  );
  if (!txRow) throw new TRPCError({ code: "NOT_FOUND" });

  // Status terminal: retorna sem chamar externos.
  const terminal = ["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"];
  if (terminal.includes(txRow.status)) return txRow;

  if (txRow.kind === "DEPOSIT") {
    // Confere status do PIX no PixPay (cliente ja pagou?).
    if (txRow.pixpayDepixId && txRow.status === "PENDING") {
      const ps = await getPixStatus(txRow.pixpayDepixId);
      if (ps.success && ps.status === "paid") {
        // Marca PROCESSING (aguardando LWK confirmar on-chain).
        await withTenant(tenantId, async (tx) =>
          tx.tenantDepixTransaction.update({
            where: { id: txRow.id },
            data: { status: "PROCESSING" },
          }),
        );
      } else if (ps.success && ps.status === "expired") {
        await withTenant(tenantId, async (tx) =>
          tx.tenantDepixTransaction.update({
            where: { id: txRow.id },
            data: { status: "EXPIRED" },
          }),
        );
      }
    }
  } else if (txRow.kind === "WITHDRAW") {
    // Confere status do saque na LiquidX Pro.
    if (txRow.pixpayDepixId) {
      const ws = await getDepixWithdrawStatus(txRow.pixpayDepixId);
      if (ws.success && ws.status) {
        const raw = ws.status.toLowerCase();
        const receiptUrl = extractDepixWithdrawReceiptUrl(ws.raw);
        let newStatus: typeof txRow.status | null = null;
        if (["sent", "send", "paid", "completed"].includes(raw)) newStatus = "COMPLETED";
        else if (["failed", "error", "rejected"].includes(raw)) newStatus = "FAILED";
        else if (["expired"].includes(raw)) newStatus = "EXPIRED";
        else if (["cancelled", "canceled"].includes(raw)) newStatus = "CANCELLED";
        else if (["pending", "processing", "sending"].includes(raw)) newStatus = "PROCESSING";
        else newStatus = null;
        if (newStatus === "PROCESSING" && txRow.status === "PROCESSING") {
          newStatus = null;
        }
        if ((newStatus && newStatus !== txRow.status) || receiptUrl) {
          await withTenant(tenantId, async (tx) =>
            tx.tenantDepixTransaction.update({
              where: { id: txRow.id },
              data: {
                status: newStatus ?? txRow.status,
                completedAt: newStatus === "COMPLETED" ? new Date() : undefined,
                pixpayReceiptUrl: receiptUrl ?? undefined,
                apiResponse: ws.raw ? (ws.raw as never) : undefined,
              },
            }),
          );
          // Side-effects pos-conclusao do saque (best-effort, nao bloqueia).
          if (newStatus === "COMPLETED") {
            void onWithdrawCompleted(tenantId, txRow.id);
          }
        }
      }
    }
  }

  return withTenant(tenantId, async (tx) =>
    tx.tenantDepixTransaction.findUnique({ where: { id: transactionId } }),
  );
}
