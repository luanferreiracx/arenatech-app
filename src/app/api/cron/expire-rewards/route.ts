import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/server/db"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"

/**
 * POST /api/cron/expire-rewards
 *
 * Expira recompensas APPROVED com expiresAt no passado.
 * Cron diario (sugerido: 02:00 UTC).
 * Paridade Laravel RecompensaService::expirarRecompensasVencidas.
 *
 * Atualiza tambem RewardBalance para registrar o expirado (move
 * disponivel → expiredHistorical e incrementa contador).
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const expectedSecret = process.env.CRON_SECRET

  if (!expectedSecret) {
    logger.error("[cron-rewards] CRON_SECRET not configured")
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 })
  }

  if (authHeader !== `Bearer ${expectedSecret}`) {
    logger.warn("[cron-rewards] Unauthorized cron attempt")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const now = new Date()
    const result = await prisma.$transaction(async (tx) => {
      // Find APPROVED expired
      const expiredActions = await tx.rewardAction.findMany({
        where: {
          status: "APPROVED",
          expiresAt: { lt: now },
        },
        select: { id: true, tenantId: true, customerId: true, value: true, rewardType: true },
      })

      if (expiredActions.length === 0) {
        return { expiredCount: 0 }
      }

      await tx.rewardAction.updateMany({
        where: { id: { in: expiredActions.map((a) => a.id) } },
        data: { status: "EXPIRED" },
      })

      // Para recompensas CASHBACK ja creditadas, decrementar disponivel e
      // mover para totalExpiredHistorical. Soft-fail por cliente.
      const cashbacksByCustomer = new Map<string, { tenantId: string; amount: number }>()
      for (const a of expiredActions) {
        if (a.rewardType !== "CASHBACK") continue
        const amount = Number(a.value)
        if (amount <= 0) continue
        const key = a.customerId
        const cur = cashbacksByCustomer.get(key)
        cashbacksByCustomer.set(key, {
          tenantId: a.tenantId,
          amount: (cur?.amount ?? 0) + amount,
        })
      }

      for (const [customerId, { tenantId, amount }] of cashbacksByCustomer) {
        const balance = await tx.rewardBalance.findFirst({ where: { customerId } })
        if (!balance) continue
        const availableNow = Number(balance.availableBalance)
        const toExpire = Math.min(amount, availableNow)
        if (toExpire <= 0) continue

        await tx.rewardBalance.update({
          where: { id: balance.id },
          data: {
            availableBalance: { decrement: toExpire },
            totalBalance: { decrement: toExpire },
            totalExpiredHistorical: { increment: toExpire },
          },
        })
        await tx.rewardMovement.create({
          data: {
            tenantId,
            balanceId: balance.id,
            type: "expire",
            amount: toExpire,
            description: "Cashback expirado (cron diario)",
          },
        })
      }

      return { expiredCount: expiredActions.length, customersAffected: cashbacksByCustomer.size }
    })

    logger.info(`[cron-rewards] Expired ${result.expiredCount} rewards`)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    logger.error("[cron-rewards] Failed", { error: String(error) })
    return NextResponse.json(
      { error: "Failed to expire rewards", message: error instanceof Error ? error.message : "Unknown" },
      { status: 500 },
    )
  }
}
