import { Prisma } from "@prisma/client";
import { withAdmin } from "@/server/db";
import { brtDayKey } from "@/lib/utils/date-range";
import { logger } from "@/lib/logger";

/**
 * Gera as FinancialTransactions do mês a partir dos templates recorrentes ativos
 * cujo `dayOfMonth` já chegou e que ainda não geraram no período (YYYY-MM).
 *
 * Idempotente: um CAS em `lastGeneratedPeriod` "reivindica" o mês antes de criar
 * a transação — duas execuções do cron não duplicam. Cada template roda na PRÓPRIA
 * transação (withAdmin, cross-tenant): um template com erro não bloqueia os demais.
 */
export async function generateDueRecurringExpenses(
  now: Date = new Date(),
): Promise<{ generated: number }> {
  const dayKey = brtDayKey(now); // "YYYY-MM-DD" em BRT
  const period = dayKey.slice(0, 7); // "YYYY-MM"
  const todayDay = Number(dayKey.slice(8, 10));

  const due = await withAdmin((tx) =>
    tx.recurringExpense.findMany({
      where: {
        active: true,
        dayOfMonth: { lte: todayDay },
        OR: [{ lastGeneratedPeriod: null }, { lastGeneratedPeriod: { not: period } }],
      },
    }),
  );

  let generated = 0;
  for (const r of due) {
    try {
      const created = await withAdmin(async (tx) => {
        // CAS: reivindica o período. Se outro run já reivindicou, sai (count=0).
        const claim = await tx.recurringExpense.updateMany({
          where: {
            id: r.id,
            OR: [{ lastGeneratedPeriod: null }, { lastGeneratedPeriod: { not: period } }],
          },
          data: { lastGeneratedPeriod: period },
        });
        if (claim.count !== 1) return false;

        const dueDate = new Date(
          `${period}-${String(r.dayOfMonth).padStart(2, "0")}T12:00:00-03:00`,
        );
        const amount = new Prisma.Decimal(r.amountCents).div(100);
        const tsx = await tx.financialTransaction.create({
          data: {
            tenantId: r.tenantId,
            type: r.type,
            status: "PENDING",
            description: r.description,
            category: r.category,
            categoryId: r.categoryId,
            supplier: r.supplier,
            supplierId: r.supplierId,
            totalAmount: amount,
            paidAmount: new Prisma.Decimal(0),
            installmentsTotal: 1,
            dueDate,
            emissionDate: now,
            isManual: true,
            referenceType: "recurring_expense",
            referenceId: r.id,
            notes: r.notes,
            createdByUserId: r.createdByUserId,
          },
        });
        await tx.installment.create({
          data: {
            tenantId: r.tenantId,
            transactionId: tsx.id,
            number: 1,
            amount,
            dueDate,
            paidAmount: new Prisma.Decimal(0),
            status: "PENDING",
          },
        });
        return true;
      });
      if (created) generated++;
    } catch (error) {
      logger.error("[recurring-expenses] falha ao gerar template", {
        recurringExpenseId: r.id,
        tenantId: r.tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { generated };
}
