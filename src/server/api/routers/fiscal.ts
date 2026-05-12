import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  listInvoicesSchema,
  createInvoiceSchema,
  createFromSaleSchema,
  createFromServiceOrderSchema,
  authorizeInvoiceSchema,
  cancelInvoiceSchema,
  correctionLetterSchema,
  invoiceStatsSchema,
} from "@/lib/validators/fiscal";
import {
  createAndAuthorizeInvoice,
  cancelInvoice as cancelInvoiceApi,
  sendCorrectionLetter,
  getInvoiceDocumentUrls,
} from "@/lib/services/fiscal-service";
import type { Prisma } from "@prisma/client";
import { buildFiscalPayload } from "@/lib/services/fiscal-payload-builder";

export const fiscalRouter = createTRPCRouter({
  // ── List ─────────────────────────────────────────────────────────────────

  list: tenantProcedure
    .input(listInvoicesSchema)
    .query(async ({ ctx, input }) => {
      const { type, status, search, referenceId, dateFrom, dateTo, page, pageSize } = input;
      const skip = page * pageSize;

      return ctx.withTenant(async (tx) => {
        const where: Prisma.InvoiceWhereInput = {
          deletedAt: null,
          ...(type ? { type } : {}),
          ...(status ? { status } : {}),
          ...(referenceId ? { referenceId } : {}),
          ...(search
            ? {
                OR: [
                  { recipientName: { contains: search, mode: "insensitive" } },
                  { recipientCpfCnpj: { contains: search } },
                  { accessKey: { contains: search } },
                  ...(isNaN(Number(search)) ? [] : [{ number: Number(search) }]),
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
          tx.invoice.findMany({
            where,
            include: { items: true },
            skip,
            take: pageSize,
            orderBy: { createdAt: "desc" },
          }),
          tx.invoice.count({ where }),
        ]);

        return { items, total, pageCount: Math.ceil(total / pageSize) };
      });
    }),

  // ── Get By Id ────────────────────────────────────────────────────────────

  getById: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const invoice = await tx.invoice.findFirst({
          where: { id: input.id, deletedAt: null },
          include: { items: true },
        });

        if (!invoice) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal não encontrada" });
        }

        return invoice;
      });
    }),

  // ── Create (manual) ─────────────────────────────────────────────────────

  create: tenantProcedure
    .input(createInvoiceSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const totalAmount = input.items.reduce(
          (sum, item) => sum + item.quantity * item.unitPrice,
          0,
        );

        // Generate next invoice number atomically
        const lastInvoice = await tx.invoice.findFirst({
          where: { type: input.type },
          orderBy: { number: "desc" },
          select: { number: true },
        });
        const nextNumber = (lastInvoice?.number ?? 0) + 1;

        const invoice = await tx.invoice.create({
          data: {
            tenantId: ctx.tenantId,
            type: input.type,
            number: nextNumber,
            recipientName: input.recipientName,
            recipientCpfCnpj: input.recipientCpfCnpj,
            totalAmount,
            createdById: ctx.session.user.id,
            items: {
              create: input.items.map((item) => ({
                tenantId: ctx.tenantId,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                total: item.quantity * item.unitPrice,
                ncm: item.ncm,
                cfop: item.cfop,
              })),
            },
          },
          include: { items: true },
        });

        return invoice;
      });
    }),

  // ── Create from Sale ────────────────────────────────────────────────────

  createFromSale: tenantProcedure
    .input(createFromSaleSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findFirst({
          where: { id: input.saleId },
          include: { items: true },
        });

        if (!sale) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Venda não encontrada" });
        }

        // Check if already has an invoice
        const existing = await tx.invoice.findFirst({
          where: {
            referenceId: sale.id,
            referenceType: "sale",
            deletedAt: null,
            status: { notIn: ["CANCELLED", "REJECTED"] },
          },
        });

        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Esta venda já possui uma nota fiscal emitida",
          });
        }

        // Fetch tenant settings for emitente data
        const settings = await tx.tenantSettings.findUnique({
          where: { tenantId: ctx.tenantId },
        });

        // Fetch customer for destinatario
        let customer: { name: string; cpf: string | null; cnpj: string | null; email: string | null; address: unknown } | null = null;
        if (sale.customerId) {
          customer = await tx.customer.findFirst({
            where: { id: sale.customerId },
            select: { name: true, cpf: true, cnpj: true, email: true, address: true },
          });
        }

        const settingsAddr = settings?.address as Record<string, string> | null;
        const custAddr = customer?.address as Record<string, string> | null;

        // Build fiscal payload
        const payload = buildFiscalPayload({
          tipo: input.type,
          emitente: {
            cnpj: settings?.cnpj ?? "",
            ie: settings?.ie ?? undefined,
            razaoSocial: settings?.legalName ?? settings?.tradeName ?? "Emitente",
            nomeFantasia: settings?.tradeName ?? undefined,
            endereco: settingsAddr
              ? { logradouro: settingsAddr.street, numero: settingsAddr.number, complemento: settingsAddr.complement, bairro: settingsAddr.neighborhood, municipio: settingsAddr.city, uf: settingsAddr.state, cep: settingsAddr.zip }
              : undefined,
          },
          destinatario: customer
            ? {
                nome: customer.name,
                cpfCnpj: customer.cnpj ?? customer.cpf ?? "",
                email: customer.email ?? undefined,
                endereco: custAddr
                  ? { logradouro: custAddr.street, numero: custAddr.number, bairro: custAddr.neighborhood, municipio: custAddr.city, uf: custAddr.state, cep: custAddr.zip }
                  : undefined,
              }
            : null,
          itens: sale.items.map((item) => ({
            descricao: item.description,
            quantidade: item.quantity,
            valorUnitario: Number(item.unitPrice),
            valorTotal: Number(item.total),
          })),
          valorTotal: Number(sale.totalAmount),
        });

        // Generate next invoice number
        const lastInvoice = await tx.invoice.findFirst({
          where: { type: input.type },
          orderBy: { number: "desc" },
          select: { number: true },
        });
        const nextNumber = (lastInvoice?.number ?? 0) + 1;

        const invoice = await tx.invoice.create({
          data: {
            tenantId: ctx.tenantId,
            type: input.type,
            number: nextNumber,
            referenceId: sale.id,
            referenceType: "sale",
            recipientName: customer?.name ?? null,
            recipientCpfCnpj: customer?.cnpj ?? customer?.cpf ?? null,
            totalAmount: sale.totalAmount,
            payload: payload as Prisma.InputJsonValue,
            createdById: ctx.session.user.id,
            items: {
              create: sale.items.map((item) => ({
                tenantId: ctx.tenantId,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                total: item.total,
              })),
            },
          },
          include: { items: true },
        });

        return invoice;
      });
    }),

  // ── Create from Service Order ───────────────────────────────────────────

  createFromServiceOrder: tenantProcedure
    .input(createFromServiceOrderSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const serviceOrder = await tx.serviceOrder.findFirst({
          where: { id: input.serviceOrderId },
          include: { items: true },
        });

        if (!serviceOrder) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Ordem de serviço não encontrada" });
        }

        // Check if already has an invoice
        const existing = await tx.invoice.findFirst({
          where: {
            referenceId: serviceOrder.id,
            referenceType: "service_order",
            deletedAt: null,
            status: { notIn: ["CANCELLED", "REJECTED"] },
          },
        });

        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Esta OS já possui uma nota fiscal emitida",
          });
        }

        const totalAmount = serviceOrder.items.reduce(
          (sum, item) => sum + Number(item.total),
          0,
        );

        // Fetch tenant settings for emitente data
        const settings = await tx.tenantSettings.findUnique({
          where: { tenantId: ctx.tenantId },
        });

        // Fetch customer for destinatario
        const customer = await tx.customer.findFirst({
          where: { id: serviceOrder.customerId },
          select: { name: true, cpf: true, cnpj: true, email: true, address: true },
        });

        const settingsAddr = settings?.address as Record<string, string> | null;
        const custAddr = customer?.address as Record<string, string> | null;

        // Build fiscal payload (NFS-e for service orders)
        const payload = buildFiscalPayload({
          tipo: "NFSE",
          emitente: {
            cnpj: settings?.cnpj ?? "",
            ie: settings?.ie ?? undefined,
            razaoSocial: settings?.legalName ?? settings?.tradeName ?? "Emitente",
            nomeFantasia: settings?.tradeName ?? undefined,
            endereco: settingsAddr
              ? { logradouro: settingsAddr.street, numero: settingsAddr.number, complemento: settingsAddr.complement, bairro: settingsAddr.neighborhood, municipio: settingsAddr.city, uf: settingsAddr.state, cep: settingsAddr.zip }
              : undefined,
          },
          destinatario: customer
            ? {
                nome: customer.name,
                cpfCnpj: customer.cnpj ?? customer.cpf ?? "",
                email: customer.email ?? undefined,
                endereco: custAddr
                  ? { logradouro: custAddr.street, numero: custAddr.number, bairro: custAddr.neighborhood, municipio: custAddr.city, uf: custAddr.state, cep: custAddr.zip }
                  : undefined,
              }
            : null,
          itens: serviceOrder.items.map((item) => ({
            descricao: item.description,
            quantidade: Number(item.quantity),
            valorUnitario: Number(item.unitPrice),
            valorTotal: Number(item.total),
          })),
          valorTotal: totalAmount,
        });

        // Generate next invoice number
        const lastInvoice = await tx.invoice.findFirst({
          where: { type: "NFSE" },
          orderBy: { number: "desc" },
          select: { number: true },
        });
        const nextNumber = (lastInvoice?.number ?? 0) + 1;

        const invoice = await tx.invoice.create({
          data: {
            tenantId: ctx.tenantId,
            type: "NFSE",
            number: nextNumber,
            referenceId: serviceOrder.id,
            referenceType: "service_order",
            recipientName: customer?.name ?? null,
            recipientCpfCnpj: customer?.cnpj ?? customer?.cpf ?? null,
            totalAmount,
            payload: payload as Prisma.InputJsonValue,
            createdById: ctx.session.user.id,
            items: {
              create: serviceOrder.items.map((item) => ({
                tenantId: ctx.tenantId,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                total: item.total,
              })),
            },
          },
          include: { items: true },
        });

        return invoice;
      });
    }),

  // ── Authorize ───────────────────────────────────────────────────────────

  authorize: tenantProcedure
    .input(authorizeInvoiceSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const invoice = await tx.invoice.findFirst({
          where: { id: input.id, deletedAt: null },
          include: { items: true },
        });

        if (!invoice) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal não encontrada" });
        }

        if (invoice.status !== "DRAFT") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Não é possível autorizar nota com status ${invoice.status}`,
          });
        }

        // Update to PENDING while processing
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { status: "PENDING" },
        });

        // Call Nuvem Fiscal API
        const payload: Record<string, unknown> = {
          ambiente: process.env.NUVEM_FISCAL_AMBIENTE ?? "homologacao",
          ...(invoice.payload as Record<string, unknown> | null ?? {}),
        };

        const result = await createAndAuthorizeInvoice(payload);

        if (result.success) {
          const updated = await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              status: "AUTHORIZED",
              providerRef: result.providerRef,
              accessKey: result.accessKey,
              providerStatus: result.status,
              authorizedAt: new Date(),
              response: result as unknown as Prisma.InputJsonValue,
            },
            include: { items: true },
          });
          return updated;
        }

        // Failed — mark as rejected
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            status: "REJECTED",
            providerStatus: "rejected",
            response: result as unknown as Prisma.InputJsonValue,
          },
        });

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.error ?? "Erro ao autorizar nota fiscal",
        });
      });
    }),

  // ── Cancel ──────────────────────────────────────────────────────────────

  cancel: tenantProcedure
    .input(cancelInvoiceSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const invoice = await tx.invoice.findFirst({
          where: { id: input.id, deletedAt: null },
        });

        if (!invoice) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal não encontrada" });
        }

        if (invoice.status !== "AUTHORIZED") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Somente notas autorizadas podem ser canceladas",
          });
        }

        if (!invoice.providerRef) {
          // Draft-only (no provider), just mark as cancelled
          return tx.invoice.update({
            where: { id: invoice.id },
            data: { status: "CANCELLED", cancelledAt: new Date() },
          });
        }

        const result = await cancelInvoiceApi(invoice.providerRef, input.reason);

        if (result.success) {
          return tx.invoice.update({
            where: { id: invoice.id },
            data: {
              status: "CANCELLED",
              cancelledAt: new Date(),
              response: result as unknown as Prisma.InputJsonValue,
            },
          });
        }

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.error ?? "Erro ao cancelar nota fiscal",
        });
      });
    }),

  // ── Correction Letter ───────────────────────────────────────────────────

  correctionLetter: tenantProcedure
    .input(correctionLetterSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const invoice = await tx.invoice.findFirst({
          where: { id: input.id, deletedAt: null },
        });

        if (!invoice) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal não encontrada" });
        }

        if (invoice.status !== "AUTHORIZED") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Somente notas autorizadas podem receber carta de correção",
          });
        }

        if (!invoice.providerRef) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nota sem referência no provedor fiscal",
          });
        }

        const result = await sendCorrectionLetter(invoice.providerRef, input.reason);

        if (result.success) {
          return tx.invoice.update({
            where: { id: invoice.id },
            data: {
              status: "CORRECTION_LETTER",
              correctionReason: input.reason,
              response: result as unknown as Prisma.InputJsonValue,
            },
          });
        }

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.error ?? "Erro ao enviar carta de correção",
        });
      });
    }),

  // ── Download PDF ────────────────────────────────────────────────────────

  downloadPdf: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const invoice = await tx.invoice.findFirst({
          where: { id: input.id, deletedAt: null },
        });

        if (!invoice) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal não encontrada" });
        }

        if (invoice.pdfUrl) {
          return { url: invoice.pdfUrl };
        }

        if (!invoice.providerRef) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nota sem referência no provedor fiscal",
          });
        }

        const urls = await getInvoiceDocumentUrls(invoice.providerRef);
        return { url: urls.pdfUrl };
      });
    }),

  // ── Download XML ────────────────────────────────────────────────────────

  downloadXml: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const invoice = await tx.invoice.findFirst({
          where: { id: input.id, deletedAt: null },
        });

        if (!invoice) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal não encontrada" });
        }

        if (invoice.xmlUrl) {
          return { url: invoice.xmlUrl };
        }

        if (!invoice.providerRef) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nota sem referência no provedor fiscal",
          });
        }

        const urls = await getInvoiceDocumentUrls(invoice.providerRef);
        return { url: urls.xmlUrl };
      });
    }),

  // ── Stats ───────────────────────────────────────────────────────────────

  stats: tenantProcedure
    .input(invoiceStatsSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const dateFilter = {
          ...(input.dateFrom || input.dateTo
            ? {
                createdAt: {
                  ...(input.dateFrom ? { gte: new Date(input.dateFrom) } : {}),
                  ...(input.dateTo ? { lte: new Date(input.dateTo) } : {}),
                },
              }
            : {}),
        };

        const [total, authorized, cancelled, rejected, byType] = await Promise.all([
          tx.invoice.count({ where: { deletedAt: null, ...dateFilter } }),
          tx.invoice.count({ where: { deletedAt: null, status: "AUTHORIZED", ...dateFilter } }),
          tx.invoice.count({ where: { deletedAt: null, status: "CANCELLED", ...dateFilter } }),
          tx.invoice.count({ where: { deletedAt: null, status: "REJECTED", ...dateFilter } }),
          tx.invoice.groupBy({
            by: ["type"],
            _count: { _all: true },
            where: { deletedAt: null, ...dateFilter },
          }),
        ]);

        const byTypeMap = Object.fromEntries(
          byType.map((g) => [g.type, g._count._all]),
        );

        return {
          total,
          authorized,
          cancelled,
          rejected,
          draft: total - authorized - cancelled - rejected,
          byType: byTypeMap,
        };
      });
    }),
});
