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
  calcDepositSettlement,
  calcWithdrawFromNet,
  type DepixFeeConfig,
} from "@/lib/services/depix-transaction-fee";
import * as lwk from "@/lib/services/lwk-service";
import { verifyDepositOnChain } from "@/lib/webhooks/verify-deposit-onchain";
import { propagateDepositNotPaid } from "@/lib/webhooks/depix-deposit-propagate";
import {
  getFeeWalletTenantId,
  ensureFeeWalletLbtc,
} from "@/server/services/depix-fee-wallet.service";
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

/**
 * Teto de tentativas automaticas do repasse do liquido (ADR 0052). Apos esgotar,
 * o repasse vai pra FAILED e PARA de ser reprocessado pelo cron — fica visivel no
 * painel superadmin (/admin/depix-fees) pra intervencao humana. O retry MANUAL do
 * painel ignora o teto (override do superadmin), reusando a mesma idempotencyKey.
 */
const MAX_REPAYMENT_ATTEMPTS = 8;

/**
 * Idade (min) a partir da qual um saque ainda em PROCESSING e considerado "preso":
 * o cron de reconciliacao registra log de ERRO pra escalar (sem auto-falhar — o PIX
 * pode ter saido on-chain e o saldo ja foi debitado). Acima disso, exige verificacao
 * humana no painel da PixPay.
 */
const WITHDRAW_STUCK_ALERT_MINUTES = 60;

/**
 * Margem de seguranca antes do `expiration` do saque para transmitir o DePix
 * on-chain. Depositar apos o expiration = perda de fundos (doc Eulen). Cobre o
 * tempo de broadcast/propagacao na Liquid.
 */
const WITHDRAW_SWEEP_SAFETY_MARGIN_MS = 90_000;

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

  // ETAPA 3: gera PIX na Eulen apontando pro endereco LWK do tenant.
  // nonce = created.id (idempotente por intencao: retry nao duplica).
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
  // Liquidacao: o on-chain JA e liquido da taxa Eulen — retem so a taxa Arena.
  const breakdown = calcDepositSettlement(grossActualCents, cfg);

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

/**
 * Settle de deposito que caiu na CARTEIRA DE TAXAS custodial (ADR 0052).
 *
 * Tenant non-custodial nao assina a cobranca da taxa no webhook. Em vez disso,
 * o DePix cai na carteira de taxas (custodial), que RETEM a taxa e REPASSA o
 * liquido (bruto - taxa) ao tenant real. Por ser custodial, ela assina sem
 * passphrase.
 *
 * O webhook chega com tenant_id = arena-fees (quem recebeu on-chain). A tx,
 * porem, pertence ao TENANT REAL — achamos pelo label (UUID global) via
 * withAdmin (cross-tenant). Os efeitos de negocio (liberar venda) so sao
 * aplicados APOS o repasse confirmar — o cliente so "tem" o dinheiro quando o
 * liquido chega na carteira dele. Se o repasse falhar, fica na fila
 * (DepixDepositRepayment PENDING) e o cron reprocessa (idempotente).
 */
export async function settleDepositViaFeeWallet(args: {
  feeWalletTenantId: string;
  depositLabel: string;
  depositTxId: string;
  depixAmount: number; // em DePix (= reais)
  confirmations: number;
}) {
  const grossActualCents = Math.round(args.depixAmount * 100);

  // A tx pertence ao TENANT REAL — busca cross-tenant pelo label (UUID global).
  const txRow = await withAdmin(async (tx) =>
    tx.tenantDepixTransaction.findFirst({
      where: {
        kind: "DEPOSIT",
        depositLabel: args.depositLabel,
        status: { in: ["PENDING", "PROCESSING"] },
      },
      select: { id: true, tenantId: true },
    }),
  );
  if (!txRow) {
    logger.warn("settleDepositViaFeeWallet: nao achou tx PENDING/PROCESSING para o label", {
      depositLabel: args.depositLabel,
      depositTxId: args.depositTxId,
    });
    return { matched: false };
  }
  const realTenantId = txRow.tenantId;

  // Taxa sobre o valor REAL recebido on-chain.
  const cfg = await withTenant(realTenantId, async (tx) => loadFeeConfig(tx, realTenantId));
  // Liquidacao: o on-chain JA e liquido da taxa Eulen — retem so a taxa Arena.
  const breakdown = calcDepositSettlement(grossActualCents, cfg);

  // Transicao atomica PENDING/PROCESSING -> PROCESSING_FEE (guard anti-race).
  const transitioned = await withTenant(realTenantId, async (tx) =>
    tx.tenantDepixTransaction.updateMany({
      where: { id: txRow.id, status: { in: ["PENDING", "PROCESSING"] } },
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
    logger.info("settleDepositViaFeeWallet: race detectada, ja processado", { txId: txRow.id });
    return { matched: true, alreadyCompleted: true };
  }

  // Resolve o endereco de destino (master do TENANT REAL).
  const realWallet = await withTenant(realTenantId, async (tx) =>
    tx.tenantDepixWallet.findUnique({
      where: { tenantId: realTenantId },
      select: { masterAddress: true },
    }),
  );
  if (!realWallet?.masterAddress) {
    logger.error("settleDepositViaFeeWallet: tenant sem masterAddress — nao da p/ repassar", {
      txId: txRow.id,
      realTenantId,
    });
    // Deixa em PROCESSING_FEE; sem destino nao ha como enfileirar.
    return { matched: true, repayPending: true };
  }

  // Liquido a repassar = on-chain - taxa Arena Tech (= breakdown.netCents, que
  // calcDepositSettlement ja calcula sem re-descontar a taxa Eulen).
  const netCents = breakdown.netCents;

  // Enfileira o repasse ANTES de chamar o LWK (persiste PENDING -> retry seguro).
  // transactionId @unique = 1 repasse por deposito (defesa anti-duplo).
  const repayment = await withAdmin(async (tx) =>
    tx.depixDepositRepayment.upsert({
      where: { transactionId: txRow.id },
      create: {
        tenantId: realTenantId,
        transactionId: txRow.id,
        destinationAddress: realWallet.masterAddress,
        netAmountCents: netCents,
        status: "PENDING",
      },
      update: {}, // ja enfileirado (retry de webhook) — nao recria
      select: { id: true, status: true },
    }),
  );
  if (repayment.status === "COMPLETED") {
    logger.info("settleDepositViaFeeWallet: repasse ja concluido", { txId: txRow.id });
    return { matched: true, completed: true };
  }

  // Garante L-BTC (fee de rede) na carteira de taxas antes do repasse — ela nao
  // saca, entao o auto-refill pos-saque nunca a abastece. Best-effort: se faltar,
  // o transfer falha e cai no retry.
  await ensureFeeWalletLbtc();

  // Repassa o liquido da CARTEIRA DE TAXAS (custodial) -> tenant real.
  const transfer = await lwk.transfer(
    args.feeWalletTenantId,
    [{ to: realWallet.masterAddress, amountBrl: netCents / 100 }],
    { idempotencyKey: `repay:${repayment.id}` },
  );
  if (!transfer.success || !transfer.txid) {
    // Falha: repayment fica PENDING (cron reprocessa). A tx NAO completa e os
    // efeitos de negocio NAO sao aplicados — o liquido ainda nao chegou.
    await withAdmin(async (tx) =>
      tx.depixDepositRepayment.update({
        where: { id: repayment.id },
        data: { attempts: { increment: 1 }, lastError: transfer.error ?? "transfer falhou" },
      }),
    );
    logger.error("settleDepositViaFeeWallet: repasse falhou — fila p/ retry", {
      txId: txRow.id,
      repaymentId: repayment.id,
      error: transfer.error,
    });
    return { matched: true, repayPending: true };
  }

  await completeFeeWalletRepayment({
    repaymentId: repayment.id,
    realTenantId,
    transactionId: txRow.id,
    feeArenaTechCents: breakdown.feeArenaTechCents,
    depositTxId: args.depositTxId,
    repaymentTxId: transfer.txid,
  });
  logger.info("Deposito DePix (fee wallet) concluido", {
    txId: txRow.id,
    realTenantId,
    grossCents: grossActualCents,
    netCents,
    feeArenaTechCents: breakdown.feeArenaTechCents,
    repaymentTxId: transfer.txid,
  });
  return { matched: true, completed: true };
}

/**
 * Conclui um repasse bem-sucedido da carteira de taxas: marca o repayment e a
 * tx COMPLETED, registra a taxa retida no ledger (SETTLED) e libera os efeitos
 * de negocio. Reusado pelo settle (PR4) e pelo cron de retry (PR5).
 *
 * settlementTxId no ledger = depositTxId: a taxa foi RETIDA na carteira de
 * taxas (nao houve tx propria de cobranca); o txid do deposito representa a
 * operacao que trouxe o valor do qual a taxa foi retida.
 */
export async function completeFeeWalletRepayment(args: {
  repaymentId: string;
  realTenantId: string;
  transactionId: string;
  feeArenaTechCents: number;
  depositTxId: string;
  repaymentTxId: string;
}) {
  await withAdmin(async (tx) => {
    await tx.depixDepositRepayment.updateMany({
      where: { id: args.repaymentId, status: { in: ["PENDING", "FAILED"] } },
      data: { status: "COMPLETED", repaymentTxId: args.repaymentTxId, completedAt: new Date() },
    });
    await tx.tenantDepixTransaction.updateMany({
      where: { id: args.transactionId, status: "PROCESSING_FEE" },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await tx.tenantDepixFeeLedger.upsert({
      where: { transactionId_kind: { transactionId: args.transactionId, kind: "DEPOSIT" } },
      create: {
        tenantId: args.realTenantId,
        transactionId: args.transactionId,
        kind: "DEPOSIT",
        amountCents: args.feeArenaTechCents,
        status: "SETTLED",
        settlementTxId: args.depositTxId,
        settledAt: new Date(),
      },
      update: {
        amountCents: args.feeArenaTechCents,
        status: "SETTLED",
        settlementTxId: args.depositTxId,
        settledAt: new Date(),
      },
    });
  });
  // Libera venda/saldo SO agora (o liquido chegou na carteira do tenant).
  await applyDepositBusinessEffects(args.realTenantId, args.transactionId);
}

/**
 * Reprocessa UM repasse PENDING da carteira de taxas (ADR 0052, cron de retry).
 * Idempotente: usa a MESMA idempotencyKey (repay:{id}) do 1o attempt — se o
 * broadcast foi pra rede mas o registro nao atualizou (crash), o LWK devolve o
 * mesmo txid e concluimos sem duplicar on-chain. Chamado pelo cron e pelo painel.
 */
export async function retryRepayment(
  repaymentId: string,
  opts?: { manual?: boolean },
): Promise<{
  status: "completed" | "pending" | "failed" | "skipped";
  reason?: string;
}> {
  const repayment = await withAdmin(async (tx) =>
    tx.depixDepositRepayment.findUnique({
      where: { id: repaymentId },
      select: {
        id: true,
        status: true,
        attempts: true,
        tenantId: true,
        transactionId: true,
        destinationAddress: true,
        netAmountCents: true,
      },
    }),
  );
  if (!repayment) return { status: "skipped", reason: "not_found" };
  if (repayment.status === "COMPLETED") return { status: "skipped", reason: "already_completed" };
  // Repasse esgotado nao e mais reprocessado pelo cron; so o retry MANUAL do painel
  // (override do superadmin) o reabre pra nova tentativa.
  if (repayment.status === "FAILED" && !opts?.manual) {
    return { status: "skipped", reason: "exhausted" };
  }

  const feeWalletTenantId = await getFeeWalletTenantId();
  if (!feeWalletTenantId) return { status: "skipped", reason: "fee_wallet_missing" };

  // Dados da tx p/ concluir (taxa retida + txid do deposito p/ o ledger).
  const txRow = await withAdmin(async (tx) =>
    tx.tenantDepixTransaction.findUnique({
      where: { id: repayment.transactionId },
      select: { feeArenaTechCents: true, depositTxId: true },
    }),
  );
  if (!txRow) return { status: "skipped", reason: "tx_not_found" };

  // Garante L-BTC na carteira de taxas antes do repasse (ver settleDepositViaFeeWallet).
  await ensureFeeWalletLbtc();

  const transfer = await lwk.transfer(
    feeWalletTenantId,
    [{ to: repayment.destinationAddress, amountBrl: repayment.netAmountCents / 100 }],
    { idempotencyKey: `repay:${repayment.id}` },
  );
  if (!transfer.success || !transfer.txid) {
    const lastError = transfer.error ?? "transfer falhou";
    const newAttempts = repayment.attempts + 1;
    // Esgotou o teto (so na rota automatica do cron) → FAILED + log de ERRO pra
    // escalar. O retry manual nunca esgota: o superadmin assume o controle.
    const exhausted = !opts?.manual && newAttempts >= MAX_REPAYMENT_ATTEMPTS;
    await withAdmin(async (tx) =>
      tx.depixDepositRepayment.update({
        where: { id: repayment.id },
        data: {
          attempts: { increment: 1 },
          lastError,
          ...(exhausted ? { status: "FAILED" } : {}),
        },
      }),
    );
    if (exhausted) {
      logger.error("retryRepayment: repasse FALHADO apos esgotar tentativas", {
        repaymentId: repayment.id,
        tenantId: repayment.tenantId,
        transactionId: repayment.transactionId,
        netAmountCents: repayment.netAmountCents,
        attempts: newAttempts,
        error: lastError,
      });
      return { status: "failed", reason: lastError };
    }
    logger.warn("retryRepayment: repasse ainda falha", {
      repaymentId: repayment.id,
      attempts: newAttempts,
      error: lastError,
    });
    return { status: "pending", reason: lastError };
  }

  await completeFeeWalletRepayment({
    repaymentId: repayment.id,
    realTenantId: repayment.tenantId,
    transactionId: repayment.transactionId,
    feeArenaTechCents: txRow.feeArenaTechCents ?? 0,
    depositTxId: txRow.depositTxId ?? "",
    repaymentTxId: transfer.txid,
  });
  logger.info("retryRepayment: repasse concluido", {
    repaymentId: repayment.id,
    repaymentTxId: transfer.txid,
  });
  return { status: "completed" };
}

/**
 * Efeito de VENDA de um depósito DePix com origem em PDV/QuickSale: marca a
 * QuickSale como PAID e dispara `pg_notify('depix_paid')` para o SSE (PDV
 * auto-finaliza). Idempotente: a QuickSale só transiciona de AWAITING_PAYMENT,
 * então reentrega de webhook (approved + depix_sent) não duplica.
 *
 * Disparado no marco **PIX recebido** (`approved`) — o dinheiro fiat já caiu, a
 * venda libera na hora. O crédito de SALDO (COMPLETED) é separado e só ocorre
 * on-chain (`settleDeposit*`). Por isso é seguro liberar a venda aqui.
 */
async function applyDepositSaleEffects(row: {
  id: string;
  tenantId: string;
  sourceType: string | null;
  sourceId: string | null;
}): Promise<{ applied: boolean; sourceType?: string | null; sourceId?: string | null }> {
  if (row.sourceType === "QUICK_SALE" && row.sourceId) {
    await withTenant(row.tenantId, async (tx) => {
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

  // OS paga DePix pelo PDV (ADR 0042) → a venda (SALE) é a fonte conciliada;
  // não há mais sourceType "SERVICE_ORDER" de PIX direto de OS.

  if (row.sourceType === "SALE" && row.sourceId) {
    await withTenant(row.tenantId, async (tx) => {
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

/**
 * Marco **PIX recebido** (`approved`): o cliente pagou o PIX (fiat já caiu). Para
 * depósitos de PDV/QuickSale, libera a venda na hora (sem esperar o on-chain).
 * NÃO credita saldo — isso é COMPLETED (on-chain), via `settleDeposit*`.
 */
export async function applyPixReceivedEffects(tenantId: string, transactionId: string) {
  const row = await withTenant(tenantId, async (tx) =>
    tx.tenantDepixTransaction.findUnique({
      where: { id: transactionId },
      select: {
        id: true,
        tenantId: true,
        sourceType: true,
        sourceId: true,
        pixApprovedAt: true,
      },
    }),
  );
  if (!row) return { applied: false };
  // So libera venda de PDV/QuickSale; deposito wallet puro nao tem efeito de venda.
  if (row.sourceType !== "SALE" && row.sourceType !== "QUICK_SALE") {
    return { applied: false };
  }
  return applyDepositSaleEffects(row);
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

  // Efeito de venda (QuickSale→PAID + notify). Idempotente: se já foi aplicado no
  // marco `approved` (PIX recebido), a QuickSale já não está AWAITING_PAYMENT e o
  // notify não re-dispara. Mantido aqui como rede de segurança (caso o `approved`
  // não tenha chegado e o depósito complete direto do on-chain).
  return applyDepositSaleEffects(row);
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
  // PixPay — assim passphrase ausente nao gera registro orfao.
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
  // A estimativa local pode divergir do PixPay; apos criar a intencao de
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
        // apos a PixPay retornar o depositAmountInCents real (etapa 3).
        grossAmountCents,
        feeArenaTechCents: breakdown.feeArenaTechCents,
        // O netAmountCents do registro eh o que o destinatario recebe — eh
        // o input do usuario, valor pretendido. PixPay confirma o valor real.
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

  // ETAPA 2: chama a Eulen createDepixWithdraw passando o valor LIQUIDO
  // (o que o destinatario recebe). nonce = created.id (idempotente: um retry
  // com o mesmo nonce NAO duplica o saque).
  const withdrawResult = await createDepixWithdraw(
    pixKey,
    args.pixKeyType,
    args.netAmountCents / 100,
    taxId,
    created.id,
  );
  if (!withdrawResult.success || !withdrawResult.id || !withdrawResult.depositAddress) {
    logger.error("createWithdraw: PixPay falhou", {
      tenantId: args.tenantId,
      error: withdrawResult.error,
    });
    await withTenant(args.tenantId, async (tx) =>
      tx.tenantDepixTransaction.update({
        where: { id: created.id },
        data: { status: "FAILED", errorMessage: withdrawResult.error ?? "PixPay falhou" },
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
      message: `Saldo disponivel insuficiente apos cotacao PixPay. Necessario R$ ${(finalGrossCents / 100).toFixed(2)}; disponivel R$ ${(availableCents / 100).toFixed(2)}`,
    });
  }

  const withdrawExpiresAt = withdrawResult.expiration
    ? new Date(withdrawResult.expiration)
    : null;

  await withTenant(args.tenantId, async (tx) =>
    tx.tenantDepixTransaction.update({
      where: { id: created.id },
      data: {
        pixpayDepixId: withdrawResult.id,
        pixpayDepositAddress: withdrawResult.depositAddress,
        feePixPayCents,
        netAmountCents: payoutAmountCents,
        grossAmountCents: finalGrossCents,
        expiresAt: withdrawExpiresAt,
        apiResponse: withdrawResult.raw as never,
      },
    }),
  );

  // SEGURANCA FINANCEIRA: a Eulen para de observar o depositAddress apos o
  // `expiration`. Transmitir o DePix on-chain DEPOIS disso = PERDA DE FUNDOS
  // (doc oficial: "Never ever deposit after the expiration date. YOU WILL LOSE
  // YOUR FUNDS!"). Abortamos ANTES do sweep — nada foi transmitido, o saldo do
  // tenant fica intacto. Margem cobre o tempo de broadcast/propagacao na Liquid.
  if (
    withdrawExpiresAt != null &&
    withdrawExpiresAt.getTime() - WITHDRAW_SWEEP_SAFETY_MARGIN_MS < Date.now()
  ) {
    await withTenant(args.tenantId, async (tx) =>
      tx.tenantDepixTransaction.update({
        where: { id: created.id },
        data: {
          status: "FAILED",
          errorMessage: "Janela do saque expirou antes do envio on-chain (sem perda de fundos)",
        },
      }),
    );
    logger.error("createWithdraw: janela do saque expirada antes do sweep — abortado sem perda", {
      txId: created.id,
      tenantId: args.tenantId,
      expiresAt: withdrawExpiresAt.toISOString(),
    });
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "A janela deste saque expirou antes do envio. Nenhum valor foi debitado — gere o saque novamente.",
    });
  }

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

/**
 * Rede de seguranca do deposito: re-roda o cross-check on-chain de uma tx
 * PROCESSING com `depositTxId` ja gravado e credita o saldo (COMPLETED) se
 * confirmado. Usado quando o webhook do monitor LWK pode ter se perdido —
 * mesma logica do webhook da Eulen. Idempotente (settle so age em PENDING/
 * PROCESSING). Best-effort: erro nao propaga (o monitor ainda cobre).
 */
async function creditDepositIfConfirmedOnChain(txRow: {
  id: string;
  tenantId: string;
  depositTxId: string | null;
  depositLabel: string | null;
  depositAddress: string | null;
  depositReceivingTenantId: string | null;
  grossAmountCents: number;
}): Promise<void> {
  if (!txRow.depositTxId) return;
  try {
    const feeWalletTenantId = await getFeeWalletTenantId();
    const receivingTenantId = txRow.depositReceivingTenantId ?? txRow.tenantId;
    const isFeeWalletDeposit = !!feeWalletTenantId && receivingTenantId === feeWalletTenantId;
    const expectedAmount = txRow.grossAmountCents / 100;

    const crossCheck = await verifyDepositOnChain({
      tenantId: receivingTenantId,
      txid: txRow.depositTxId,
      expectedAmount,
      expectedAddress: txRow.depositAddress,
    });
    if (!crossCheck.ok) {
      logger.info("reconcile deposit: ainda nao confirmado on-chain", {
        txId: txRow.id,
        reason: crossCheck.reason,
      });
      return;
    }

    if (isFeeWalletDeposit) {
      await settleDepositViaFeeWallet({
        feeWalletTenantId: receivingTenantId,
        depositLabel: txRow.depositLabel ?? "",
        depositTxId: txRow.depositTxId,
        depixAmount: crossCheck.onchainAmount,
        confirmations: 2,
      });
    } else {
      await settleDepositConfirmed({
        tenantId: receivingTenantId,
        depositLabel: txRow.depositLabel ?? "",
        depositTxId: txRow.depositTxId,
        depixAmount: crossCheck.onchainAmount,
        confirmations: 2,
      });
    }
    logger.info("reconcile deposit: creditado on-chain (rede de seguranca)", { txId: txRow.id });
  } catch (err) {
    logger.warn("reconcile deposit: erro ao creditar on-chain", {
      txId: txRow.id,
      err: err instanceof Error ? err.message : String(err),
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
    // Expiracao LOCAL do QR: PENDING vencido (expiresAt no passado) e nunca pago
    // (pixApprovedAt nulo) -> EXPIRED. Nao depende do webhook `expired` da Eulen,
    // que pode nao chegar. NAO expira se o PIX ja caiu (pixApprovedAt setado).
    if (
      txRow.status === "PENDING" &&
      txRow.pixApprovedAt == null &&
      txRow.expiresAt != null &&
      txRow.expiresAt < new Date()
    ) {
      const expired = await withTenant(tenantId, async (tx) =>
        tx.tenantDepixTransaction.update({
          where: { id: txRow.id },
          data: { status: "EXPIRED", errorMessage: "PIX expirou (30 min)" },
        }),
      );
      if (txRow.pixpayDepixId) await propagateDepositNotPaid(txRow.pixpayDepixId, "EXPIRED");
      logger.info("Deposito DePix expirado localmente (QR vencido)", { txId: txRow.id });
      return expired;
    }

    // Confere status do PIX na Eulen (cliente ja pagou?).
    if (txRow.pixpayDepixId && txRow.status === "PENDING") {
      const ps = await getPixStatus(txRow.pixpayDepixId);
      if (ps.success && ps.status === "paid") {
        // depix_sent: DePix on-chain. Marca PROCESSING (aguardando LWK confirmar
        // o saldo). O PIX ja caiu -> libera a venda na hora (idempotente).
        await withTenant(tenantId, async (tx) =>
          tx.tenantDepixTransaction.update({
            where: { id: txRow.id },
            data: { status: "PROCESSING", pixApprovedAt: txRow.pixApprovedAt ?? new Date() },
          }),
        );
        await applyPixReceivedEffects(tenantId, txRow.id);
      } else if (ps.success && ps.status === "pix_received") {
        // approved: PIX caiu mas o DePix ainda nao saiu on-chain — marca
        // PROCESSING (pagamento confirmado) e LIBERA a venda. NAO credita saldo.
        await withTenant(tenantId, async (tx) =>
          tx.tenantDepixTransaction.update({
            where: { id: txRow.id },
            data: { status: "PROCESSING", pixApprovedAt: txRow.pixApprovedAt ?? new Date() },
          }),
        );
        await applyPixReceivedEffects(tenantId, txRow.id);
      } else if (ps.success && ps.status === "expired") {
        await withTenant(tenantId, async (tx) =>
          tx.tenantDepixTransaction.update({
            where: { id: txRow.id },
            data: { status: "EXPIRED" },
          }),
        );
      }
    }

    // Rede de seguranca: deposito PROCESSING com DePix ja enviado on-chain
    // (depositTxId gravado pelo webhook) mas que nunca creditou o saldo — p.ex.
    // se o webhook do monitor LWK se perdeu. Re-roda o cross-check on-chain e
    // credita se confirmado (mesma logica do webhook). Idempotente.
    if (txRow.status === "PROCESSING" && txRow.depositTxId) {
      await creditDepositIfConfirmedOnChain(txRow);
    }
  } else if (txRow.kind === "WITHDRAW") {
    // Confere status do saque na PixPay.
    if (txRow.pixpayDepixId) {
      const ws = await getDepixWithdrawStatus(txRow.pixpayDepixId);
      if (ws.success && ws.status) {
        const raw = ws.status.toLowerCase();
        const receiptUrl = extractDepixWithdrawReceiptUrl(ws.raw);
        let newStatus: typeof txRow.status | null = null;
        // PixPay (off-ramp) usa depix_sent/paid/under_review/expired/refunded/unsent.
        if (["sent", "send", "paid", "completed", "depix_sent", "success"].includes(raw))
          newStatus = "COMPLETED";
        else if (["failed", "error", "rejected", "refunded"].includes(raw)) newStatus = "FAILED";
        else if (["expired"].includes(raw)) newStatus = "EXPIRED";
        else if (["cancelled", "canceled"].includes(raw)) newStatus = "CANCELLED";
        else if (["pending", "processing", "sending", "under_review", "unsent"].includes(raw))
          newStatus = "PROCESSING";
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

/**
 * Reconcilia em lote transacoes DePix PENDING/PROCESSING "antigas" (cron).
 *
 * Problema: `checkTransactionStatus` so roda sob demanda (UI fazendo polling).
 * Um saque que JA completou no provedor (PixPay "depix_sent") mas cuja tela nunca
 * foi aberta fica preso em PROCESSING — e a reserva contabil (saldo disponivel
 * = on-chain - saques pendentes) conta esse valor pra sempre, mesmo o DePix ja
 * tendo saido on-chain (dupla contagem) -> bloqueia novos saques. Depositos
 * PENDING cujo PIX nunca foi pago tambem acumulam (deveriam expirar).
 *
 * Este job varre as transacoes presas (com id do provedor, criadas ha mais de
 * `olderThanMinutes`) e chama o MESMO `checkTransactionStatus` de cada uma —
 * reusando toda a logica de reconciliacao (poll do provedor, transicao de
 * status, side-effects). Cross-tenant (withAdmin). Idempotente.
 */
export async function reconcileStaleDepixTransactions(opts?: {
  olderThanMinutes?: number;
  limit?: number;
}): Promise<{
  scanned: number;
  reconciled: number;
  unchanged: number;
  errors: number;
  stuckWithdrawals: number;
}> {
  const olderThan = new Date(Date.now() - (opts?.olderThanMinutes ?? 10) * 60_000);
  const stale = await withAdmin(async (tx) =>
    tx.tenantDepixTransaction.findMany({
      where: {
        status: { in: ["PENDING", "PROCESSING"] },
        // So da pra reconciliar quem tem id do provedor (PixPay) pra consultar.
        pixpayDepixId: { not: null },
        createdAt: { lt: olderThan },
      },
      orderBy: { createdAt: "asc" },
      take: opts?.limit ?? 50,
      select: { id: true, tenantId: true, status: true, kind: true, number: true, createdAt: true },
    }),
  );

  const stuckBefore = new Date(Date.now() - WITHDRAW_STUCK_ALERT_MINUTES * 60_000);
  let reconciled = 0;
  let unchanged = 0;
  let errors = 0;
  let stuckWithdrawals = 0;
  for (const t of stale) {
    let resolved = false;
    try {
      const after = await checkTransactionStatus(t.tenantId, t.id);
      if (after && after.status !== t.status) {
        reconciled += 1;
        resolved = true;
      } else {
        unchanged += 1;
      }
    } catch (err) {
      errors += 1;
      logger.warn("reconcileStaleDepixTransactions: erro ao reconciliar", {
        txId: t.id,
        tenantId: t.tenantId,
        err: err instanceof Error ? err.message : String(err),
      });
    }

    // Saque que segue PROCESSING ha muito tempo (provedor fora / webhook perdido):
    // escala via log de ERRO pra verificacao humana. NAO auto-falha: o PIX pode ter
    // saido on-chain e o saldo ja foi debitado — declarar FAILED arriscaria duplo saque.
    if (!resolved && t.kind === "WITHDRAW" && t.status === "PROCESSING" && t.createdAt < stuckBefore) {
      stuckWithdrawals += 1;
      logger.error("reconcileStaleDepixTransactions: saque preso em PROCESSING — verificar manualmente", {
        txId: t.id,
        number: t.number,
        tenantId: t.tenantId,
        stuckSinceMinutes: Math.round((Date.now() - t.createdAt.getTime()) / 60_000),
      });
    }
  }

  logger.info("reconcileStaleDepixTransactions: lote processado", {
    scanned: stale.length,
    reconciled,
    unchanged,
    errors,
    stuckWithdrawals,
  });
  return { scanned: stale.length, reconciled, unchanged, errors, stuckWithdrawals };
}
