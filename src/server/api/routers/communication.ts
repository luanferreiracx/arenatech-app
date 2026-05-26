import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  sendMessageSchema,
  sendToCustomerSchema,
  listMessagesSchema,
  createTemplateSchema,
  updateTemplateSchema,
} from "@/lib/validators/communication";
import { sendTextMessage, sendTemplateMessage } from "@/lib/services/whatsapp-service";
import { sendEmail } from "@/lib/services/email-service";
import { logger } from "@/lib/logger";

/**
 * Helper: despacha mensagem por canal e retorna resultado normalizado.
 * Chamado FORA de qualquer tx (HTTP/SMTP pode demorar varios segundos).
 */
async function dispatchMessage(
  channel: string,
  recipientPhone: string | null,
  recipientEmail: string | null,
  subject: string | null,
  body: string,
): Promise<{ success: boolean; providerMessageId?: string; error?: string }> {
  try {
    if (channel === "WHATSAPP" && recipientPhone) {
      const r = await sendTextMessage(recipientPhone, body);
      return { success: r.success, providerMessageId: r.messageId, error: r.error };
    }
    if (channel === "EMAIL" && recipientEmail) {
      const r = await sendEmail(recipientEmail, subject ?? "Mensagem Arena Tech", body);
      return { success: r.success, providerMessageId: r.messageId, error: r.error };
    }
    return { success: false, error: "Canal ou destinatario invalido" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}

export const communicationRouter = createTRPCRouter({
  // ═══════════════════════════════════════
  // MESSAGES
  // ═══════════════════════════════════════

  /** List messages with filters */
  list: tenantProcedure
    .input(listMessagesSchema)
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 0;
      const pageSize = input.pageSize ?? 20;

      return ctx.withTenant(async (tx) => {
        const where: Prisma.MessageWhereInput = {};
        if (input.channel) where.channel = input.channel;
        if (input.status) where.status = input.status;
        if (input.direction) where.direction = input.direction;
        if (input.search) {
          where.OR = [
            { recipientName: { contains: input.search, mode: "insensitive" } },
            { recipientPhone: { contains: input.search } },
            { recipientEmail: { contains: input.search, mode: "insensitive" } },
            { body: { contains: input.search, mode: "insensitive" } },
          ];
        }
        if (input.dateFrom || input.dateTo) {
          const createdAt: Record<string, Date> = {};
          if (input.dateFrom) createdAt.gte = new Date(input.dateFrom);
          if (input.dateTo) {
            const end = new Date(input.dateTo);
            end.setHours(23, 59, 59, 999);
            createdAt.lte = end;
          }
          where.createdAt = createdAt;
        }

        const [data, total] = await Promise.all([
          tx.message.findMany({
            where,
            orderBy: { [input.sortBy ?? "createdAt"]: input.sortOrder ?? "desc" },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.message.count({ where }),
        ]);

        return { data, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  /** Get message by ID */
  getById: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const message = await tx.message.findUnique({ where: { id: input.id } });
        if (!message) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Mensagem nao encontrada" });
        }
        return message;
      });
    }),

  /** Send a message — HTTP/SMTP fora da tx (gap Co1). */
  send: tenantProcedure
    .input(sendMessageSchema)
    .mutation(async ({ ctx, input }) => {
      // tx1: cria Message PENDING.
      const message = await ctx.withTenant(async (tx) =>
        tx.message.create({
          data: {
            tenantId: ctx.tenantId,
            channel: input.channel,
            direction: "OUTBOUND",
            status: "PENDING",
            recipientPhone: input.recipientPhone ?? null,
            recipientEmail: input.recipientEmail ?? null,
            recipientName: input.recipientName ?? null,
            subject: input.subject ?? null,
            body: input.body,
            referenceId: input.referenceId ?? null,
            referenceType: input.referenceType ?? null,
            createdById: ctx.session.user.id,
          },
        }),
      );

      // Envio fora da tx (HTTP/SMTP pode levar varios segundos).
      const result = await dispatchMessage(
        input.channel,
        input.channel === "WHATSAPP" ? input.recipientPhone ?? null : null,
        input.channel === "EMAIL" ? input.recipientEmail ?? null : null,
        input.subject ?? null,
        input.body,
      );

      // tx2: aplicar resultado.
      await ctx.withTenant(async (tx) => {
        await tx.message.update({
          where: { id: message.id },
          data: {
            status: result.success ? "SENT" : "FAILED",
            providerMessageId: result.providerMessageId ?? null,
            errorMessage: result.error ?? null,
            sentAt: result.success ? new Date() : null,
          },
        });
      });

      return { id: message.id };
    }),

  /** Send message to a customer — HTTP/SMTP fora da tx. */
  sendToCustomer: tenantProcedure
    .input(sendToCustomerSchema)
    .mutation(async ({ ctx, input }) => {
      const prep = await ctx.withTenant(async (tx) => {
        const customer = await tx.customer.findUnique({
          where: { id: input.customerId },
          select: { name: true, phone: true, email: true, unsubscribed: true },
        });
        if (!customer) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cliente nao encontrado" });
        }

        // LGPD: opt-out check
        if (customer.unsubscribed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Cliente optou por nao receber comunicacoes (unsubscribe).",
          });
        }

        const recipient = input.channel === "EMAIL" ? customer.email : customer.phone;
        if (!recipient) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cliente nao possui ${input.channel === "EMAIL" ? "e-mail" : "telefone"} cadastrado`,
          });
        }

        const message = await tx.message.create({
          data: {
            tenantId: ctx.tenantId,
            channel: input.channel,
            direction: "OUTBOUND",
            status: "PENDING",
            recipientPhone: input.channel === "WHATSAPP" ? customer.phone : null,
            recipientEmail: input.channel === "EMAIL" ? customer.email : null,
            recipientName: customer.name,
            subject: input.subject ?? null,
            body: input.body,
            referenceId: input.referenceId ?? null,
            referenceType: input.referenceType ?? null,
            createdById: ctx.session.user.id,
          },
        });
        return { customer, message };
      });

      const result = await dispatchMessage(
        input.channel,
        input.channel === "WHATSAPP" ? prep.customer.phone : null,
        input.channel === "EMAIL" ? prep.customer.email : null,
        input.subject ?? null,
        input.body,
      );

      await ctx.withTenant(async (tx) => {
        await tx.message.update({
          where: { id: prep.message.id },
          data: {
            status: result.success ? "SENT" : "FAILED",
            providerMessageId: result.providerMessageId ?? null,
            errorMessage: result.error ?? null,
            sentAt: result.success ? new Date() : null,
          },
        });
      });

      return { id: prep.message.id };
    }),

  /** Resend a failed message — HTTP/SMTP fora da tx. */
  resend: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const message = await ctx.withTenant(async (tx) => {
        const m = await tx.message.findUnique({ where: { id: input.id } });
        if (!m) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Mensagem nao encontrada" });
        }
        if (m.status !== "FAILED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas mensagens com falha podem ser reenviadas" });
        }
        return m;
      });

      const result = await dispatchMessage(
        message.channel,
        message.recipientPhone,
        message.recipientEmail,
        message.subject,
        message.body,
      );

      await ctx.withTenant(async (tx) => {
        await tx.message.update({
          where: { id: message.id },
          data: {
            status: result.success ? "SENT" : "FAILED",
            providerMessageId: result.providerMessageId ?? null,
            errorMessage: result.error ?? null,
            sentAt: result.success ? new Date() : null,
          },
        });
      });

      return { success: true };
    }),

  // ═══════════════════════════════════════
  // QUICK ACTIONS (OS-related notifications)
  // ═══════════════════════════════════════

  /** Notify customer that OS is completed — WhatsApp fora da tx. */
  notifyOsCompleted: tenantProcedure
    .input(z.object({ serviceOrderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const prep = await ctx.withTenant(async (tx) => {
        const so = await tx.serviceOrder.findUnique({
          where: { id: input.serviceOrderId },
        });
        if (!so || !so.customerId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "OS ou cliente nao encontrado" });
        }

        const customer = await tx.customer.findUnique({
          where: { id: so.customerId },
          select: { name: true, phone: true },
        });
        if (!customer?.phone) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cliente sem telefone cadastrado" });
        }

        const template = await tx.messageTemplate.findUnique({
          where: { tenantId_slug: { tenantId: ctx.tenantId, slug: "os-completed" } },
        });

        const body = template
          ? template.body
              .replace(/\{\{customer_name\}\}/g, customer.name)
              .replace(/\{\{os_number\}\}/g, so.number)
          : `Ola ${customer.name}! Sua ordem de servico ${so.number} foi concluida. Entre em contato para retirada.`;

        return { customerPhone: customer.phone, customerName: customer.name, body };
      });

      const result = await sendTextMessage(prep.customerPhone, prep.body);

      await ctx.withTenant(async (tx) => {
        await tx.message.create({
          data: {
            tenantId: ctx.tenantId,
            channel: "WHATSAPP",
            direction: "OUTBOUND",
            status: result.success ? "SENT" : "FAILED",
            recipientPhone: prep.customerPhone,
            recipientName: prep.customerName,
            body: prep.body,
            templateName: "os-completed",
            referenceId: input.serviceOrderId,
            referenceType: "SERVICE_ORDER",
            providerMessageId: result.messageId ?? null,
            errorMessage: result.error ?? null,
            sentAt: result.success ? new Date() : null,
            createdById: ctx.session.user.id,
          },
        });
      });

      return { success: result.success };
    }),

  /** Notify customer of OS status change — WhatsApp fora da tx. */
  notifyOsStatusChanged: tenantProcedure
    .input(z.object({ serviceOrderId: z.string().uuid(), newStatus: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const prep = await ctx.withTenant(async (tx) => {
        const so = await tx.serviceOrder.findUnique({
          where: { id: input.serviceOrderId },
        });
        if (!so || !so.customerId) return null;

        const customer = await tx.customer.findUnique({
          where: { id: so.customerId },
          select: { name: true, phone: true },
        });
        if (!customer?.phone) return null;

        const body = `Ola ${customer.name}! O status da sua OS ${so.number} foi atualizado para: ${input.newStatus}.`;
        return { customerPhone: customer.phone, customerName: customer.name, body };
      });

      if (!prep) return { success: false };

      const result = await sendTextMessage(prep.customerPhone, prep.body);

      await ctx.withTenant(async (tx) => {
        await tx.message.create({
          data: {
            tenantId: ctx.tenantId,
            channel: "WHATSAPP",
            direction: "OUTBOUND",
            status: result.success ? "SENT" : "FAILED",
            recipientPhone: prep.customerPhone,
            recipientName: prep.customerName,
            body: prep.body,
            referenceId: input.serviceOrderId,
            referenceType: "SERVICE_ORDER",
            providerMessageId: result.messageId ?? null,
            sentAt: result.success ? new Date() : null,
            createdById: ctx.session.user.id,
          },
        });
      });

      return { success: result.success };
    }),

  // ═══════════════════════════════════════
  // TEMPLATES
  // ═══════════════════════════════════════

  /** List templates */
  listTemplates: tenantProcedure
    .input(z.object({
      channel: z.enum(["WHATSAPP", "EMAIL"]).optional(),
      active: z.boolean().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const where: { channel?: "WHATSAPP" | "EMAIL"; active?: boolean } = {};
        if (input?.channel) where.channel = input.channel;
        if (input?.active !== undefined) where.active = input.active;
        return tx.messageTemplate.findMany({
          where,
          orderBy: { name: "asc" },
        });
      });
    }),

  /** Create template */
  createTemplate: tenantProcedure
    .input(createTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const template = await tx.messageTemplate.create({
          data: {
            tenantId: ctx.tenantId,
            channel: input.channel,
            name: input.name,
            slug: input.slug,
            body: input.body,
          },
        });
        return { id: template.id };
      });
    }),

  /** Update template */
  updateTemplate: tenantProcedure
    .input(updateTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.messageTemplate.findUnique({ where: { id: input.id } });
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Template nao encontrado" });
        }
        await tx.messageTemplate.update({
          where: { id: input.id },
          data: {
            name: input.name,
            body: input.body,
            active: input.active,
          },
        });
        return { success: true };
      });
    }),

  /** Delete template */
  deleteTemplate: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.messageTemplate.delete({ where: { id: input.id } });
        return { success: true };
      });
    }),

  // ═══════════════════════════════════════
  // OPT-OUT (LGPD)
  // ═══════════════════════════════════════

  /** Unsubscribe customer from notifications */
  unsubscribeCustomer: tenantProcedure
    .input(z.object({ customerId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.customer.update({
          where: { id: input.customerId },
          data: { unsubscribed: true, unsubscribedAt: new Date() },
        });
      });
    }),

  /** Resubscribe customer to notifications */
  resubscribeCustomer: tenantProcedure
    .input(z.object({ customerId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        return tx.customer.update({
          where: { id: input.customerId },
          data: { unsubscribed: false, unsubscribedAt: null },
        });
      });
    }),
});
