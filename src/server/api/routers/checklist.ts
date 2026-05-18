/**
 * Checklist Router — CRUD for device evaluation checklists.
 * Faithful to Laravel ChecklistController.
 * UI templates are in src/app/(app)/checklist/_components/checklist-templates.ts
 */

import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { Prisma } from "@prisma/client"
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc"

function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0
  return Math.round(Number(v) * 100)
}

export const checklistRouter = createTRPCRouter({
  /** List checklists with filters */
  list: tenantProcedure
    .input(z.object({
      search: z.string().optional(),
      deviceType: z.string().optional(),
      customerId: z.string().uuid().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      page: z.number().int().min(0).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const page = input.page ?? 0
        const pageSize = input.pageSize ?? 20
        const where: Record<string, unknown> = {}

        if (input.deviceType) where.deviceType = input.deviceType
        if (input.customerId) where.customerId = input.customerId
        if (input.dateFrom) where.createdAt = { ...(where.createdAt as object ?? {}), gte: new Date(input.dateFrom) }
        if (input.dateTo) where.createdAt = { ...(where.createdAt as object ?? {}), lte: new Date(input.dateTo) }

        if (input.search?.trim()) {
          const term = input.search.trim()
          where.OR = [
            { brand: { contains: term, mode: "insensitive" } },
            { model: { contains: term, mode: "insensitive" } },
            { imei: { contains: term } },
            { serialNumber: { contains: term, mode: "insensitive" } },
            { customerName: { contains: term, mode: "insensitive" } },
          ]
        }

        const [data, total] = await Promise.all([
          tx.checklist.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.checklist.count({ where }),
        ])

        return {
          data: data.map((c) => ({
            ...c,
            offeredValue: c.offeredValue ? decimalToCents(c.offeredValue) : null,
          })),
          total,
          pageCount: Math.ceil(total / pageSize),
        }
      })
    }),

  /** Get checklist by ID */
  getById: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const checklist = await tx.checklist.findUnique({ where: { id: input.id } })
        if (!checklist) throw new TRPCError({ code: "NOT_FOUND" })
        return {
          ...checklist,
          offeredValue: checklist.offeredValue ? decimalToCents(checklist.offeredValue) : null,
        }
      })
    }),

  /** Create a new checklist evaluation */
  create: tenantProcedure
    .input(z.object({
      deviceType: z.string().min(1),
      brand: z.string().max(100).optional().nullable(),
      model: z.string().max(100).optional().nullable(),
      imei: z.string().max(50).optional().nullable(),
      serialNumber: z.string().max(100).optional().nullable(),
      customerId: z.string().uuid().optional().nullable(),
      customerName: z.string().max(200).optional().nullable(),
      results: z.record(z.string(), z.unknown()),
      offeredValue: z.number().int().min(0).optional().nullable(), // centavos
      evaluatorNotes: z.string().max(5000).optional().nullable(),
      serviceOrderId: z.string().uuid().optional().nullable(),
      purchaseId: z.string().uuid().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const checklist = await tx.checklist.create({
          data: {
            tenantId: ctx.tenantId,
            userId: ctx.session.user.id,
            deviceType: input.deviceType,
            brand: input.brand ?? null,
            model: input.model ?? null,
            imei: input.imei ?? null,
            serialNumber: input.serialNumber ?? null,
            customerId: input.customerId ?? null,
            customerName: input.customerName ?? null,
            results: input.results as Prisma.InputJsonValue,
            offeredValue: input.offeredValue != null
              ? new Prisma.Decimal(input.offeredValue / 100)
              : null,
            evaluatorNotes: input.evaluatorNotes ?? null,
            serviceOrderId: input.serviceOrderId ?? null,
            purchaseId: input.purchaseId ?? null,
          },
        })

        return { id: checklist.id }
      })
    }),

  /** Update an existing checklist */
  update: tenantProcedure
    .input(z.object({
      id: z.string().uuid(),
      results: z.record(z.string(), z.unknown()).optional(),
      offeredValue: z.number().int().min(0).optional().nullable(),
      evaluatorNotes: z.string().max(5000).optional().nullable(),
      customerName: z.string().max(200).optional().nullable(),
      serviceOrderId: z.string().uuid().optional().nullable(),
      purchaseId: z.string().uuid().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.checklist.findUnique({ where: { id: input.id } })
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" })

        const data: Record<string, unknown> = {}
        if (input.results !== undefined) data.results = input.results as Prisma.InputJsonValue
        if (input.offeredValue !== undefined) {
          data.offeredValue = input.offeredValue != null
            ? new Prisma.Decimal(input.offeredValue / 100)
            : null
        }
        if (input.evaluatorNotes !== undefined) data.evaluatorNotes = input.evaluatorNotes
        if (input.customerName !== undefined) data.customerName = input.customerName
        if (input.serviceOrderId !== undefined) data.serviceOrderId = input.serviceOrderId
        if (input.purchaseId !== undefined) data.purchaseId = input.purchaseId

        await tx.checklist.update({ where: { id: input.id }, data })
        return { success: true }
      })
    }),

  /** Delete a checklist */
  delete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.checklist.findUnique({ where: { id: input.id } })
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" })
        await tx.checklist.delete({ where: { id: input.id } })
        return { success: true }
      })
    }),

  /** Search checklists by IMEI (for device history) */
  searchByImei: tenantProcedure
    .input(z.object({ imei: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.checklist.findMany({
          where: { imei: { contains: input.imei } },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      })
    }),

  /** Stats for checklist dashboard */
  stats: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

      const [total, thisMonth, byDeviceType] = await Promise.all([
        tx.checklist.count(),
        tx.checklist.count({ where: { createdAt: { gte: startOfMonth } } }),
        tx.checklist.groupBy({
          by: ["deviceType"],
          _count: true,
          orderBy: { _count: { deviceType: "desc" } },
          take: 10,
        }),
      ])

      return {
        total,
        thisMonth,
        byDeviceType: byDeviceType.map((g) => ({
          deviceType: g.deviceType,
          count: g._count,
        })),
      }
    })
  }),
})
