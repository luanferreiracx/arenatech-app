/**
 * Chatbot Router — Conversation management, message history, follow-ups.
 * Faithful to Laravel ChatbotController core infrastructure.
 * The AI/bot logic is handled via webhook + configurable rules.
 */

import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { Prisma } from "@prisma/client"
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc"

export const chatbotRouter = createTRPCRouter({
  // ═══════════════════════════════════════
  // CONVERSATIONS
  // ═══════════════════════════════════════

  /** List conversations with filters */
  listConversations: tenantProcedure
    .input(z.object({
      status: z.enum(["OPEN", "BOT_ACTIVE", "HUMAN_TAKEOVER", "RESOLVED"]).optional(),
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
        if (input.search?.trim()) {
          const term = input.search.trim()
          where.OR = [
            { contactPhone: { contains: term } },
            { contactName: { contains: term, mode: "insensitive" } },
          ]
        }

        const [data, total] = await Promise.all([
          tx.chatbotConversation.findMany({
            where,
            include: {
              _count: { select: { messages: true } },
              messages: { orderBy: { createdAt: "desc" }, take: 1 },
            },
            orderBy: { lastMessageAt: "desc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.chatbotConversation.count({ where }),
        ])

        return {
          data: data.map((c) => ({
            ...c,
            messageCount: c._count.messages,
            lastMessage: c.messages[0] ?? null,
          })),
          total,
          pageCount: Math.ceil(total / pageSize),
        }
      })
    }),

  /** Get conversation by ID with messages */
  getConversation: tenantProcedure
    .input(z.object({
      id: z.string().uuid(),
      messageLimit: z.number().int().min(1).max(200).optional(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const conversation = await tx.chatbotConversation.findUnique({
          where: { id: input.id },
          include: {
            messages: {
              orderBy: { createdAt: "desc" },
              take: input.messageLimit ?? 50,
            },
          },
        })
        if (!conversation) throw new TRPCError({ code: "NOT_FOUND" })
        return {
          ...conversation,
          messages: conversation.messages.reverse(), // chronological order
        }
      })
    }),

  /** Assign agent to conversation (human takeover) */
  assignAgent: tenantProcedure
    .input(z.object({
      conversationId: z.string().uuid(),
      agentId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.chatbotConversation.update({
          where: { id: input.conversationId },
          data: {
            assignedAgentId: input.agentId,
            status: "HUMAN_TAKEOVER",
          },
        })
        return { success: true }
      })
    }),

  /** Resolve conversation */
  resolveConversation: tenantProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.chatbotConversation.update({
          where: { id: input.conversationId },
          data: {
            status: "RESOLVED",
            resolvedAt: new Date(),
          },
        })
        // Cancel pending follow-ups
        await tx.chatbotFollowUp.updateMany({
          where: { conversationId: input.conversationId, cancelled: false, executedAt: null },
          data: { cancelled: true },
        })
        return { success: true }
      })
    }),

  /** Reopen resolved conversation */
  reopenConversation: tenantProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.chatbotConversation.update({
          where: { id: input.conversationId },
          data: { status: "OPEN", resolvedAt: null },
        })
        return { success: true }
      })
    }),

  /** Send message from agent */
  sendMessage: tenantProcedure
    .input(z.object({
      conversationId: z.string().uuid(),
      content: z.string().min(1).max(4000),
      contentType: z.enum(["text", "image", "document"]).optional(),
      mediaUrl: z.string().max(500).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      // tx1: validar + criar mensagem (com status pendente de envio).
      const prep = await ctx.withTenant(async (tx) => {
        const conversation = await tx.chatbotConversation.findUnique({
          where: { id: input.conversationId },
        })
        if (!conversation) throw new TRPCError({ code: "NOT_FOUND" })

        const message = await tx.chatbotMessage.create({
          data: {
            tenantId: ctx.tenantId,
            conversationId: input.conversationId,
            direction: "outgoing",
            senderType: "agent",
            content: input.content,
            contentType: input.contentType ?? "text",
            mediaUrl: input.mediaUrl ?? null,
          },
        })

        await tx.chatbotConversation.update({
          where: { id: input.conversationId },
          data: { lastMessageAt: new Date() },
        })

        return { conversation, message }
      })

      // WhatsApp fora da tx (gap Cb1): chamada HTTP Evolution pode demorar
      // 1-5s e segurar conexao Postgres exauria pool sob carga.
      const { sendTextMessage } = await import("@/lib/services/whatsapp-service")
      await sendTextMessage(prep.conversation.contactPhone, input.content)

      return { messageId: prep.message.id }
    }),

  // ═══════════════════════════════════════
  // FOLLOW-UPS
  // ═══════════════════════════════════════

  /** List pending follow-ups */
  listFollowUps: tenantProcedure
    .input(z.object({
      conversationId: z.string().uuid().optional(),
      page: z.number().int().min(0).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const where: Record<string, unknown> = {
          cancelled: false,
          executedAt: null,
        }
        if (input.conversationId) where.conversationId = input.conversationId

        return tx.chatbotFollowUp.findMany({
          where,
          orderBy: { scheduledAt: "asc" },
          take: input.pageSize ?? 20,
          skip: (input.page ?? 0) * (input.pageSize ?? 20),
        })
      })
    }),

  /** Schedule a follow-up */
  scheduleFollowUp: tenantProcedure
    .input(z.object({
      conversationId: z.string().uuid(),
      scheduledAt: z.string(),
      templateName: z.string().max(100).optional().nullable(),
      message: z.string().max(2000).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const followUp = await tx.chatbotFollowUp.create({
          data: {
            tenantId: ctx.tenantId,
            conversationId: input.conversationId,
            scheduledAt: new Date(input.scheduledAt),
            templateName: input.templateName ?? null,
            message: input.message ?? null,
          },
        })
        return { id: followUp.id }
      })
    }),

  /** Cancel a follow-up */
  cancelFollowUp: tenantProcedure
    .input(z.object({ followUpId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.chatbotFollowUp.update({
          where: { id: input.followUpId },
          data: { cancelled: true },
        })
        return { success: true }
      })
    }),

  // ═══════════════════════════════════════
  // STATS
  // ═══════════════════════════════════════

  /** Chatbot dashboard stats */
  stats: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const [open, botActive, humanTakeover, resolved, totalMessages] = await Promise.all([
        tx.chatbotConversation.count({ where: { status: "OPEN" } }),
        tx.chatbotConversation.count({ where: { status: "BOT_ACTIVE" } }),
        tx.chatbotConversation.count({ where: { status: "HUMAN_TAKEOVER" } }),
        tx.chatbotConversation.count({ where: { status: "RESOLVED" } }),
        tx.chatbotMessage.count(),
      ])

      return { open, botActive, humanTakeover, resolved, totalMessages }
    })
  }),

  // ═══════════════════════════════════════
  // CONFIG (whitelist, horario, mensagens padrao)
  // ═══════════════════════════════════════

  getConfig: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      return (
        (await tx.chatbotConfig.findUnique({ where: { tenantId: ctx.tenantId } })) ?? {
          tenantId: ctx.tenantId,
          enabled: true,
          whitelistPhones: [],
          businessHoursStart: null,
          businessHoursEnd: null,
          greetingMessage: null,
          outOfHoursMessage: null,
          handoffMessage: null,
          followUpDelayHours: 24,
        }
      )
    })
  }),

  updateConfig: tenantProcedure
    .input(z.object({
      enabled: z.boolean().optional(),
      whitelistPhones: z.array(z.string().max(20)).optional(),
      businessHoursStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
      businessHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
      greetingMessage: z.string().max(1000).nullable().optional(),
      outOfHoursMessage: z.string().max(1000).nullable().optional(),
      handoffMessage: z.string().max(1000).nullable().optional(),
      followUpDelayHours: z.number().int().min(1).max(168).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId)?.role
      if (userRole !== "owner" && userRole !== "manager") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas gerentes e proprietários podem alterar configuração do chatbot" })
      }
      return ctx.withTenant(async (tx) => {
        const data = {
          ...input,
          whitelistPhones: input.whitelistPhones !== undefined ? (input.whitelistPhones as never) : undefined,
        }
        return tx.chatbotConfig.upsert({
          where: { tenantId: ctx.tenantId },
          create: { tenantId: ctx.tenantId, ...data },
          update: data,
        })
      })
    }),

  /**
   * Busca cliente por telefone (ultimos 9 digitos).
   * Util para o admin manualmente vincular conversation a customer.
   */
  searchCustomerByPhone: tenantProcedure
    .input(z.object({ phone: z.string().min(8) }))
    .query(async ({ ctx, input }) => {
      const digits = input.phone.replace(/\D/g, "")
      const last9 = digits.slice(-9)
      return ctx.withTenant(async (tx) => {
        const customers = await tx.customer.findMany({
          where: {
            OR: [
              { phone: { contains: last9 } },
              { phoneSecondary: { contains: last9 } },
            ],
          },
          select: { id: true, name: true, phone: true, phoneSecondary: true, cpf: true },
          take: 10,
        })
        return customers
      })
    }),

  /**
   * Vincula manualmente uma conversation a um customer existente.
   */
  linkConversationToCustomer: tenantProcedure
    .input(z.object({ conversationId: z.string().uuid(), customerId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.chatbotConversation.update({
          where: { id: input.conversationId },
          data: { customerId: input.customerId },
        })
      })
    }),
})
