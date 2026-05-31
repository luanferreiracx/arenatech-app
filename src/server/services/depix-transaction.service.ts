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
import { Prisma } from "@prisma/client";
import { withTenant, withAdmin } from "@/server/db";
import { CENTRAL_TENANT_SLUG } from "@/server/api/trpc";
import { logger } from "@/lib/logger";
import {
  calcDepositFee,
  calcWithdrawFromNet,
  type DepixFeeConfig,
} from "@/lib/services/depix-transaction-fee";
import * as lwk from "@/lib/services/lwk-service";
import {
  createPixPayment,
  createDepixWithdraw,
  getPixStatus,
  getDepixWithdrawStatus,
} from "@/lib/services/depix-service";

const PIXPAY_PCT_WITHDRAW = Number(process.env.PIXPAY_FEE_ESTIMATE_PCT_WITHDRAW ?? "1.3");

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
}

export async function createDeposit(args: CreateDepositArgs) {
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
        userId: args.userId,
        userName: args.userName ?? null,
        // 30 min de validade do PIX (padrao PixPay).
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
  });

  // ETAPA 2: gera endereco LWK dedicado pra este deposito.
  // label = transactionId -> match exato no webhook do monitor.
  const addr = await lwk.generateAddress(args.tenantId, created.id);
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

  // ETAPA 3: gera PIX no PixPay apontando pro endereco LWK do tenant.
  const pix = await createPixPayment(
    args.grossAmountCents / 100,
    `Deposito DePix ${created.number}`,
    created.id,
    null,
    { depixAddress: addr.address },
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
        depositLabel: addr.label ?? created.id,
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
  // Localiza a transaction PENDING/PROCESSING pelo label exato.
  const txRow = await withTenant(args.tenantId, async (tx) =>
    tx.tenantDepixTransaction.findFirst({
      where: {
        tenantId: args.tenantId,
        kind: "DEPOSIT",
        depositLabel: args.depositLabel,
        status: { in: ["PENDING", "PROCESSING", "PROCESSING_FEE"] },
      },
    }),
  );
  if (!txRow) {
    logger.warn("settleDepositConfirmed: nao achou tx PENDING para o label", {
      depositLabel: args.depositLabel,
      depositTxId: args.depositTxId,
    });
    return { matched: false };
  }
  // Idempotencia: se ja saiu de PROCESSING_FEE pra COMPLETED, nao refaz.
  if (txRow.status === "COMPLETED") return { matched: true, alreadyCompleted: true };

  // Calcula taxa Arena Tech sobre o valor REAL recebido on-chain (pode
  // diferir do gross solicitado se o cliente pagou outro valor — usamos o
  // que de fato chegou).
  const cfg = await withTenant(args.tenantId, async (tx) => loadFeeConfig(tx, args.tenantId));
  const breakdown = calcDepositFee(grossActualCents, cfg);

  // Marca PROCESSING_FEE antes de disparar a 2a tx (transparencia + cobertura
  // contra duplicacao).
  await withTenant(args.tenantId, async (tx) =>
    tx.tenantDepixTransaction.update({
      where: { id: txRow.id },
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

  // Fee zero (tenant central) -> nao dispara tx on-chain. Marca COMPLETED direto.
  if (breakdown.feeArenaTechCents <= 0) {
    await withTenant(args.tenantId, async (tx) =>
      tx.tenantDepixTransaction.update({
        where: { id: txRow.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      }),
    );
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
  await withTenant(args.tenantId, async (tx) => {
    await tx.tenantDepixTransaction.update({
      where: { id: txRow.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await tx.tenantDepixFeeLedger.create({
      data: {
        tenantId: args.tenantId,
        transactionId: txRow.id,
        kind: "DEPOSIT",
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
  return { matched: true, completed: true };
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

  // Calcula o BRUTO a partir do liquido (inverso): destinatario recebe
  // netAmountCents, sistema debita gross do saldo (cobrindo taxa Arena
  // Tech + taxa PixPay estimada).
  const cfg = await withTenant(args.tenantId, async (tx) => loadFeeConfig(tx, args.tenantId));
  const breakdown = calcWithdrawFromNet(args.netAmountCents, cfg, {
    pixpayPct: PIXPAY_PCT_WITHDRAW,
  });
  const grossAmountCents = breakdown.grossCents;

  // Valida saldo DePix do tenant: precisa cobrir o gross calculado.
  const balance = await lwk.getBalance(args.tenantId);
  if (!balance.success) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Nao foi possivel consultar saldo (LWK indisponivel)",
    });
  }
  const requiredBrl = grossAmountCents / 100;
  if ((balance.depixBalance ?? 0) < requiredBrl) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Saldo insuficiente. Necessario R$ ${requiredBrl.toFixed(2)} (saldo R$ ${(balance.depixBalance ?? 0).toFixed(2)})`,
    });
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
        // apos o PixPay retornar o depositAmountInCents real (etapa 3).
        grossAmountCents,
        feeArenaTechCents: breakdown.feeArenaTechCents,
        // O netAmountCents do registro eh o que o destinatario recebe — eh
        // o input do usuario, valor pretendido. PixPay confirma exato.
        netAmountCents: args.netAmountCents,
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

  // ETAPA 2: chama PixPay createDepixWithdraw passando o valor LIQUIDO
  // (o que o destinatario recebe). PixPay retorna depositAmount (quanto
  // de DePix precisamos enviar pra esse valor chegar).
  const pp = await createDepixWithdraw(
    pixKey,
    args.pixKeyType,
    args.netAmountCents / 100,
    taxId,
  );
  if (!pp.success || !pp.id || !pp.depositAddress) {
    await withTenant(args.tenantId, async (tx) =>
      tx.tenantDepixTransaction.update({
        where: { id: created.id },
        data: { status: "FAILED", errorMessage: pp.error ?? "PixPay falhou" },
      }),
    );
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: pp.error ?? "PixPay falhou ao iniciar saque",
    });
  }

  // PixPay retorna depositAmountInCents (quanto DePix mandar) e
  // payoutAmountInCents (= o valor liquido que o destinatario recebe).
  // Como passamos o net e o PixPay confirma, payoutAmountCents == netAmountCents.
  const depositAmountCents = pp.depositAmountInCents ?? args.netAmountCents;
  const payoutAmountCents = pp.payoutAmountInCents ?? args.netAmountCents;
  const feePixPayCents = Math.max(0, depositAmountCents - payoutAmountCents);

  // ETAPA 3: persiste dados PixPay + ajusta gross com valor REAL do PixPay.
  // O gross final eh depositAmount (DePix pro off-ramp) + feeArena (DePix
  // pra Arena Tech). Se PixPay cobrou um pouco mais/menos do que a estimativa
  // calcWithdrawFromNet previu, ajustamos aqui.
  const finalGrossCents = depositAmountCents + breakdown.feeArenaTechCents;
  await withTenant(args.tenantId, async (tx) =>
    tx.tenantDepixTransaction.update({
      where: { id: created.id },
      data: {
        pixpayDepixId: pp.id,
        pixpayDepositAddress: pp.depositAddress,
        feePixPayCents,
        netAmountCents: payoutAmountCents,
        grossAmountCents: finalGrossCents,
      },
    }),
  );

  // ETAPA 4: tx LWK. Se tem taxa Arena Tech > 0, 2 outputs (off-ramp +
  // Arena Tech) atomicamente. Se tenant central (taxa=0), so 1 output
  // pro off-ramp — nao precisa buscar masterAddress.
  const recipients: lwk.LwkTransferRecipient[] = [
    { to: pp.depositAddress, amountBrl: depositAmountCents / 100 },
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
  });
  if (!sweep.success || !sweep.txid) {
    await withTenant(args.tenantId, async (tx) =>
      tx.tenantDepixTransaction.update({
        where: { id: created.id },
        data: { status: "FAILED", errorMessage: sweep.error ?? "LWK transfer falhou" },
      }),
    );
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: sweep.error ?? "Falha ao transmitir saque",
    });
  }

  // ETAPA 5: persiste txid + ledger SETTLED (so se houve taxa cobrada).
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
    // Confere status do saque no PixPay.
    if (txRow.pixpayDepixId) {
      const ws = await getDepixWithdrawStatus(txRow.pixpayDepixId);
      if (ws.success && ws.status) {
        const raw = ws.status.toLowerCase();
        let newStatus: typeof txRow.status | null = null;
        if (["sent", "send", "sending", "paid", "completed"].includes(raw)) newStatus = "COMPLETED";
        else if (["failed", "error", "rejected"].includes(raw)) newStatus = "FAILED";
        else if (["cancelled", "canceled", "expired"].includes(raw)) newStatus = "CANCELLED";
        if (newStatus && newStatus !== txRow.status) {
          await withTenant(tenantId, async (tx) =>
            tx.tenantDepixTransaction.update({
              where: { id: txRow.id },
              data: { status: newStatus!, completedAt: newStatus === "COMPLETED" ? new Date() : undefined },
            }),
          );
        }
      }
    }
  }

  return withTenant(tenantId, async (tx) =>
    tx.tenantDepixTransaction.findUnique({ where: { id: transactionId } }),
  );
}
