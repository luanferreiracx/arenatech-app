import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

/**
 * Validacao de limite DePix por CPF/CNPJ.
 *
 * Politica atual (simplificada vs Laravel original):
 *   - Limite unico: R$ 5.000 por transacao por CPF/CNPJ.
 *   - SEM cap diario por documento — o controle diario fica por TENANT
 *     (DEPIX_WITHDRAW_DAILY_CAP_CENTS) na revisao de seguranca, nao por CPF.
 *   - SEM regra de "primeiro dia" — todos os documentos tem o mesmo limite
 *     desde a primeira transacao.
 *
 * registerDepixUse permanece como AUDITORIA (incrementa DepixDailyLimit
 * pra trace forense de quanto cada CPF movimentou no dia), sem efeito
 * de gate.
 */

export const LIMITE_POR_TRANSACAO = 5000;

export interface LimitValidationResult {
  allowed: boolean;
  reason?: string;
  transactionLimit: number;
}

/**
 * Valida se uma nova transacao DePix de `amount` reais respeita o limite
 * por transacao. NAO modifica o banco. Use `registerDepixUse` no settle
 * pra registrar a auditoria.
 */
export async function validateDepixLimit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _tx: PrismaClient | any,
  _tenantId: string,
  _taxNumber: string,
  amountReais: number,
): Promise<LimitValidationResult> {
  if (amountReais > LIMITE_POR_TRANSACAO) {
    return {
      allowed: false,
      reason: `Limite por transacao: R$ ${LIMITE_POR_TRANSACAO.toFixed(2)}.`,
      transactionLimit: LIMITE_POR_TRANSACAO,
    };
  }
  return { allowed: true, transactionLimit: LIMITE_POR_TRANSACAO };
}

/**
 * Registra uso (auditoria). Upsert no DepixDailyLimit do dia BR.
 * Best-effort: erro de gravacao nao bloqueia a transacao em curso —
 * caller deve `.catch(...)` esse await.
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
      // Campo legado mantido como `false` pra nao quebrar schema.
      isFirstDay: false,
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
 * Retorna inicio do dia (00:00) em America/Sao_Paulo, para chaveamento
 * consistente em datas Brazil (e nao UTC).
 */
function startOfDayBrazil(d: Date): Date {
  const utc = new Date(d);
  const brHours = utc.getUTCHours() - 3;
  const adjustedDay = brHours < 0
    ? new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate() - 1))
    : new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate()));
  return adjustedDay;
}
