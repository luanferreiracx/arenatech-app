import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import {
  createInvoiceSchema,
  createFromSaleSchema,
  createFromServiceOrderSchema,
  authorizeInvoiceSchema,
  cancelInvoiceSchema,
  correctionLetterSchema,
  listInvoicesSchema,
  updateInvoiceSchema,
  addInvoiceItemSchema,
  removeInvoiceItemSchema,
  inutilizarSchema,
  createEntradaSchema,
  sendInvoiceEmailSchema,
} from "@/lib/validators/fiscal";
import {
  createAndAuthorizeInvoice,
  cancelInvoice as cancelInvoiceService,
  sendCorrectionLetter,
  getInvoiceDocumentUrls,
} from "@/lib/services/fiscal-service";
import { sendEmail } from "@/lib/services/email-service";
import { logger } from "@/lib/logger";

// ── Helpers ──

function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Number(v) * 100);
}

function centsToPrisma(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(cents / 100);
}

export const fiscalRouter = createTRPCRouter({
  /** List invoices with filters */
  list: tenantProcedure
    .input(listInvoicesSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const page = input.page ?? 0;
        const pageSize = input.pageSize ?? 20;
        const sortBy = input.sortBy ?? "createdAt";
        const sortOrder = input.sortOrder ?? "desc";

        const where: Prisma.InvoiceWhereInput = { deletedAt: null };

        if (input.type) where.type = input.type;
        if (input.status) where.status = input.status;
        if (input.search) {
          where.OR = [
            { recipientName: { contains: input.search, mode: "insensitive" } },
            { recipientCpfCnpj: { contains: input.search, mode: "insensitive" } },
            { accessKey: { contains: input.search, mode: "insensitive" } },
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
          tx.invoice.findMany({
            where,
            include: { items: true },
            orderBy: { [sortBy]: sortOrder },
            skip: page * pageSize,
            take: pageSize,
          }),
          tx.invoice.count({ where }),
        ]);

        return {
          data: data.map((inv) => ({
            ...inv,
            totalAmount: decimalToCents(inv.totalAmount),
            items: inv.items.map((item) => ({
              ...item,
              quantity: Number(item.quantity),
              unitPrice: decimalToCents(item.unitPrice),
              total: decimalToCents(item.total),
            })),
          })),
          total,
          pageCount: Math.ceil(total / pageSize),
        };
      });
    }),

  /** Get invoice by ID */
  getById: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const invoice = await tx.invoice.findFirst({
          where: { id: input.id, deletedAt: null },
          include: { items: true },
        });
        if (!invoice) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal nao encontrada" });
        }
        return {
          ...invoice,
          totalAmount: decimalToCents(invoice.totalAmount),
          items: invoice.items.map((item) => ({
            ...item,
            quantity: Number(item.quantity),
            unitPrice: decimalToCents(item.unitPrice),
            total: decimalToCents(item.total),
          })),
        };
      });
    }),

  /** Create invoice manually */
  create: tenantProcedure
    .input(createInvoiceSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const totalCents = input.items.reduce(
          (sum, item) => sum + Math.round(item.quantity * item.unitPrice),
          0,
        );

        const invoice = await tx.invoice.create({
          data: {
            tenantId: ctx.tenantId,
            type: input.type,
            status: "DRAFT",
            recipientName: input.recipientName,
            recipientCpfCnpj: input.recipientCpfCnpj,
            totalAmount: centsToPrisma(totalCents),
            referenceId: input.referenceId ?? null,
            referenceType: input.referenceType ?? null,
            createdById: ctx.session.user.id,
            items: {
              create: input.items.map((item) => ({
                tenantId: ctx.tenantId,
                description: item.description,
                quantity: new Prisma.Decimal(item.quantity),
                unitPrice: centsToPrisma(item.unitPrice),
                total: centsToPrisma(Math.round(item.quantity * item.unitPrice)),
                ncm: item.ncm ?? null,
                cfop: item.cfop ?? null,
              })),
            },
          },
          include: { items: true },
        });

        logger.info("Invoice created", { invoiceId: invoice.id, type: input.type });
        return { id: invoice.id };
      });
    }),

  /** Create invoice from sale */
  createFromSale: tenantProcedure
    .input(createFromSaleSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const sale = await tx.sale.findFirst({
          where: { id: input.saleId, deletedAt: null, status: "COMPLETED" },
          include: { items: true },
        });
        if (!sale) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Venda nao encontrada ou nao finalizada" });
        }

        // Fetch customer for recipient info
        let recipientName = "Consumidor Final";
        let recipientCpfCnpj = "";
        if (sale.customerId) {
          const customer = await tx.customer.findUnique({
            where: { id: sale.customerId },
            select: { name: true, cpf: true, cnpj: true },
          });
          if (customer) {
            recipientName = customer.name;
            recipientCpfCnpj = customer.cnpj ?? customer.cpf ?? "";
          }
        }

        const invoice = await tx.invoice.create({
          data: {
            tenantId: ctx.tenantId,
            type: input.type,
            status: "DRAFT",
            recipientName,
            recipientCpfCnpj,
            totalAmount: sale.totalAmount,
            referenceId: sale.id,
            referenceType: "SALE",
            createdById: ctx.session.user.id,
            items: {
              create: sale.items.map((item) => ({
                tenantId: ctx.tenantId,
                description: item.description,
                quantity: new Prisma.Decimal(item.quantity),
                unitPrice: item.unitPrice,
                total: item.total,
              })),
            },
          },
        });

        return { id: invoice.id };
      });
    }),

  /** Create invoice from service order */
  createFromServiceOrder: tenantProcedure
    .input(createFromServiceOrderSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const so = await tx.serviceOrder.findFirst({
          where: { id: input.serviceOrderId, deletedAt: null },
          include: { items: true },
        });
        if (!so) {
          throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        }

        // Fetch customer
        let recipientName = "Cliente";
        let recipientCpfCnpj = "";
        if (so.customerId) {
          const customer = await tx.customer.findUnique({
            where: { id: so.customerId },
            select: { name: true, cpf: true, cnpj: true },
          });
          if (customer) {
            recipientName = customer.name;
            recipientCpfCnpj = customer.cnpj ?? customer.cpf ?? "";
          }
        }

        const invoice = await tx.invoice.create({
          data: {
            tenantId: ctx.tenantId,
            type: input.type,
            status: "DRAFT",
            recipientName,
            recipientCpfCnpj,
            totalAmount: so.totalAmount,
            referenceId: so.id,
            referenceType: "SERVICE_ORDER",
            createdById: ctx.session.user.id,
            items: {
              create: so.items.map((item) => ({
                tenantId: ctx.tenantId,
                description: item.description,
                quantity: new Prisma.Decimal(item.quantity),
                unitPrice: item.unitPrice,
                total: item.total,
              })),
            },
          },
        });

        return { id: invoice.id };
      });
    }),

  /** Authorize invoice via Nuvem Fiscal.
   *
   * IMPORTANTE: chamada HTTP ao provider e feita FORA da tx — a chamada pode
   * levar 10+ segundos (Nuvem Fiscal aguarda SEFAZ) e segurar a conexao
   * Postgres por todo esse tempo exauria o pool.
   * Fluxo:
   *  1) tx1: marca invoice como PENDING + salva payload
   *  2) HTTP fora da tx
   *  3) tx2: atualiza status (AUTHORIZED/REJECTED) com resultado
   */
  authorize: tenantProcedure
    .input(authorizeInvoiceSchema)
    .mutation(async ({ ctx, input }) => {
      // ── tx1: validar + marcar PENDING ──
      const prep = await ctx.withTenant(async (tx) => {
        const invoice = await tx.invoice.findFirst({
          where: { id: input.invoiceId, deletedAt: null },
          include: { items: true },
        });
        if (!invoice) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal nao encontrada" });
        }
        if (invoice.status !== "DRAFT" && invoice.status !== "REJECTED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nota ja autorizada ou cancelada" });
        }

        const payload = {
          modelo: invoice.type === "NFCE" ? "65" : "55",
          destinatario: {
            nome: invoice.recipientName,
            cpf_cnpj: invoice.recipientCpfCnpj?.replace(/\D/g, ""),
          },
          itens: invoice.items.map((item, idx) => ({
            numero: idx + 1,
            descricao: item.description,
            quantidade: Number(item.quantity),
            valor_unitario: Number(item.unitPrice),
            valor_total: Number(item.total),
            ncm: item.ncm ?? "00000000",
            cfop: item.cfop ?? "5102",
          })),
        };

        // CAS: claim atômico DRAFT/REJECTED → PENDING. Dois authorize concorrentes
        // (duplo-clique) — só um passa; o outro vê count=0 e aborta ANTES do HTTP,
        // impedindo emissão da MESMA NF-e em dobro (NF-e duplicada = problema fiscal).
        const claimed = await tx.invoice.updateMany({
          where: { id: input.invoiceId, status: { in: ["DRAFT", "REJECTED"] } },
          data: { status: "PENDING", payload },
        });
        if (claimed.count !== 1) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Emissao ja em andamento ou nota nao esta mais em rascunho.",
          });
        }

        return { payload };
      });

      // ── HTTP fora da tx ──
      const result = await createAndAuthorizeInvoice(prep.payload);

      // ── tx2: aplicar resultado ──
      return await ctx.withTenant(async (tx) => {
        if (result.success) {
          await tx.invoice.update({
            where: { id: input.invoiceId },
            data: {
              status: "AUTHORIZED",
              providerRef: result.providerRef ?? null,
              accessKey: result.accessKey ?? null,
              providerStatus: result.status ?? null,
              authorizedAt: new Date(),
              number: result.accessKey ? parseInt(result.accessKey.slice(25, 34), 10) || null : null,
              response: result as unknown as Prisma.InputJsonValue,
            },
          });
          logger.info("Invoice authorized", { invoiceId: input.invoiceId });
          return { success: true, accessKey: result.accessKey };
        }

        await tx.invoice.update({
          where: { id: input.invoiceId },
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

  /** Cancel authorized invoice — HTTP fora da tx (ver authorize). */
  cancel: tenantProcedure
    .input(cancelInvoiceSchema)
    .mutation(async ({ ctx, input }) => {
      const prep = await ctx.withTenant(async (tx) => {
        const invoice = await tx.invoice.findFirst({
          where: { id: input.invoiceId, deletedAt: null },
        });
        if (!invoice) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal nao encontrada" });
        }
        if (invoice.status !== "AUTHORIZED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas notas autorizadas podem ser canceladas" });
        }
        if (!invoice.providerRef) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nota sem referencia no provider" });
        }
        return { providerRef: invoice.providerRef };
      });

      const result = await cancelInvoiceService(prep.providerRef, input.reason);

      if (!result.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.error ?? "Erro ao cancelar nota fiscal",
        });
      }

      return await ctx.withTenant(async (tx) => {
        // CAS idempotente: só carimba CANCELLED se ainda estava AUTHORIZED. Em
        // corrida (dois cancel concorrentes — o SEFAZ já serializa o cancelamento
        // real), o segundo vê count=0: a nota já está cancelada (estado desejado),
        // então não re-carimba nem lança erro espúrio.
        const cancelled = await tx.invoice.updateMany({
          where: { id: input.invoiceId, status: "AUTHORIZED" },
          data: { status: "CANCELLED", cancelledAt: new Date() },
        });
        logger.info("Invoice cancelled", { invoiceId: input.invoiceId, applied: cancelled.count });
        return { success: true };
      });
    }),

  /** Send correction letter — HTTP fora da tx (ver authorize). */
  correctionLetter: tenantProcedure
    .input(correctionLetterSchema)
    .mutation(async ({ ctx, input }) => {
      const prep = await ctx.withTenant(async (tx) => {
        const invoice = await tx.invoice.findFirst({
          where: { id: input.invoiceId, deletedAt: null },
        });
        if (!invoice) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal nao encontrada" });
        }
        if (invoice.status !== "AUTHORIZED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Carta de correcao requer nota autorizada" });
        }
        if (!invoice.providerRef) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nota sem referencia no provider" });
        }
        return { providerRef: invoice.providerRef };
      });

      const result = await sendCorrectionLetter(prep.providerRef, input.reason);

      if (!result.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.error ?? "Erro ao enviar carta de correcao",
        });
      }

      return await ctx.withTenant(async (tx) => {
        await tx.invoice.update({
          where: { id: input.invoiceId },
          data: { status: "CORRECTION_LETTER", correctionReason: input.reason },
        });
        return { success: true };
      });
    }),

  /** Get PDF/XML download URLs */
  downloadPdf: tenantProcedure
    .input(z.object({ invoiceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const invoice = await tx.invoice.findFirst({
          where: { id: input.invoiceId, deletedAt: null },
        });
        if (!invoice) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal nao encontrada" });
        }
        if (!invoice.providerRef) {
          return { pdfUrl: null, xmlUrl: null };
        }
        return getInvoiceDocumentUrls(invoice.providerRef);
      });
    }),

  /** Get XML download URL */
  downloadXml: tenantProcedure
    .input(z.object({ invoiceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const invoice = await tx.invoice.findFirst({
          where: { id: input.invoiceId, deletedAt: null },
        });
        if (!invoice) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal nao encontrada" });
        }
        if (!invoice.providerRef) {
          return { xmlUrl: null };
        }
        const urls = await getInvoiceDocumentUrls(invoice.providerRef);
        return { xmlUrl: urls.xmlUrl };
      });
    }),

  /** Update invoice (DRAFT/REJECTED only) */
  update: tenantProcedure
    .input(updateInvoiceSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const invoice = await tx.invoice.findFirst({
          where: { id: input.invoiceId, deletedAt: null },
        });
        if (!invoice) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal nao encontrada" });
        }
        if (invoice.status !== "DRAFT" && invoice.status !== "REJECTED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas rascunhos podem ser editados" });
        }

        const data: Record<string, unknown> = {};
        if (input.recipientName !== undefined) data.recipientName = input.recipientName;
        if (input.recipientCpfCnpj !== undefined) data.recipientCpfCnpj = input.recipientCpfCnpj;

        // Store extra fields in payload JSON
        const existingPayload = (invoice.payload as Record<string, unknown>) ?? {};
        const updatedPayload = {
          ...existingPayload,
          recipientEmail: input.recipientEmail ?? existingPayload.recipientEmail,
          recipientPhone: input.recipientPhone ?? existingPayload.recipientPhone,
          recipientAddress: {
            zipCode: input.recipientZipCode,
            street: input.recipientStreet,
            number: input.recipientNumber,
            complement: input.recipientComplement,
            neighborhood: input.recipientNeighborhood,
            city: input.recipientCity,
            state: input.recipientState,
          },
          freightAmount: input.freightAmount,
          insuranceAmount: input.insuranceAmount,
          otherExpenses: input.otherExpenses,
          discountAmount: input.discountAmount,
          freightMode: input.freightMode,
          paymentForm: input.paymentForm,
          additionalInfo: input.additionalInfo,
        };

        data.payload = updatedPayload;

        await tx.invoice.update({ where: { id: input.invoiceId }, data });
        return { success: true };
      });
    }),

  /** Add item to invoice (DRAFT/REJECTED only) */
  addItem: tenantProcedure
    .input(addInvoiceItemSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const invoice = await tx.invoice.findFirst({
          where: { id: input.invoiceId, deletedAt: null },
        });
        if (!invoice) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal nao encontrada" });
        }
        if (invoice.status !== "DRAFT" && invoice.status !== "REJECTED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas rascunhos podem receber itens" });
        }

        const totalCents = Math.round(input.quantity * input.unitPrice);

        await tx.invoiceItem.create({
          data: {
            tenantId: ctx.tenantId,
            invoiceId: input.invoiceId,
            description: input.description,
            quantity: new Prisma.Decimal(input.quantity),
            unitPrice: centsToPrisma(input.unitPrice),
            total: centsToPrisma(totalCents),
            ncm: input.ncm ?? null,
            cfop: input.cfop ?? null,
          },
        });

        // Recalculate total
        const allItems = await tx.invoiceItem.findMany({
          where: { invoiceId: input.invoiceId },
        });
        const newTotal = allItems.reduce((sum, item) => sum + Number(item.total), 0);
        await tx.invoice.update({
          where: { id: input.invoiceId },
          data: { totalAmount: new Prisma.Decimal(newTotal) },
        });

        return { success: true };
      });
    }),

  /** Remove item from invoice */
  removeItem: tenantProcedure
    .input(removeInvoiceItemSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const invoice = await tx.invoice.findFirst({
          where: { id: input.invoiceId, deletedAt: null },
        });
        if (!invoice) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal nao encontrada" });
        }
        if (invoice.status !== "DRAFT" && invoice.status !== "REJECTED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas rascunhos podem ter itens removidos" });
        }

        await tx.invoiceItem.delete({ where: { id: input.itemId } });

        // Recalculate total
        const allItems = await tx.invoiceItem.findMany({
          where: { invoiceId: input.invoiceId },
        });
        const newTotal = allItems.reduce((sum, item) => sum + Number(item.total), 0);
        await tx.invoice.update({
          where: { id: input.invoiceId },
          data: { totalAmount: new Prisma.Decimal(newTotal) },
        });

        return { success: true };
      });
    }),

  /** Inutilizar numeracao */
  inutilizar: tenantProcedure
    .input(inutilizarSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.endNumber < input.startNumber) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Numero final deve ser maior ou igual ao inicial",
        });
      }

      logger.info("Inutilizacao solicitada", {
        model: input.model,
        series: input.series,
        startNumber: input.startNumber,
        endNumber: input.endNumber,
        justification: input.justification,
      });

      // In production, this would call Nuvem Fiscal API
      // For now, log and return success (mock)
      return {
        success: true,
        model: input.model,
        series: input.series,
        startNumber: input.startNumber,
        endNumber: input.endNumber,
        quantity: input.endNumber - input.startNumber + 1,
      };
    }),

  /** Create NF-e de entrada (avulsa) */
  createEntrada: tenantProcedure
    .input(createEntradaSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const payload = {
          tipoOperacao: "entrada",
          fornecedor: {
            nome: input.supplierName,
            cpfCnpj: input.supplierCpfCnpj,
            email: input.supplierEmail,
            telefone: input.supplierPhone,
            fornecedorId: input.supplierId,
            endereco: {
              cep: input.zipCode,
              logradouro: input.street,
              numero: input.number,
              complemento: input.complement,
              bairro: input.neighborhood,
              cidade: input.city,
              uf: input.state,
            },
          },
          frete: {
            modalidade: input.freightMode,
            valor: input.freightAmount,
            seguro: input.insuranceAmount,
            outrasDespesas: input.otherExpenses,
          },
          informacoesComplementares: input.additionalInfo,
        };

        const invoice = await tx.invoice.create({
          data: {
            tenantId: ctx.tenantId,
            type: "NFE",
            status: "DRAFT",
            recipientName: input.supplierName,
            recipientCpfCnpj: input.supplierCpfCnpj,
            totalAmount: new Prisma.Decimal(0),
            createdById: ctx.session.user.id,
            payload: payload as unknown as Prisma.InputJsonValue,
          },
        });

        logger.info("NF-e de entrada criada", { invoiceId: invoice.id });
        return { id: invoice.id };
      });
    }),

  /** Send invoice by email — HTTP fora da tx (ver authorize). */
  sendEmail: tenantProcedure
    .input(sendInvoiceEmailSchema)
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.withTenant(async (tx) => {
        const inv = await tx.invoice.findFirst({
          where: { id: input.invoiceId, deletedAt: null },
          include: { items: true },
        });
        if (!inv) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nota fiscal nao encontrada" });
        }
        if (inv.status !== "AUTHORIZED" && inv.status !== "CORRECTION_LETTER") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Apenas notas autorizadas podem ser enviadas por email",
          });
        }
        return inv;
      });

        const typeLabel = invoice.type === "NFCE" ? "NFC-e" : invoice.type === "NFSE" ? "NFS-e" : "NF-e";
        const numberStr = invoice.number ? `#${invoice.number}` : `#${invoice.id.slice(0, 8)}`;
        const totalFormatted = (Number(invoice.totalAmount) || 0).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });

        // Build HTML email
        const itemRows = invoice.items
          .map(
            (item) =>
              `<tr>
                <td style="padding:6px 8px;border:1px solid #ddd;">${item.description}</td>
                <td style="padding:6px 8px;border:1px solid #ddd;text-align:center;">${Number(item.quantity)}</td>
                <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;">
                  ${(Number(item.unitPrice) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </td>
                <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;">
                  ${(Number(item.total) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </td>
              </tr>`,
          )
          .join("");

        const html = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#2ec4b6;">${typeLabel} ${numberStr}</h2>
            <p>Segue em anexo sua nota fiscal eletronica.</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
              <tr>
                <td style="padding:4px 0;color:#666;">Destinatario:</td>
                <td style="padding:4px 0;font-weight:bold;">${invoice.recipientName}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#666;">CPF/CNPJ:</td>
                <td style="padding:4px 0;">${invoice.recipientCpfCnpj || "-"}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#666;">Valor Total:</td>
                <td style="padding:4px 0;font-weight:bold;color:#22c55e;">${totalFormatted}</td>
              </tr>
              ${invoice.accessKey ? `<tr><td style="padding:4px 0;color:#666;">Chave de Acesso:</td><td style="padding:4px 0;font-family:monospace;font-size:11px;">${invoice.accessKey}</td></tr>` : ""}
            </table>
            <h3 style="margin-top:20px;">Itens</h3>
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="background:#f5f5f5;">
                  <th style="padding:6px 8px;border:1px solid #ddd;text-align:left;">Descricao</th>
                  <th style="padding:6px 8px;border:1px solid #ddd;text-align:center;">Qtd</th>
                  <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;">Preco Unit.</th>
                  <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;">Total</th>
                </tr>
              </thead>
              <tbody>${itemRows}</tbody>
            </table>
            <p style="margin-top:20px;font-size:12px;color:#999;">
              Este email foi enviado automaticamente pelo sistema Arena Tech.
            </p>
          </div>
        `;

      const subject = `${typeLabel} ${numberStr} - Arena Tech`;
      const result = await sendEmail(input.email, subject, html);

      if (!result.success) {
        logger.error("Failed to send invoice email", {
          invoiceId: input.invoiceId,
          email: input.email,
          error: result.error,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error ?? "Erro ao enviar email",
        });
      }

      logger.info("Invoice email sent", {
        invoiceId: input.invoiceId,
        email: input.email,
        messageId: result.messageId,
      });

      return { success: true, messageId: result.messageId };
    }),

  /** Stats for fiscal dashboard */
  stats: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [totalAuthorized, totalCancelled, totalDraft, monthAuthorized] = await Promise.all([
        tx.invoice.count({ where: { status: "AUTHORIZED", deletedAt: null } }),
        tx.invoice.count({ where: { status: "CANCELLED", deletedAt: null } }),
        tx.invoice.count({ where: { status: "DRAFT", deletedAt: null } }),
        tx.invoice.findMany({
          where: {
            status: "AUTHORIZED",
            authorizedAt: { gte: startOfMonth },
            deletedAt: null,
          },
        }),
      ]);

      const monthTotal = monthAuthorized.reduce(
        (sum, inv) => sum + decimalToCents(inv.totalAmount),
        0,
      );

      return {
        totalAuthorized,
        totalCancelled,
        totalDraft,
        monthCount: monthAuthorized.length,
        monthTotal,
      };
    });
  }),
});
