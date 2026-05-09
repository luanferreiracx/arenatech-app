import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  listMessagesSchema,
  sendMessageSchema,
  sendToCustomerSchema,
  notifyOsSchema,
  listTemplatesSchema,
  createTemplateSchema,
  updateTemplateSchema,
} from "@/lib/validators/communication";
import { sendTextMessage } from "@/lib/services/whatsapp-service";
import { sendEmail } from "@/lib/services/email-service";
import type { Prisma } from "@prisma/client";

export const communicationRouter = createTRPCRouter({
  // ── List Messages ───────────────────────────────────────────────────────

  list: tenantProcedure
    .input(listMessagesSchema)
    .query(async ({ ctx, input }) => {
      const { channel, status, search, referenceId, dateFrom, dateTo, page, pageSize } = input;
      const skip = page * pageSize;

      return ctx.withTenant(async (tx) => {
        const where: Prisma.MessageWhereInput = {
          ...(channel ? { channel } : {}),
          ...(status ? { status } : {}),
          ...(referenceId ? { referenceId } : {}),
          ...(search
            ? {
                OR: [
                  { recipientName: { contains: search, mode: "insensitive" } },
                  { recipientPhone: { contains: search } },
                  { recipientEmail: { contains: search, mode: "insensitive" } },
                  { body: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
          ...(dateFrom || dateTo
            ? {
                createdAt: {
                  ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                  ...(dateTo ? { lte: new Date(dateTo) } : {}),
                },
              }
            : {}),
        };

        const [items, total] = await Promise.all([
          tx.message.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { createdAt: "desc" },
          }),
          tx.message.count({ where }),
        ]);

        return { items, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  // ── Get By Id ───────────────────────────────────────────────────────────

  getById: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const message = await tx.message.findFirst({
          where: { id: input.id },
        });

        if (!message) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Mensagem não encontrada" });
        }

        return message;
      });
    }),

  // ── Send Message ────────────────────────────────────────────────────────

  send: tenantProcedure
    .input(sendMessageSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        // Create message record
        const message = await tx.message.create({
          data: {
            tenantId: ctx.tenantId,
            channel: input.channel,
            direction: "OUTBOUND",
            status: "PENDING",
            recipientPhone: input.recipientPhone,
            recipientEmail: input.recipientEmail,
            recipientName: input.recipientName,
            subject: input.subject,
            body: input.body,
            templateName: input.templateName,
            templateParams: input.templateParams as Prisma.InputJsonValue | undefined,
            referenceId: input.referenceId,
            referenceType: input.referenceType,
            createdById: ctx.session.user.id,
          },
        });

        // Dispatch based on channel
        try {
          if (input.channel === "WHATSAPP") {
            if (!input.recipientPhone) {
              throw new Error("Telefone obrigatório para WhatsApp");
            }
            const result = await sendTextMessage(input.recipientPhone, input.body);
            if (result.success) {
              return tx.message.update({
                where: { id: message.id },
                data: {
                  status: "SENT",
                  providerMessageId: result.messageId,
                  sentAt: new Date(),
                },
              });
            }
            return tx.message.update({
              where: { id: message.id },
              data: {
                status: "FAILED",
                errorMessage: result.error,
              },
            });
          }

          if (input.channel === "EMAIL") {
            if (!input.recipientEmail) {
              throw new Error("E-mail obrigatório para canal Email");
            }
            const result = await sendEmail(
              input.recipientEmail,
              input.subject ?? "Mensagem Arena Tech",
              input.body,
            );
            if (result.success) {
              return tx.message.update({
                where: { id: message.id },
                data: {
                  status: "SENT",
                  providerMessageId: result.messageId,
                  sentAt: new Date(),
                },
              });
            }
            return tx.message.update({
              where: { id: message.id },
              data: {
                status: "FAILED",
                errorMessage: result.error,
              },
            });
          }

          // SMS placeholder
          return tx.message.update({
            where: { id: message.id },
            data: {
              status: "FAILED",
              errorMessage: "Canal SMS ainda não implementado",
            },
          });
        } catch (error) {
          return tx.message.update({
            where: { id: message.id },
            data: {
              status: "FAILED",
              errorMessage: error instanceof Error ? error.message : "Erro ao enviar mensagem",
            },
          });
        }
      });
    }),

  // ── Send to Customer ────────────────────────────────────────────────────

  sendToCustomer: tenantProcedure
    .input(sendToCustomerSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const customer = await tx.customer.findFirst({
          where: { id: input.customerId, deletedAt: null },
        });

        if (!customer) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Cliente não encontrado" });
        }

        const recipientPhone = input.channel === "WHATSAPP" ? customer.phone : undefined;
        const recipientEmail = input.channel === "EMAIL" ? customer.email : undefined;

        if (input.channel === "WHATSAPP" && !recipientPhone) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cliente não possui telefone cadastrado",
          });
        }

        if (input.channel === "EMAIL" && !recipientEmail) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cliente não possui e-mail cadastrado",
          });
        }

        // Create message record
        const message = await tx.message.create({
          data: {
            tenantId: ctx.tenantId,
            channel: input.channel,
            direction: "OUTBOUND",
            status: "PENDING",
            recipientPhone: recipientPhone ?? null,
            recipientEmail: recipientEmail ?? null,
            recipientName: customer.name,
            subject: input.subject,
            body: input.body,
            referenceId: input.referenceId,
            referenceType: input.referenceType,
            createdById: ctx.session.user.id,
          },
        });

        try {
          if (input.channel === "WHATSAPP" && recipientPhone) {
            const result = await sendTextMessage(recipientPhone, input.body);
            if (result.success) {
              return tx.message.update({
                where: { id: message.id },
                data: {
                  status: "SENT",
                  providerMessageId: result.messageId,
                  sentAt: new Date(),
                },
              });
            }
            return tx.message.update({
              where: { id: message.id },
              data: { status: "FAILED", errorMessage: result.error },
            });
          }

          if (input.channel === "EMAIL" && recipientEmail) {
            const result = await sendEmail(
              recipientEmail,
              input.subject ?? "Mensagem Arena Tech",
              input.body,
            );
            if (result.success) {
              return tx.message.update({
                where: { id: message.id },
                data: {
                  status: "SENT",
                  providerMessageId: result.messageId,
                  sentAt: new Date(),
                },
              });
            }
            return tx.message.update({
              where: { id: message.id },
              data: { status: "FAILED", errorMessage: result.error },
            });
          }

          return message;
        } catch (error) {
          return tx.message.update({
            where: { id: message.id },
            data: {
              status: "FAILED",
              errorMessage: error instanceof Error ? error.message : "Erro ao enviar",
            },
          });
        }
      });
    }),

  // ── Resend ──────────────────────────────────────────────────────────────

  resend: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const original = await tx.message.findFirst({
          where: { id: input.id },
        });

        if (!original) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Mensagem não encontrada" });
        }

        if (original.status !== "FAILED") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Somente mensagens com falha podem ser reenviadas",
          });
        }

        // Create a new message as resend
        const newMessage = await tx.message.create({
          data: {
            tenantId: ctx.tenantId,
            channel: original.channel,
            direction: "OUTBOUND",
            status: "PENDING",
            recipientPhone: original.recipientPhone,
            recipientEmail: original.recipientEmail,
            recipientName: original.recipientName,
            subject: original.subject,
            body: original.body,
            templateName: original.templateName,
            templateParams: original.templateParams ?? undefined,
            referenceId: original.referenceId,
            referenceType: original.referenceType,
            createdById: ctx.session.user.id,
          },
        });

        try {
          if (original.channel === "WHATSAPP" && original.recipientPhone) {
            const result = await sendTextMessage(original.recipientPhone, original.body);
            return tx.message.update({
              where: { id: newMessage.id },
              data: result.success
                ? { status: "SENT", providerMessageId: result.messageId, sentAt: new Date() }
                : { status: "FAILED", errorMessage: result.error },
            });
          }

          if (original.channel === "EMAIL" && original.recipientEmail) {
            const result = await sendEmail(
              original.recipientEmail,
              original.subject ?? "Mensagem Arena Tech",
              original.body,
            );
            return tx.message.update({
              where: { id: newMessage.id },
              data: result.success
                ? { status: "SENT", providerMessageId: result.messageId, sentAt: new Date() }
                : { status: "FAILED", errorMessage: result.error },
            });
          }

          return newMessage;
        } catch (error) {
          return tx.message.update({
            where: { id: newMessage.id },
            data: {
              status: "FAILED",
              errorMessage: error instanceof Error ? error.message : "Erro ao reenviar",
            },
          });
        }
      });
    }),

  // ── Notify OS Completed ─────────────────────────────────────────────────

  notifyOsCompleted: tenantProcedure
    .input(notifyOsSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const serviceOrder = await tx.serviceOrder.findFirst({
          where: { id: input.serviceOrderId },
        });

        if (!serviceOrder) {
          throw new TRPCError({ code: "NOT_FOUND", message: "OS não encontrada" });
        }

        if (!serviceOrder.customerId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "OS não possui cliente vinculado",
          });
        }

        const customer = await tx.customer.findFirst({
          where: { id: serviceOrder.customerId, deletedAt: null },
        });

        if (!customer?.phone) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cliente não possui telefone cadastrado",
          });
        }

        // Find template
        const template = await tx.messageTemplate.findFirst({
          where: { slug: "os_concluida", active: true },
        });

        const body = template
          ? template.body
              .replace(/\{\{nome\}\}/g, customer.name)
              .replace(/\{\{numero_os\}\}/g, serviceOrder.number ?? "")
              .replace(/\{\{equipamento\}\}/g, String(serviceOrder.deviceBrand ?? "") + " " + String(serviceOrder.deviceModel ?? ""))
          : `Olá ${customer.name}, sua OS ${serviceOrder.number ?? ""} foi concluída. Seu equipamento está pronto para retirada.`;

        const message = await tx.message.create({
          data: {
            tenantId: ctx.tenantId,
            channel: "WHATSAPP",
            direction: "OUTBOUND",
            status: "PENDING",
            recipientPhone: customer.phone,
            recipientName: customer.name,
            body,
            templateName: "os_concluida",
            referenceId: serviceOrder.id,
            referenceType: "service_order",
            createdById: ctx.session.user.id,
          },
        });

        const result = await sendTextMessage(customer.phone, body);

        return tx.message.update({
          where: { id: message.id },
          data: result.success
            ? { status: "SENT", providerMessageId: result.messageId, sentAt: new Date() }
            : { status: "FAILED", errorMessage: result.error },
        });
      });
    }),

  // ── Notify OS Status Changed ────────────────────────────────────────────

  notifyOsStatusChanged: tenantProcedure
    .input(notifyOsSchema.extend({ status: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const serviceOrder = await tx.serviceOrder.findFirst({
          where: { id: input.serviceOrderId },
        });

        if (!serviceOrder?.customerId) {
          return null; // Silently skip if no customer
        }

        const customer = await tx.customer.findFirst({
          where: { id: serviceOrder.customerId, deletedAt: null },
        });

        if (!customer?.phone) {
          return null; // Silently skip if no phone
        }

        const template = await tx.messageTemplate.findFirst({
          where: { slug: "os_status", active: true },
        });

        const body = template
          ? template.body
              .replace(/\{\{nome\}\}/g, customer.name)
              .replace(/\{\{numero_os\}\}/g, serviceOrder.number ?? "")
              .replace(/\{\{status\}\}/g, input.status)
          : `Olá ${customer.name}, sua OS ${serviceOrder.number ?? ""} teve o status atualizado para ${input.status}.`;

        const message = await tx.message.create({
          data: {
            tenantId: ctx.tenantId,
            channel: "WHATSAPP",
            direction: "OUTBOUND",
            status: "PENDING",
            recipientPhone: customer.phone,
            recipientName: customer.name,
            body,
            templateName: "os_status",
            referenceId: serviceOrder.id,
            referenceType: "service_order",
            createdById: ctx.session.user.id,
          },
        });

        const result = await sendTextMessage(customer.phone, body);

        return tx.message.update({
          where: { id: message.id },
          data: result.success
            ? { status: "SENT", providerMessageId: result.messageId, sentAt: new Date() }
            : { status: "FAILED", errorMessage: result.error },
        });
      });
    }),

  // ── Send OS Receipt ─────────────────────────────────────────────────────

  sendOsReceipt: tenantProcedure
    .input(z.object({ serviceOrderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const serviceOrder = await tx.serviceOrder.findFirst({
          where: { id: input.serviceOrderId },
          include: { items: true },
        });

        if (!serviceOrder?.customerId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "OS não possui cliente vinculado" });
        }

        const customer = await tx.customer.findFirst({
          where: { id: serviceOrder.customerId, deletedAt: null },
        });

        if (!customer?.phone) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cliente não possui telefone cadastrado",
          });
        }

        const totalItems = serviceOrder.items.reduce(
          (sum, item) => sum + Number(item.total),
          0,
        );
        const valorFormatado = totalItems.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });

        const body = `Recibo OS ${serviceOrder.number ?? ""}\n\nCliente: ${customer.name}\nValor: ${valorFormatado}\n\nArena Tech - Obrigado pela preferência!`;

        const message = await tx.message.create({
          data: {
            tenantId: ctx.tenantId,
            channel: "WHATSAPP",
            direction: "OUTBOUND",
            status: "PENDING",
            recipientPhone: customer.phone,
            recipientName: customer.name,
            body,
            referenceId: serviceOrder.id,
            referenceType: "service_order",
            createdById: ctx.session.user.id,
          },
        });

        const result = await sendTextMessage(customer.phone, body);

        return tx.message.update({
          where: { id: message.id },
          data: result.success
            ? { status: "SENT", providerMessageId: result.messageId, sentAt: new Date() }
            : { status: "FAILED", errorMessage: result.error },
        });
      });
    }),

  // ── Send Sale Receipt ───────────────────────────────────────────────────

  sendSaleReceipt: tenantProcedure
    .input(z.object({ saleId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findFirst({
          where: { id: input.saleId },
        });

        if (!sale) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Venda não encontrada" });
        }

        if (!sale.customerId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Venda não possui cliente vinculado" });
        }

        const customer = await tx.customer.findFirst({
          where: { id: sale.customerId, deletedAt: null },
        });

        if (!customer?.phone) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cliente não possui telefone cadastrado",
          });
        }

        const template = await tx.messageTemplate.findFirst({
          where: { slug: "venda_recibo", active: true },
        });

        const valorFormatado = Number(sale.totalAmount).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });

        const body = template
          ? template.body
              .replace(/\{\{nome\}\}/g, customer.name)
              .replace(/\{\{numero_venda\}\}/g, sale.number ?? "")
              .replace(/\{\{valor\}\}/g, valorFormatado)
          : `Olá ${customer.name}, segue o recibo da sua compra #${sale.number ?? ""} no valor de ${valorFormatado}.`;

        const message = await tx.message.create({
          data: {
            tenantId: ctx.tenantId,
            channel: "WHATSAPP",
            direction: "OUTBOUND",
            status: "PENDING",
            recipientPhone: customer.phone,
            recipientName: customer.name,
            body,
            templateName: "venda_recibo",
            referenceId: sale.id,
            referenceType: "sale",
            createdById: ctx.session.user.id,
          },
        });

        const result = await sendTextMessage(customer.phone, body);

        return tx.message.update({
          where: { id: message.id },
          data: result.success
            ? { status: "SENT", providerMessageId: result.messageId, sentAt: new Date() }
            : { status: "FAILED", errorMessage: result.error },
        });
      });
    }),

  // ── List Templates ──────────────────────────────────────────────────────

  listTemplates: tenantProcedure
    .input(listTemplatesSchema)
    .query(async ({ ctx, input }) => {
      const { channel, active, page, pageSize } = input;
      const skip = page * pageSize;

      return ctx.withTenant(async (tx) => {
        const where: Prisma.MessageTemplateWhereInput = {
          ...(channel ? { channel } : {}),
          ...(active !== undefined ? { active } : {}),
        };

        const [items, total] = await Promise.all([
          tx.messageTemplate.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: { name: "asc" },
          }),
          tx.messageTemplate.count({ where }),
        ]);

        return { items, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  // ── Create Template ─────────────────────────────────────────────────────

  createTemplate: tenantProcedure
    .input(createTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        // Check slug uniqueness
        const existing = await tx.messageTemplate.findFirst({
          where: { slug: input.slug },
        });

        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Já existe um template com este slug",
          });
        }

        return tx.messageTemplate.create({
          data: {
            tenantId: ctx.tenantId,
            ...input,
          },
        });
      });
    }),

  // ── Update Template ─────────────────────────────────────────────────────

  updateTemplate: tenantProcedure
    .input(updateTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.withTenant(async (tx) => {
        const existing = await tx.messageTemplate.findFirst({
          where: { id },
        });

        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Template não encontrado" });
        }

        return tx.messageTemplate.update({
          where: { id },
          data,
        });
      });
    }),

  // ── Delete Template ─────────────────────────────────────────────────────

  deleteTemplate: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.messageTemplate.findFirst({
          where: { id: input.id },
        });

        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Template não encontrado" });
        }

        await tx.messageTemplate.delete({ where: { id: input.id } });
        return { success: true };
      });
    }),
});
