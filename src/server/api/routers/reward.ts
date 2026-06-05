/**
 * Rewards Router — Campaigns, actions, cashback, approval/rejection.
 * Faithful to Laravel RecompensaService + RecompensaController + RecompensaCampanhaController.
 */

import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { Prisma } from "@prisma/client"
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc"
import { logger } from "@/lib/logger"

function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0
  return Math.round(Number(v) * 100)
}

function centsToPrisma(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(cents / 100)
}

export const rewardRouter = createTRPCRouter({
  // ═══════════════════════════════════════
  // CAMPAIGNS
  // ═══════════════════════════════════════

  /** List campaigns with filters */
  listCampaigns: tenantProcedure
    .input(z.object({
      status: z.enum(["active", "scheduled", "ended", "disabled"]).optional(),
      publicationType: z.string().optional(),
      page: z.number().int().min(0).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const page = input.page ?? 0
        const pageSize = input.pageSize ?? 20
        const now = new Date()
        const where: Record<string, unknown> = {}

        if (input.publicationType) where.publicationType = input.publicationType

        if (input.status === "active") {
          where.active = true
          where.startDate = { lte: now }
          where.OR = [{ endDate: null }, { endDate: { gte: now } }]
        } else if (input.status === "scheduled") {
          where.active = true
          where.startDate = { gt: now }
        } else if (input.status === "ended") {
          where.endDate = { lt: now }
        } else if (input.status === "disabled") {
          where.active = false
        }

        const [data, total] = await Promise.all([
          tx.rewardCampaign.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: page * pageSize,
            take: pageSize,
            include: { _count: { select: { actions: true } } },
          }),
          tx.rewardCampaign.count({ where }),
        ])

        return {
          data: data.map((c) => ({
            ...c,
            value: decimalToCents(c.value),
            percentage: Number(c.percentage),
            maxCap: c.maxCap ? decimalToCents(c.maxCap) : null,
            actionCount: c._count.actions,
          })),
          total,
          pageCount: Math.ceil(total / pageSize),
        }
      })
    }),

  /** Create campaign */
  createCampaign: tenantProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(1000).optional().nullable(),
      publicationType: z.string().max(50).optional().nullable(),
      startDate: z.string().optional().nullable(),
      endDate: z.string().optional().nullable(),
      validityDays: z.number().int().min(1).max(365).optional(),
      rewardType: z.enum(["DISCOUNT_PERCENTAGE", "DISCOUNT_FIXED", "CASHBACK", "GIFT"]),
      value: z.number().int().min(0).optional(), // centavos
      percentage: z.number().min(0).max(100).optional(),
      maxCap: z.number().int().min(0).optional().nullable(), // centavos
      participantLimit: z.number().int().min(1).optional().nullable(),
      rewardLimit: z.number().int().min(1).optional().nullable(),
      rules: z.record(z.string(), z.unknown()).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const campaign = await tx.rewardCampaign.create({
          data: {
            tenantId: ctx.tenantId,
            name: input.name,
            description: input.description ?? null,
            publicationType: input.publicationType ?? null,
            startDate: input.startDate ? new Date(input.startDate) : null,
            endDate: input.endDate ? new Date(input.endDate) : null,
            validityDays: input.validityDays ?? 30,
            rewardType: input.rewardType,
            value: centsToPrisma(input.value ?? 0),
            percentage: new Prisma.Decimal(input.percentage ?? 0),
            maxCap: input.maxCap != null ? centsToPrisma(input.maxCap) : null,
            participantLimit: input.participantLimit ?? null,
            rewardLimit: input.rewardLimit ?? null,
            rules: (input.rules as Prisma.InputJsonValue) ?? Prisma.JsonNull,
            createdById: ctx.session.user.id,
          },
        })
        return { id: campaign.id }
      })
    }),

  /** Update campaign */
  updateCampaign: tenantProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(1000).optional().nullable(),
      startDate: z.string().optional().nullable(),
      endDate: z.string().optional().nullable(),
      validityDays: z.number().int().min(1).max(365).optional(),
      active: z.boolean().optional(),
      participantLimit: z.number().int().min(1).optional().nullable(),
      rewardLimit: z.number().int().min(1).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const data: Record<string, unknown> = {}
        if (input.name !== undefined) data.name = input.name
        if (input.description !== undefined) data.description = input.description
        if (input.startDate !== undefined) data.startDate = input.startDate ? new Date(input.startDate) : null
        if (input.endDate !== undefined) data.endDate = input.endDate ? new Date(input.endDate) : null
        if (input.validityDays !== undefined) data.validityDays = input.validityDays
        if (input.active !== undefined) data.active = input.active
        if (input.participantLimit !== undefined) data.participantLimit = input.participantLimit
        if (input.rewardLimit !== undefined) data.rewardLimit = input.rewardLimit

        await tx.rewardCampaign.update({ where: { id: input.id }, data })
        return { success: true }
      })
    }),

  /** Toggle campaign active status */
  toggleCampaign: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const campaign = await tx.rewardCampaign.findUnique({ where: { id: input.id } })
        if (!campaign) throw new TRPCError({ code: "NOT_FOUND" })
        await tx.rewardCampaign.update({
          where: { id: input.id },
          data: { active: !campaign.active },
        })
        return { active: !campaign.active }
      })
    }),

  // ═══════════════════════════════════════
  // REWARD ACTIONS
  // ═══════════════════════════════════════

  /** List reward actions with filters */
  listActions: tenantProcedure
    .input(z.object({
      status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED", "USED"]).optional(),
      customerId: z.string().uuid().optional(),
      campaignId: z.string().uuid().optional(),
      search: z.string().optional(),
      page: z.number().int().min(0).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const page = input.page ?? 0
        const pageSize = input.pageSize ?? 20
        const where: Record<string, unknown> = {}

        if (input.status) where.status = input.status
        if (input.customerId) where.customerId = input.customerId
        if (input.campaignId) where.campaignId = input.campaignId

        const [data, total] = await Promise.all([
          tx.rewardAction.findMany({
            where,
            include: { campaign: { select: { name: true } } },
            orderBy: { createdAt: "desc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.rewardAction.count({ where }),
        ])

        return {
          data: data.map((a) => ({
            ...a,
            value: decimalToCents(a.value),
            percentage: Number(a.percentage),
          })),
          total,
          pageCount: Math.ceil(total / pageSize),
        }
      })
    }),

  /** Create reward action (claim by customer) */
  createAction: tenantProcedure
    .input(z.object({
      customerId: z.string().uuid(),
      campaignId: z.string().uuid().optional().nullable(),
      rewardType: z.enum(["DISCOUNT_PERCENTAGE", "DISCOUNT_FIXED", "CASHBACK", "GIFT"]),
      value: z.number().int().min(0).optional(), // centavos
      percentage: z.number().min(0).max(100).optional(),
      notes: z.string().max(500).optional().nullable(),
      metadata: z.record(z.string(), z.unknown()).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        let validityDays = 30
        let rewardType = input.rewardType
        let value = input.value ?? 0
        let percentage = input.percentage ?? 0

        // If campaign, inherit settings
        if (input.campaignId) {
          const campaign = await tx.rewardCampaign.findUnique({ where: { id: input.campaignId } })
          if (!campaign || !campaign.active) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Campanha inativa ou nao encontrada" })
          }

          // Check limits
          if (campaign.participantLimit && campaign.totalParticipants >= campaign.participantLimit) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Campanha atingiu limite de participantes" })
          }
          if (campaign.rewardLimit && campaign.totalRewardsGenerated >= campaign.rewardLimit) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Campanha atingiu limite de recompensas" })
          }

          // Validar limites de frequencia (paridade Laravel RecompensaRegraTipo).
          // Regras vivem em campaign.rules (JSON):
          //   { maxPerDay?: number, maxPerWeek?: number, maxPerMonth?: number, maxActive?: number }
          const rules = (campaign.rules as Record<string, unknown> | null) ?? {}
          const maxPerDay = Number(rules.maxPerDay ?? 0)
          const maxPerWeek = Number(rules.maxPerWeek ?? 0)
          const maxPerMonth = Number(rules.maxPerMonth ?? 0)
          const maxActive = Number(rules.maxActive ?? 0)

          if (maxPerDay > 0 || maxPerWeek > 0 || maxPerMonth > 0) {
            const now = new Date()
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
            const startOfWeek = new Date(startOfDay)
            startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay())
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

            const [dayCount, weekCount, monthCount] = await Promise.all([
              maxPerDay > 0
                ? tx.rewardAction.count({
                    where: {
                      customerId: input.customerId,
                      campaignId: input.campaignId,
                      createdAt: { gte: startOfDay },
                    },
                  })
                : 0,
              maxPerWeek > 0
                ? tx.rewardAction.count({
                    where: {
                      customerId: input.customerId,
                      campaignId: input.campaignId,
                      createdAt: { gte: startOfWeek },
                    },
                  })
                : 0,
              maxPerMonth > 0
                ? tx.rewardAction.count({
                    where: {
                      customerId: input.customerId,
                      campaignId: input.campaignId,
                      createdAt: { gte: startOfMonth },
                    },
                  })
                : 0,
            ])

            if (maxPerDay > 0 && dayCount >= maxPerDay) {
              throw new TRPCError({ code: "BAD_REQUEST", message: `Limite diario atingido para esta campanha (${maxPerDay})` })
            }
            if (maxPerWeek > 0 && weekCount >= maxPerWeek) {
              throw new TRPCError({ code: "BAD_REQUEST", message: `Limite semanal atingido para esta campanha (${maxPerWeek})` })
            }
            if (maxPerMonth > 0 && monthCount >= maxPerMonth) {
              throw new TRPCError({ code: "BAD_REQUEST", message: `Limite mensal atingido para esta campanha (${maxPerMonth})` })
            }
          }

          if (maxActive > 0) {
            const activeCount = await tx.rewardAction.count({
              where: {
                customerId: input.customerId,
                status: { in: ["PENDING", "APPROVED"] },
                expiresAt: { gt: new Date() },
              },
            })
            if (activeCount >= maxActive) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Cliente ja possui ${activeCount} recompensas ativas (max: ${maxActive})`,
              })
            }
          }

          validityDays = campaign.validityDays
          rewardType = campaign.rewardType
          value = decimalToCents(campaign.value)
          percentage = Number(campaign.percentage)

          // Increment counters
          await tx.rewardCampaign.update({
            where: { id: input.campaignId },
            data: {
              totalParticipants: { increment: 1 },
              totalRewardsGenerated: { increment: 1 },
            },
          })
        }

        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + validityDays)

        const action = await tx.rewardAction.create({
          data: {
            tenantId: ctx.tenantId,
            customerId: input.customerId,
            campaignId: input.campaignId ?? null,
            status: "PENDING",
            rewardType,
            value: centsToPrisma(value),
            percentage: new Prisma.Decimal(percentage),
            expiresAt,
            notes: input.notes ?? null,
            metadata: (input.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          },
        })

        return { id: action.id }
      })
    }),

  /** Approve a pending reward action */
  approveAction: tenantProcedure
    .input(z.object({
      actionId: z.string().uuid(),
      rewardType: z.enum(["DISCOUNT_PERCENTAGE", "DISCOUNT_FIXED", "CASHBACK", "GIFT"]).optional(),
      value: z.number().int().min(0).optional(),
      percentage: z.number().min(0).max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const action = await tx.rewardAction.findUnique({ where: { id: input.actionId } })
        if (!action) throw new TRPCError({ code: "NOT_FOUND" })
        if (action.status !== "PENDING") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas recompensas pendentes podem ser aprovadas" })
        }

        const data: Record<string, unknown> = {
          status: "APPROVED",
          validatedById: ctx.session.user.id,
          validatedAt: new Date(),
        }

        if (input.rewardType) data.rewardType = input.rewardType
        if (input.value !== undefined) data.value = centsToPrisma(input.value)
        if (input.percentage !== undefined) data.percentage = new Prisma.Decimal(input.percentage)

        await tx.rewardAction.update({ where: { id: input.actionId }, data })

        // If cashback, credit to balance
        const updatedAction = await tx.rewardAction.findUnique({ where: { id: input.actionId } })
        if (updatedAction?.rewardType === "CASHBACK") {
          const cashbackValue = Number(updatedAction.value)
          if (cashbackValue > 0) {
            await creditCashback(tx, ctx.tenantId, action.customerId, cashbackValue, input.actionId)
          }
        }

        return { success: true }
      })
    }),

  /** Reject a pending reward action */
  rejectAction: tenantProcedure
    .input(z.object({
      actionId: z.string().uuid(),
      reason: z.string().min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const action = await tx.rewardAction.findUnique({ where: { id: input.actionId } })
        if (!action || action.status !== "PENDING") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Recompensa nao pode ser rejeitada" })
        }

        await tx.rewardAction.update({
          where: { id: input.actionId },
          data: {
            status: "REJECTED",
            rejectionReason: input.reason,
            validatedById: ctx.session.user.id,
            validatedAt: new Date(),
          },
        })

        return { success: true }
      })
    }),

  /** Cancel an approved reward */
  cancelAction: tenantProcedure
    .input(z.object({
      actionId: z.string().uuid(),
      reason: z.string().min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const action = await tx.rewardAction.findUnique({ where: { id: input.actionId } })
        if (!action || !["PENDING", "APPROVED"].includes(action.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Recompensa nao pode ser cancelada" })
        }

        // If was approved cashback, debit from balance
        if (action.status === "APPROVED" && action.rewardType === "CASHBACK") {
          const cashbackValue = Number(action.value)
          if (cashbackValue > 0) {
            await debitCashback(tx, ctx.tenantId, action.customerId, cashbackValue, input.actionId)
          }
        }

        await tx.rewardAction.update({
          where: { id: input.actionId },
          data: {
            status: "CANCELLED",
            notes: `[CANCELADO] ${input.reason}`,
          },
        })

        return { success: true }
      })
    }),

  /**
   * Use a reward in a sale (ou OS via usedInOsId).
   * Calcula o desconto efetivo com base no rewardType:
   *  - DISCOUNT_PERCENTAGE/CASHBACK: percentage * saleTotal / 100 (com cap se houver)
   *  - DISCOUNT_FIXED: value (em centavos)
   *  - GIFT: 0 (nao aplica desconto, apenas marca como usado)
   *
   * Retorna `discountCents` para o PDV/OS aplicar.
   * Paridade Laravel RecompensaUtilizacaoController::aplicar.
   */
  useAction: tenantProcedure
    .input(z.object({
      actionId: z.string().uuid(),
      saleId: z.string().uuid().optional(),
      osId: z.string().uuid().optional(),
      // Total da venda/OS em centavos — usado para calcular percentual dinamico
      saleTotalCents: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!input.saleId && !input.osId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Forneca saleId ou osId" })
      }
      return ctx.withTenant(async (tx) => {
        const action = await tx.rewardAction.findUnique({
          where: { id: input.actionId },
          include: { campaign: { select: { maxCap: true } } },
        })
        if (!action || action.status !== "APPROVED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Recompensa nao disponivel" })
        }

        if (action.expiresAt && action.expiresAt < new Date()) {
          await tx.rewardAction.update({
            where: { id: input.actionId },
            data: { status: "EXPIRED" },
          })
          throw new TRPCError({ code: "BAD_REQUEST", message: "Recompensa expirada" })
        }

        // Calcula desconto efetivo
        let discountCents = 0
        const percentage = Number(action.percentage)
        const valueCents = decimalToCents(action.value)

        if (action.rewardType === "DISCOUNT_PERCENTAGE" || action.rewardType === "CASHBACK") {
          if (percentage > 0 && input.saleTotalCents) {
            discountCents = Math.round((input.saleTotalCents * percentage) / 100)
            // Aplica cap da campanha (em centavos)
            const maxCapCents = action.campaign?.maxCap ? decimalToCents(action.campaign.maxCap) : 0
            if (maxCapCents > 0 && discountCents > maxCapCents) {
              discountCents = maxCapCents
            }
          } else if (valueCents > 0) {
            // Fallback: usar valor pré-fixado se sem total ou sem percentual
            discountCents = valueCents
          }
        } else if (action.rewardType === "DISCOUNT_FIXED") {
          discountCents = valueCents
        }
        // GIFT: discountCents permanece 0

        await tx.rewardAction.update({
          where: { id: input.actionId },
          data: {
            status: "USED",
            usedAt: new Date(),
            usedInSaleId: input.saleId ?? null,
            usedInOsId: input.osId ?? null,
          },
        })

        return { success: true, discountCents, rewardType: action.rewardType }
      })
    }),

  // ═══════════════════════════════════════
  // BALANCE (cashback)
  // ═══════════════════════════════════════

  /** Get customer's reward balance */
  getBalance: tenantProcedure
    .input(z.object({ customerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const balance = await tx.rewardBalance.findFirst({
          where: { tenantId: ctx.tenantId, customerId: input.customerId },
          include: {
            movements: { orderBy: { createdAt: "desc" }, take: 20 },
          },
        })

        if (!balance) {
          return {
            totalBalance: 0,
            availableBalance: 0,
            lockedBalance: 0,
            movements: [],
          }
        }

        return {
          totalBalance: decimalToCents(balance.totalBalance),
          availableBalance: decimalToCents(balance.availableBalance),
          lockedBalance: decimalToCents(balance.lockedBalance),
          movements: balance.movements.map((m) => ({
            ...m,
            amount: decimalToCents(m.amount),
          })),
        }
      })
    }),

  /** Get customer's available rewards for checkout */
  getAvailableRewards: tenantProcedure
    .input(z.object({ customerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const now = new Date()
        const rewards = await tx.rewardAction.findMany({
          where: {
            customerId: input.customerId,
            status: "APPROVED",
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          include: { campaign: { select: { name: true } } },
          orderBy: { expiresAt: "asc" },
        })

        return rewards.map((r) => ({
          id: r.id,
          rewardType: r.rewardType,
          value: decimalToCents(r.value),
          percentage: Number(r.percentage),
          expiresAt: r.expiresAt,
          campaignName: r.campaign?.name ?? null,
        }))
      })
    }),

  /**
   * Lock cashback balance (reserva durante checkout).
   * Move `amount` cents de availableBalance → lockedBalance.
   * Retorna a movimentacao para que o caller (PDV) possa desbloquear depois.
   */
  lockBalance: tenantProcedure
    .input(z.object({
      customerId: z.string().uuid(),
      amountCents: z.number().int().min(1),
      saleId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const balance = await tx.rewardBalance.findFirst({
          where: { tenantId: ctx.tenantId, customerId: input.customerId },
        })
        if (!balance) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cliente sem saldo de cashback" })
        }
        const availableCents = decimalToCents(balance.availableBalance)
        if (availableCents < input.amountCents) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Saldo insuficiente: disponivel R$ ${(availableCents / 100).toFixed(2)}`,
          })
        }
        await tx.rewardBalance.update({
          where: { id: balance.id },
          data: {
            availableBalance: { decrement: input.amountCents / 100 },
            lockedBalance: { increment: input.amountCents / 100 },
          },
        })
        const mov = await tx.rewardMovement.create({
          data: {
            tenantId: ctx.tenantId,
            balanceId: balance.id,
            type: "lock",
            amount: new Prisma.Decimal(input.amountCents / 100),
            description: input.saleId ? `Reserva checkout venda ${input.saleId.slice(0, 8)}` : "Reserva manual",
            referenceType: input.saleId ? "sale" : null,
            referenceId: input.saleId ?? null,
          },
        })
        return { movementId: mov.id }
      })
    }),

  /**
   * Unlock cashback balance (libera reserva — venda cancelada ou expirou).
   * Move `amount` cents de lockedBalance → availableBalance.
   */
  unlockBalance: tenantProcedure
    .input(z.object({
      customerId: z.string().uuid(),
      amountCents: z.number().int().min(1),
      reason: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const balance = await tx.rewardBalance.findFirst({
          where: { tenantId: ctx.tenantId, customerId: input.customerId },
        })
        if (!balance) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cliente sem saldo de cashback" })
        }
        const lockedCents = decimalToCents(balance.lockedBalance)
        const toUnlock = Math.min(input.amountCents, lockedCents)
        if (toUnlock === 0) {
          return { unlocked: 0 }
        }
        await tx.rewardBalance.update({
          where: { id: balance.id },
          data: {
            availableBalance: { increment: toUnlock / 100 },
            lockedBalance: { decrement: toUnlock / 100 },
          },
        })
        await tx.rewardMovement.create({
          data: {
            tenantId: ctx.tenantId,
            balanceId: balance.id,
            type: "unlock",
            amount: new Prisma.Decimal(toUnlock / 100),
            description: input.reason ?? "Liberacao de reserva",
          },
        })
        return { unlocked: toUnlock }
      })
    }),

  /** Stats for rewards dashboard */
  stats: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const [total, pending, approved, used, expired] = await Promise.all([
        tx.rewardAction.count(),
        tx.rewardAction.count({ where: { status: "PENDING" } }),
        tx.rewardAction.count({ where: { status: "APPROVED" } }),
        tx.rewardAction.count({ where: { status: "USED" } }),
        tx.rewardAction.count({ where: { status: "EXPIRED" } }),
      ])

      return { total, pending, approved, used, expired }
    })
  }),

  /** Expire overdue rewards (cron job) */
  expireOverdue: tenantProcedure.mutation(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const now = new Date()
      const expired = await tx.rewardAction.updateMany({
        where: {
          status: "APPROVED",
          expiresAt: { lt: now },
        },
        data: { status: "EXPIRED" },
      })

      if (expired.count > 0) {
        logger.info("Rewards: expired overdue", { count: expired.count })
      }

      return { expiredCount: expired.count }
    })
  }),
})

// ── Helpers ──

async function creditCashback(
  tx: any,
  tenantId: string,
  customerId: string,
  amount: number,
  actionId: string,
) {
  let balance = await tx.rewardBalance.findFirst({ where: { tenantId, customerId } })

  if (!balance) {
    balance = await tx.rewardBalance.create({
      data: {
        tenantId,
        customerId,
        totalBalance: new Prisma.Decimal(amount),
        availableBalance: new Prisma.Decimal(amount),
        totalCreditedHistorical: new Prisma.Decimal(amount),
        totalRewardsReceived: 1,
      },
    })
  } else {
    await tx.rewardBalance.update({
      where: { id: balance.id },
      data: {
        totalBalance: { increment: amount },
        availableBalance: { increment: amount },
        totalCreditedHistorical: { increment: amount },
        totalRewardsReceived: { increment: 1 },
      },
    })
  }

  await tx.rewardMovement.create({
    data: {
      tenantId,
      balanceId: balance.id,
      type: "credit",
      amount: new Prisma.Decimal(amount),
      description: "Cashback aprovado",
      referenceType: "reward_action",
      referenceId: actionId,
    },
  })
}

async function debitCashback(
  tx: any,
  tenantId: string,
  customerId: string,
  amount: number,
  actionId: string,
) {
  const balance = await tx.rewardBalance.findFirst({ where: { tenantId, customerId } })
  if (!balance) return

  await tx.rewardBalance.update({
    where: { id: balance.id },
    data: {
      totalBalance: { decrement: Math.min(amount, Number(balance.totalBalance)) },
      availableBalance: { decrement: Math.min(amount, Number(balance.availableBalance)) },
    },
  })

  await tx.rewardMovement.create({
    data: {
      tenantId,
      balanceId: balance.id,
      type: "debit",
      amount: new Prisma.Decimal(amount),
      description: "Cashback cancelado",
      referenceType: "reward_action",
      referenceId: actionId,
    },
  })
}
