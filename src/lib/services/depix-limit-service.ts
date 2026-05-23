import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

/**
 * Validacao de limites DEPIX por CPF/CNPJ.
 *
 * Paridade Laravel app/Services/DepixLimiteService.php:
 *   - Primeiro dia (sem transacao confirmada >24h): R$ 500/transacao + R$ 500/dia.
 *   - Apos 24h: R$ 5.000/transacao + R$ 6.000/dia.
 *
 * "Primeiro dia" = nao existe DepixDailyLimit do tenant+taxNumber com
 * first_transaction_at >= NOW() - 24h E status final ja confirmado.
 *
 * O contador eh incrementado pelo webhook quando pagamento confirma — assim
 * PIX gerados mas nao pagos NAO contam pro limite.
 */

export const LIMITE_PRIMEIRO_DIA = 500;
export const LIMITE_POR_TRANSACAO_APOS_24H = 5000;
export const LIMITE_DIARIO_APOS_24H = 6000;

export interface LimitValidationResult {
  allowed: boolean;
  reason?: string;
  isFirstDay: boolean;
  transactionLimit: number;
  dailyLimit: number;
  usedToday: number;
  available: number;
}

/**
 * Valida se uma nova transacao DePix de `amount` reais respeita os limites.
 * NAO modifica o banco. Use `registerUse` quando o pagamento confirmar.
 */
export async function validateDepixLimit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: PrismaClient | any,
  tenantId: string,
  taxNumber: string,
  amountReais: number,
): Promise<LimitValidationResult> {
  const cleaned = taxNumber.replace(/\D/g, "");
  const today = startOfDayBrazil(new Date());

  const isFirstDay = await checkFirstDay(tx, tenantId, cleaned);

  // Pega ou cria o registro do dia
  const existing = await tx.depixDailyLimit.findUnique({
    where: {
      tenantId_taxNumber_date: {
        tenantId,
        taxNumber: cleaned,
        date: today,
      },
    },
  });
  const usedToday = existing ? Number(existing.totalAmount) : 0;
  const newTotal = usedToday + amountReais;

  const transactionLimit = isFirstDay ? LIMITE_PRIMEIRO_DIA : LIMITE_POR_TRANSACAO_APOS_24H;
  const dailyLimit = isFirstDay ? LIMITE_PRIMEIRO_DIA : LIMITE_DIARIO_APOS_24H;

  if (amountReais > transactionLimit) {
    return {
      allowed: false,
      reason: isFirstDay
        ? `Primeiro dia: limite de R$ ${LIMITE_PRIMEIRO_DIA.toFixed(2)} por transacao.`
        : `Limite por transacao: R$ ${LIMITE_POR_TRANSACAO_APOS_24H.toFixed(2)}.`,
      isFirstDay,
      transactionLimit,
      dailyLimit,
      usedToday,
      available: dailyLimit - usedToday,
    };
  }

  if (newTotal > dailyLimit) {
    return {
      allowed: false,
      reason: isFirstDay
        ? `Primeiro dia: limite diario de R$ ${LIMITE_PRIMEIRO_DIA.toFixed(2)} atingido.`
        : `Limite diario de R$ ${LIMITE_DIARIO_APOS_24H.toFixed(2)} atingido.`,
      isFirstDay,
      transactionLimit,
      dailyLimit,
      usedToday,
      available: dailyLimit - usedToday,
    };
  }

  return {
    allowed: true,
    isFirstDay,
    transactionLimit,
    dailyLimit,
    usedToday,
    available: dailyLimit - usedToday,
  };
}

/**
 * Registra uso de limite (chamado pelo webhook quando pagamento confirma).
 * Cria registro do dia se nao existe, incrementa total + count.
 */
export async function registerDepixUse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: PrismaClient | any,
  tenantId: string,
  taxNumber: string,
  amountReais: number,
): Promise<void> {
  const cleaned = taxNumber.replace(/\D/g, "");
  const today = startOfDayBrazil(new Date());
  const isFirstDay = await checkFirstDay(tx, tenantId, cleaned);

  await tx.depixDailyLimit.upsert({
    where: {
      tenantId_taxNumber_date: { tenantId, taxNumber: cleaned, date: today },
    },
    create: {
      tenantId,
      taxNumber: cleaned,
      date: today,
      totalTransactions: 1,
      totalAmount: new Prisma.Decimal(amountReais),
      isFirstDay,
      firstTransactionAt: new Date(),
      lastTransactionAt: new Date(),
    },
    update: {
      totalTransactions: { increment: 1 },
      totalAmount: { increment: new Prisma.Decimal(amountReais) },
      lastTransactionAt: new Date(),
    },
  });
}

/**
 * Verifica se eh "primeiro dia" do CPF/CNPJ: nao existe transacao confirmada
 * desse documento com mais de 24h.
 */
async function checkFirstDay(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: PrismaClient | any,
  tenantId: string,
  taxNumber: string,
): Promise<boolean> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const oldUsage = await tx.depixDailyLimit.findFirst({
    where: {
      tenantId,
      taxNumber,
      firstTransactionAt: { lt: oneDayAgo, not: null },
    },
  });
  return !oldUsage;
}

/**
 * Retorna inicio do dia (00:00) em America/Sao_Paulo, para chaveamento
 * consistente em datas Brazil (e nao UTC).
 */
function startOfDayBrazil(d: Date): Date {
  // BR e UTC-3 (sem horario de verao desde 2019). Calcula offset manualmente
  // para evitar dependencia de Intl/timezone DB.
  const utc = new Date(d);
  const brHours = utc.getUTCHours() - 3;
  // Se brHours negativo, dia BR e o anterior em UTC
  const adjustedDay = brHours < 0
    ? new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate() - 1))
    : new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate()));
  // O `@db.Date` armazena so a parte da data — gravamos 00:00 UTC do dia BR.
  // Para BR, 00:00 BR = 03:00 UTC, mas como o campo eh DATE (sem hora), so a
  // data importa. Salvamos 00:00 UTC do dia BR.
  return adjustedDay;
}
