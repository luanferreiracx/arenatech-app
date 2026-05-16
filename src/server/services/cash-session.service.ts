import type { PrismaClient } from "@prisma/client"
import { Prisma } from "@prisma/client"

/**
 * Calculate the current balance for a cash session.
 * Formula: initialBalance + sum(INCOME amounts) - sum(OUTCOME amounts)
 */
export async function calculateSessionBalance(
  tx: PrismaClient,
  cashSessionId: string
): Promise<number> {
  const session = await tx.cashSession.findUniqueOrThrow({
    where: { id: cashSessionId },
    select: { initialBalance: true },
  })

  const incomeResult = await tx.cashMovement.aggregate({
    where: { cashSessionId, nature: "INCOME" },
    _sum: { amount: true },
  })

  const outcomeResult = await tx.cashMovement.aggregate({
    where: { cashSessionId, nature: "OUTCOME" },
    _sum: { amount: true },
  })

  const initial = Number(session.initialBalance)
  const income = Number(incomeResult._sum.amount ?? 0)
  const outcome = Number(outcomeResult._sum.amount ?? 0)

  return Math.round((initial + income - outcome) * 100) / 100
}

/**
 * Calculate available cash (DINHEIRO only) for sangria validation.
 * Formula: initialBalance + sum(INCOME where paymentMethod='dinheiro') - sum(OUTCOME where paymentMethod='dinheiro')
 */
export async function calculateCashOnHand(
  tx: PrismaClient,
  cashSessionId: string
): Promise<number> {
  const session = await tx.cashSession.findUniqueOrThrow({
    where: { id: cashSessionId },
    select: { initialBalance: true },
  })

  const incomeResult = await tx.cashMovement.aggregate({
    where: { cashSessionId, nature: "INCOME", paymentMethod: "dinheiro" },
    _sum: { amount: true },
  })

  const outcomeResult = await tx.cashMovement.aggregate({
    where: { cashSessionId, nature: "OUTCOME", paymentMethod: "dinheiro" },
    _sum: { amount: true },
  })

  const initial = Number(session.initialBalance)
  const income = Number(incomeResult._sum.amount ?? 0)
  const outcome = Number(outcomeResult._sum.amount ?? 0)

  return Math.round((initial + income - outcome) * 100) / 100
}

/**
 * Get summary grouped by payment method for a session.
 */
export async function getPaymentMethodSummary(
  tx: PrismaClient,
  cashSessionId: string
): Promise<Array<{ paymentMethod: string; totalIncome: number; totalOutcome: number; net: number }>> {
  const movements = await tx.cashMovement.findMany({
    where: { cashSessionId },
    select: { paymentMethod: true, nature: true, amount: true },
  })

  const map = new Map<string, { income: number; outcome: number }>()

  for (const m of movements) {
    const method = m.paymentMethod || "outros"
    const entry = map.get(method) || { income: 0, outcome: 0 }
    if (m.nature === "INCOME") {
      entry.income += Number(m.amount)
    } else {
      entry.outcome += Number(m.amount)
    }
    map.set(method, entry)
  }

  return Array.from(map.entries()).map(([method, { income, outcome }]) => ({
    paymentMethod: method,
    totalIncome: Math.round(income * 100) / 100,
    totalOutcome: Math.round(outcome * 100) / 100,
    net: Math.round((income - outcome) * 100) / 100,
  }))
}

/**
 * Close a session: calculate balance, compute difference, set close fields.
 */
export async function closeSession(
  tx: PrismaClient,
  sessionId: string,
  declaredBalance: number,
  closingNote: string | null,
  closedByUserId: string,
  closeType: "MANUAL" | "AUTOMATIC"
): Promise<void> {
  const calculatedBalance = await calculateSessionBalance(tx, sessionId)
  const difference = Math.round((declaredBalance - calculatedBalance) * 100) / 100

  await tx.cashSession.update({
    where: { id: sessionId },
    data: {
      calculatedBalance: new Prisma.Decimal(calculatedBalance),
      declaredBalance: new Prisma.Decimal(declaredBalance),
      difference: new Prisma.Decimal(difference),
      closingNote,
      closeType,
      closedByUserId,
      closedAt: new Date(),
      verified: difference === 0 && closeType === "MANUAL", // no difference = auto-verified
    },
  })
}

/**
 * Auto-close abandoned sessions (K3).
 * Idempotent: only closes sessions that are still open and older than maxHours.
 */
export async function autoCloseAbandonedSessions(
  tx: PrismaClient,
  tenantId: string,
  maxHours: number = 18
): Promise<{ closed: number }> {
  const cutoff = new Date(Date.now() - maxHours * 60 * 60 * 1000)

  const openSessions = await tx.cashSession.findMany({
    where: {
      tenantId,
      closedAt: null,
      openedAt: { lt: cutoff },
    },
  })

  let closed = 0
  for (const session of openSessions) {
    const calculatedBalance = await calculateSessionBalance(tx, session.id)

    await tx.cashSession.update({
      where: { id: session.id },
      data: {
        calculatedBalance: new Prisma.Decimal(calculatedBalance),
        declaredBalance: new Prisma.Decimal(calculatedBalance), // assume declared = calculated for auto
        difference: new Prisma.Decimal(0),
        closeType: "AUTOMATIC",
        closedAt: new Date(),
        verified: false, // requires manager verification
      },
    })
    closed++
  }

  return { closed }
}
