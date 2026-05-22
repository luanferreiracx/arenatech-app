import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure, publicProcedure } from "@/server/api/trpc";
import { withAdmin } from "@/server/db";
import { createDocumentWithLink, getDocumentStatus, formatWhatsApp, extractShortlinkToken } from "@/lib/services/autentique-service";
import { buildServiceOrderPdf } from "@/lib/pdf/service-order-pdf-builder";
import { sendPdfWithFallback } from "@/lib/whatsapp/send-with-fallback";
import { createPublicPdfToken } from "@/lib/whatsapp/public-pdf-token";
import { logger } from "@/lib/logger";
import {
  createServiceOrderSchema,
  updateServiceOrderSchema,
  updateStatusSchema,
  addItemSchema,
  updateItemSchema,
  registerPaymentSchema,
  cancelOrderSchema,
  uncancelOrderSchema,
  refundOrderSchema,
  updateCostsSchema,
  listServiceOrdersSchema,
  createQuoteSchema,
  respondQuoteSchema,
  confirmPhysicalSignatureSchema,
  sendToLabSchema,
  receiveFromLabSchema,
  cancelLabSchema,
  searchPartsSchema,
  sendTrackingSchema,
  notifyDeliveryPersonSchema,
  sendDeliveryTermSchema,
  confirmPhysicalDeliveryTermSchema,
  checkDeliveryTermStatusSchema,
  sendReturnTermSchema,
  confirmPhysicalReturnTermSchema,
  checkReturnTermStatusSchema,
  sendQuoteWhatsAppSchema,
  checkQuoteStatusSchema,
  updateTechnicalInfoSchema,
  updateTechnicianSchema,
  getByCustomerSchema,
  sendReceiptSchema,
  ALLOWED_TRANSITIONS,
  type ServiceOrderStatus,
} from "@/lib/validators/service-order";
import { technicianReportSchema } from "@/lib/validators/subscription";
import { sendTextMessage, sendMediaMessage } from "@/lib/services/whatsapp-service";
import { createPixPayment, cancelPixPayment } from "@/lib/services/depix-service";
import {
  reserveStockForOsItem,
  releaseStockForOsItem,
  releaseAllOsItems,
} from "@/server/services/os-stock.service";
// ── Helpers ──

function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Number(v) * 100);
}

function centsToPrisma(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(cents / 100);
}

function generatePublicLink(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateQuoteLink(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

 
function serializeOrder(order: any) {
  return {
    ...order,
    serviceAmount: decimalToCents(order.serviceAmount),
    partsAmount: decimalToCents(order.partsAmount),
    partsCost: decimalToCents(order.partsCost),
    discount: decimalToCents(order.discount),
    totalAmount: decimalToCents(order.totalAmount),
    paidAmount: decimalToCents(order.paidAmount),
    otherCost: decimalToCents(order.otherCost),
    paymentDiscount: decimalToCents(order.paymentDiscount),
    items: order.items?.map(serializeItem) ?? [],
    quotes: order.quotes?.map(serializeQuote) ?? [],
  };
}

 
function serializeItem(item: any) {
  return {
    ...item,
    quantity: Number(item.quantity),
    unitPrice: decimalToCents(item.unitPrice),
    costPrice: decimalToCents(item.costPrice),
    total: decimalToCents(item.total),
  };
}

 
function serializeQuote(q: any) {
  return {
    ...q,
    previousServiceAmount: decimalToCents(q.previousServiceAmount),
    previousPartsAmount: decimalToCents(q.previousPartsAmount),
    previousDiscount: decimalToCents(q.previousDiscount),
    previousTotal: decimalToCents(q.previousTotal),
    newServiceAmount: decimalToCents(q.newServiceAmount),
    newPartsAmount: decimalToCents(q.newPartsAmount),
    newDiscount: decimalToCents(q.newDiscount),
    newTotal: decimalToCents(q.newTotal),
  };
}

export const serviceOrderRouter = createTRPCRouter({
  // ── LIST ──
  list: tenantProcedure
    .input(listServiceOrdersSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const page = input.page ?? 0;
        const pageSize = input.pageSize ?? 10;
        const skip = page * pageSize;

         
        const where: any = { deletedAt: null };

        if (input.status) {
          where.status = input.status;
        }
        if (input.technicianId) {
          where.technicianId = input.technicianId;
        }
        if (input.dateFrom) {
          where.entryDate = { ...(where.entryDate ?? {}), gte: new Date(input.dateFrom) };
        }
        if (input.dateTo) {
          where.entryDate = { ...(where.entryDate ?? {}), lte: new Date(input.dateTo + "T23:59:59Z") };
        }

        // Search by number, customer name, CPF, IMEI, model
        if (input.search) {
          const search = input.search.trim();
          // Try to find matching customer IDs first
          const matchingCustomers = await tx.customer.findMany({
            where: {
              deletedAt: null,
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { cpf: { contains: search.replace(/\D/g, "") } },
              ],
            },
            select: { id: true },
          });

          const customerIds = matchingCustomers.map((c) => c.id);

          where.OR = [
            { number: { contains: search, mode: "insensitive" } },
            { imei: { contains: search } },
            { deviceModel: { contains: search, mode: "insensitive" } },
            ...(customerIds.length > 0 ? [{ customerId: { in: customerIds } }] : []),
          ];
        }

        // Determine ordering. Default: mais recentes primeiro, com desempate por number desc.

        let orderBy: any = [{ entryDate: "desc" }, { number: "desc" }];
        if (input.sortBy === "number") orderBy = { number: input.sortOrder ?? "desc" };
        if (input.sortBy === "totalAmount") orderBy = { totalAmount: input.sortOrder ?? "desc" };
        if (input.sortBy === "status") orderBy = { status: input.sortOrder ?? "asc" };

        const [orders, total] = await Promise.all([
          tx.serviceOrder.findMany({
            where,
            include: {
              items: true,
            },
            orderBy,
            skip,
            take: pageSize,
          }),
          tx.serviceOrder.count({ where }),
        ]);

        // Load customer names separately (customer is cross-table via customerId)
        const customerIds = [...new Set(orders.map((o) => o.customerId))];
        const customers = await tx.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, name: true, cpf: true, phone: true, phoneSecondary: true },
        });
        const customerMap = new Map(customers.map((c) => [c.id, c]));

        // Load technician names via withAdmin (users are global)
        const techIds = [...new Set(orders.map((o) => o.technicianId).filter(Boolean))] as string[];
        let techMap = new Map<string, string>();
        if (techIds.length > 0) {
          const techs = await withAdmin(async (adminTx) => {
            return adminTx.user.findMany({
              where: { id: { in: techIds } },
              select: { id: true, name: true },
            });
          });
          techMap = new Map(techs.map((t) => [t.id, t.name]));
        }

        return {
          items: orders.map((order) => ({
            ...serializeOrder(order),
            customerName: customerMap.get(order.customerId)?.name ?? "—",
            customerCpf: customerMap.get(order.customerId)?.cpf ?? null,
            customerPhone: customerMap.get(order.customerId)?.phone ?? null,
            customerPhoneSecondary: customerMap.get(order.customerId)?.phoneSecondary ?? null,
            technicianName: order.technicianId ? (techMap.get(order.technicianId) ?? "—") : null,
          })),
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        };
      });
    }),

  // ── STATS ──
  stats: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const counts = await tx.serviceOrder.groupBy({
        by: ["status"],
        where: { deletedAt: null },
        _count: true,
      });

      const countMap: Record<string, number> = {};
      let totalCount = 0;
      for (const c of counts) {
        countMap[c.status] = c._count;
        totalCount += c._count;
      }

      return {
        total: totalCount,
        open: countMap["OPEN"] ?? 0,
        inProgress: (countMap["IN_DIAGNOSIS"] ?? 0) + (countMap["IN_PROGRESS"] ?? 0) + (countMap["APPROVED"] ?? 0),
        waitingParts: countMap["WAITING_PARTS"] ?? 0,
        waitingApproval: countMap["WAITING_APPROVAL"] ?? 0,
        completed: countMap["COMPLETED"] ?? 0,
        readyForPickup: (countMap["PAID"] ?? 0) + (countMap["READY_FOR_PICKUP"] ?? 0),
        delivered: countMap["DELIVERED"] ?? 0,
        cancelled: (countMap["CANCELLED"] ?? 0) + (countMap["REFUNDED"] ?? 0),
      };
    });
  }),

  // ── GET BY ID ──
  getById: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({
          where: { id: input.id },
          include: {
            items: { orderBy: { createdAt: "asc" } },
            history: { orderBy: { createdAt: "desc" } },
            documents: { orderBy: { createdAt: "desc" } },
            quotes: { orderBy: { createdAt: "desc" } },
          },
        });

        if (!order || order.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        }

        // Load customer
        const customer = await tx.customer.findUnique({
          where: { id: order.customerId },
          select: { id: true, name: true, cpf: true, cnpj: true, phone: true, phoneSecondary: true, email: true },
        });

        // Load users (technician, created by, vendor) via withAdmin
        const userIds = [order.createdById, order.technicianId, order.vendorId, order.refundedById].filter(Boolean) as string[];
        const historyUserIds = order.history.map((h) => h.userId);
        const allUserIds = [...new Set([...userIds, ...historyUserIds])];

        let userMap = new Map<string, string>();
        if (allUserIds.length > 0) {
          const users = await withAdmin(async (adminTx) => {
            return adminTx.user.findMany({
              where: { id: { in: allUserIds } },
              select: { id: true, name: true },
            });
          });
          userMap = new Map(users.map((u) => [u.id, u.name]));
        }

        // Sale vinculada (se OS foi paga via PDV). Paridade Laravel `os->pdv_venda_id`.
        const linkedSale = await tx.sale.findFirst({
          where: {
            serviceOrderId: order.id,
            status: "COMPLETED",
            deletedAt: null,
          },
          select: { id: true, number: true, saleDate: true },
          orderBy: { saleDate: "desc" },
        });

        return {
          ...serializeOrder(order),
          customer,
          createdByName: userMap.get(order.createdById) ?? "Sistema",
          technicianName: order.technicianId ? (userMap.get(order.technicianId) ?? null) : null,
          vendorName: order.vendorId ? (userMap.get(order.vendorId) ?? null) : null,
          refundedByName: order.refundedById ? (userMap.get(order.refundedById) ?? null) : null,
          linkedSale,
          // Expose admin flag para UI poder mostrar botões restritos sem
          // depender de useSession no client.
          viewerIsAdmin: ctx.session.user.isSuperAdmin === true,
          history: order.history.map((h) => ({
            ...h,
            userName: userMap.get(h.userId) ?? "Sistema",
          })),
        };
      });
    }),

  // ── CREATE ──
  create: tenantProcedure
    .input(createServiceOrderSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        // Generate sequential number
        const year = new Date().getFullYear();
        const lastOrder = await tx.serviceOrder.findFirst({
          where: { number: { startsWith: `OS${year}` } },
          orderBy: { number: "desc" },
          select: { number: true },
        });

        let seq = 1;
        if (lastOrder) {
          const lastSeq = parseInt(lastOrder.number.replace(`OS${year}`, ""), 10);
          if (!isNaN(lastSeq)) seq = lastSeq + 1;
        }
        const number = `OS${year}${String(seq).padStart(5, "0")}`;

        // Calculate totals from items
        let serviceAmount = 0;
        let partsAmount = 0;
        for (const item of input.items) {
          const total = item.unitPrice * item.quantity;
          if (item.type === "SERVICE") serviceAmount += total;
          else partsAmount += total;
        }
        const totalAmount = serviceAmount + partsAmount;

        const order = await tx.serviceOrder.create({
          data: {
            tenantId: ctx.tenantId,
            number,
            customerId: input.customerId,
            createdById: ctx.session.user.id,
            technicianId: input.technicianId ?? null,
            vendorId: input.vendorId ?? null,
            serviceProviderId: input.serviceProviderId ?? null,
            status: "OPEN",
            publicLink: generatePublicLink(),
            deviceType: input.deviceType ?? null,
            deviceBrand: input.deviceBrand ?? null,
            deviceModel: input.deviceModel ?? null,
            serialNumber: input.serialNumber ?? null,
            imei: input.imei ?? null,
            devicePassword: input.devicePassword ?? null,
            accessories: input.accessories ?? null,
            reportedProblem: input.reportedProblem,
            customerNotes: input.customerNotes ?? null,
            entryChecklist: input.entryChecklist ?? Prisma.JsonNull,
            deviceInfo: input.deviceInfo ?? Prisma.JsonNull,
            serviceAmount: centsToPrisma(serviceAmount),
            partsAmount: centsToPrisma(partsAmount),
            totalAmount: centsToPrisma(totalAmount),
            isWarranty: input.isWarranty ?? false,
            warrantyType: input.warrantyType ?? null,
            warrantyMonths: input.warrantyMonths ?? 3,
            originalOrderId: input.originalOrderId ?? null,
            estimatedDate: input.estimatedDate ? new Date(input.estimatedDate) : null,
          },
        });

        // Create items
        if (input.items.length > 0) {
          await tx.serviceOrderItem.createMany({
            data: input.items.map((item) => ({
              tenantId: ctx.tenantId,
              orderId: order.id,
              type: item.type,
              serviceId: item.serviceId ?? null,
              productId: item.productId ?? null,
              description: item.description,
              quantity: new Prisma.Decimal(item.quantity),
              unitPrice: centsToPrisma(item.unitPrice),
              costPrice: centsToPrisma(item.costPrice ?? 0),
              total: centsToPrisma(item.unitPrice * item.quantity),
            })),
          });

          // Reserve stock for product items
          for (const item of input.items) {
            if (item.type === "PRODUCT" && item.productId) {
              await reserveStockForOsItem(tx, ctx.tenantId, ctx.session.user.id, {
                productId: item.productId,
                quantity: item.quantity,
                orderId: order.id,
                itemDescription: item.description,
              });
            }
          }
        }

        // Create history entry
        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: order.id,
            userId: ctx.session.user.id,
            previousStatus: null,
            newStatus: "OPEN",
            notes: "Ordem de servico criada",
          },
        });

        // TODO H2: notificar tecnico via WhatsApp ao criar OS (paridade
        // Laravel `enviarNotificacaoTecnicoWhatsApp`). Bloqueado: User model
        // nao tem campo `phone` ainda. Quando schema for atualizado, carregar
        // technician.phone e disparar sendTextMessage best-effort aqui.

        return { id: order.id, number: order.number };
      });
    }),

  // ── UPDATE ──
  update: tenantProcedure
    .input(updateServiceOrderSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.id } });
        if (!order || order.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        }

        const { id, ...data } = input;

        // Paridade Laravel `update`:
        // - osAssinada → bloqueia equipamento/IMEI/problema relatado/entryChecklist/deviceInfo
        // - osConcluida → bloqueia ADICIONALMENTE diagnosedProblem/internalNotes/warrantyMonths
        const isSigned = !!order.signatureSignedAt || order.physicalSignature;
        const isCompleted = ["COMPLETED", "PAID", "READY_FOR_PICKUP", "DELIVERED", "REFUNDED"].includes(order.status);
        const lockedFields = new Set<string>();
        if (isSigned) {
          lockedFields.add("deviceType");
          lockedFields.add("deviceBrand");
          lockedFields.add("deviceModel");
          lockedFields.add("serialNumber");
          lockedFields.add("imei");
          lockedFields.add("devicePassword");
          lockedFields.add("accessories");
          lockedFields.add("reportedProblem");
          lockedFields.add("entryChecklist");
          lockedFields.add("deviceInfo");
        }
        if (isCompleted) {
          lockedFields.add("diagnosedProblem");
          lockedFields.add("internalNotes");
          lockedFields.add("warrantyMonths");
        }

        // Build update data, converting dates and handling null

        const updateData: any = {};
        for (const [key, value] of Object.entries(data)) {
          if (value === undefined) continue;
          if (lockedFields.has(key)) continue; // ignora silenciosamente apos assinatura
          if (key === "estimatedDate") {
            updateData[key] = value ? new Date(value as string) : null;
          } else if (key === "entryChecklist" || key === "exitChecklist" || key === "deviceInfo") {
            updateData[key] = value ?? Prisma.JsonNull;
          } else {
            updateData[key] = value;
          }
        }

        // M3: registrar timestamp na transicao false -> true de nfseIssued
        // (paridade Laravel OrdemServicoController:351-361).
        if (updateData.nfseIssued === true && !order.nfseIssued) {
          updateData.nfseIssuedAt = new Date();
        }
        if (updateData.nfseIssued === false && order.nfseIssued) {
          updateData.nfseIssuedAt = null;
        }

        await tx.serviceOrder.update({ where: { id }, data: updateData });

        // History
        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: id,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: order.status,
            notes: "Dados da OS atualizados",
          },
        });

        return { success: true };
      });
    }),

  // ── UPDATE STATUS ──
  updateStatus: tenantProcedure
    .input(updateStatusSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.id } });
        if (!order || order.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        }

        const currentStatus = order.status as ServiceOrderStatus;
        const newStatus = input.status;

        // Validate transition
        const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];
        if (!allowed.includes(newStatus)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Transicao de ${currentStatus} para ${newStatus} nao permitida`,
          });
        }

        // Exigir assinatura de entrada (Autentique OU fisica) antes de avancar o
        // status para alem de OPEN. Cancelamento e estados especiais sao excecao.
        // Paridade com regra do Laravel: aparelho na loja exige assinatura antes
        // de iniciar o fluxo de servico.
        const isSigned = !!order.signatureSignedAt || order.physicalSignature;
        const isCancelOrSpecial =
          newStatus === "CANCELLED" || newStatus === "REFUNDED" || newStatus === "IN_WARRANTY";
        if (!isSigned && !isCancelOrSpecial) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Confirme a assinatura de entrada do cliente antes de avancar o status da OS.",
          });
        }

        // Block completion if device is at external lab and not returned
        if (newStatus === "COMPLETED" && order.sentToLab && !order.labReceived) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "O aparelho esta no laboratorio externo. Confirme o recebimento antes de concluir.",
          });
        }

        // Block if pending quote
        if (order.budgetPending) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nao e possivel alterar o status enquanto houver orcamento pendente.",
          });
        }

        // OS sem valor (cortesia) ou de garantia podem pular o fluxo de PDV
        const totalAmountNum = Number(order.totalAmount);
        const canSkipPdv = totalAmountNum <= 0 || order.isWarranty;
        const isAdmin = ctx.session.user.isSuperAdmin === true;

        // C2: Bloquear PAID via updateStatus direto. Pagamento deve passar por
        // `registerPayment` (que registra caixa + financeiro). Excecoes:
        // OS de garantia / sem valor; admin com flag `force`.
        if (newStatus === "PAID" && !canSkipPdv && !input.force) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Pagamento de OS deve ser registrado via PDV. Use 'Receber Pagamento' para prosseguir.",
          });
        }
        if (newStatus === "PAID" && input.force && !isAdmin) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Apenas administradores podem forcar status=PAID fora do PDV.",
          });
        }

        // C4: Bloquear DELIVERED sem termo de entrega assinado (admin pode bypassar)
        if (newStatus === "DELIVERED" && !canSkipPdv) {
          const termSigned = order.deliveryTermSigned || order.deliveryTermPhysical;
          if (!termSigned && !(input.force && isAdmin)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "O termo de entrega deve ser assinado antes de avancar para entregue. Envie o termo ou registre assinatura fisica.",
            });
          }
        }

        // C5: Se ha termo de devolucao em curso (enviado mas nao assinado) e o
        // usuario decide retomar a OS, limpar os campos do termo.
        const interruptingReturnTerm =
          order.returnTermSent && !order.returnTermSigned && newStatus !== "CANCELLED";


        const updateData: any = { status: newStatus };

        if (interruptingReturnTerm) {
          updateData.returnTermSent = false;
          updateData.returnTermSentAt = null;
          updateData.returnTermAutentiqueId = null;
          updateData.returnTermLink = null;
        }

        if (newStatus === "COMPLETED") {
          updateData.completedDate = new Date();
        }

        if (newStatus === "DELIVERED") {
          updateData.deliveredDate = new Date();
        }

        if (newStatus === "PAID") {
          updateData.paymentDate = new Date();
          if (input.paymentMethod) updateData.paymentMethod = input.paymentMethod;
          if (input.paymentNotes) updateData.paymentNotes = input.paymentNotes;
          if (input.paymentDiscount) {
            updateData.paymentDiscount = centsToPrisma(input.paymentDiscount);
            const paid = Number(order.totalAmount) - input.paymentDiscount / 100;
            updateData.paidAmount = new Prisma.Decimal(Math.max(0, paid));
          } else {
            updateData.paidAmount = order.totalAmount;
          }
        }

        if (input.warrantyMonths !== undefined) {
          updateData.warrantyMonths = input.warrantyMonths;
        }

        await tx.serviceOrder.update({ where: { id: input.id }, data: updateData });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.id,
            userId: ctx.session.user.id,
            previousStatus: currentStatus,
            newStatus,
            notes: input.notes ?? null,
          },
        });

        // ── If PAID, register cash movement and financial receivable ──
        if (newStatus === "PAID") {
          const paidCents = decimalToCents(updateData.paidAmount ?? order.totalAmount);
          const paymentMethodUsed = input.paymentMethod ?? "dinheiro";

          if (paidCents > 0) {
            // Cash movement
            const userId = ctx.session.user.id;
            const openSession = await tx.cashSession.findFirst({
              where: { userId, closedAt: null },
            });

            if (openSession) {
              await tx.cashMovement.create({
                data: {
                  tenantId: ctx.tenantId,
                  cashSessionId: openSession.id,
                  type: "SALE",
                  amount: centsToPrisma(paidCents),
                  nature: "INCOME",
                  paymentMethod: paymentMethodUsed,
                  description: `Pagamento OS ${order.number}`,
                  referenceType: "service_order",
                  referenceId: order.id,
                  createdByUserId: userId,
                },
              });
            }

            // Financial receivable (avoid duplicates)
            const existingRcv = await tx.financialTransaction.findFirst({
              where: {
                referenceType: "service_order",
                referenceId: order.id,
                type: "RECEIVABLE",
                status: { not: "CANCELLED" },
                deletedAt: null,
              },
            });

            if (!existingRcv) {
              const customerData = await tx.customer.findUnique({
                where: { id: order.customerId },
                select: { name: true },
              });
              const instantPay = ["dinheiro", "pix"].includes(paymentMethodUsed);
              const amtDec = centsToPrisma(paidCents);

              const rcv = await tx.financialTransaction.create({
                data: {
                  tenantId: ctx.tenantId,
                  type: "RECEIVABLE",
                  status: instantPay ? "PAID" : "PENDING",
                  description: `OS #${order.number}`,
                  category: "Ordem de Servico",
                  customerName: customerData?.name ?? null,
                  customerId: order.customerId,
                  totalAmount: amtDec,
                  paidAmount: instantPay ? amtDec : new Prisma.Decimal(0),
                  dueDate: new Date(),
                  emissionDate: new Date(),
                  paidAt: instantPay ? new Date() : null,
                  paymentMethod: paymentMethodUsed,
                  referenceType: "service_order",
                  referenceId: order.id,
                },
              });

              await tx.installment.create({
                data: {
                  tenantId: ctx.tenantId,
                  transactionId: rcv.id,
                  number: 1,
                  amount: amtDec,
                  dueDate: new Date(),
                  paidAmount: instantPay ? amtDec : new Prisma.Decimal(0),
                  paidAt: instantPay ? new Date() : null,
                  paymentMethod: instantPay ? paymentMethodUsed : null,
                  status: instantPay ? "PAID" : "PENDING",
                },
              });
            }
          }
        }

        // C8: Notificar conclusao via WhatsApp (best-effort, nao bloqueia).
        // Paridade com Laravel `enviarNotificacaoConclusaoWhatsApp`.
        if (newStatus === "COMPLETED" && input.notifyWhatsapp) {
          const customer = await tx.customer.findUnique({
            where: { id: order.customerId },
            select: { name: true, phone: true },
          });
          const phone = input.notifyPhone ?? customer?.phone ?? null;
          if (phone) {
            const name = customer?.name ?? "Cliente";
            const text = `Ola, ${name}!\n\nSua Ordem de Servico ${order.number} foi concluida e ja esta pronta para retirada.\n\nArena Tech`;
            try {
              await sendTextMessage(phone, text);
            } catch {
              // best-effort
            }
          }
        }

        return { success: true };
      });
    }),

  // ── CANCEL ──
  cancel: tenantProcedure
    .input(cancelOrderSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.id } });
        if (!order || order.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        }

        if (["COMPLETED", "DELIVERED"].includes(order.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nao e possivel cancelar uma OS concluida ou entregue.",
          });
        }

        // Paridade Laravel (`OrdemServicoController::cancelar`): TODA OS tem
        // aparelho fisico do cliente — exige termo de devolucao assinado
        // (Autentique OU fisico) antes do cancelamento. Admin pode forcar
        // via input.force - registrado como '[FORCADO]' no historico.
        const termSigned = order.returnTermSigned || order.returnTermPhysical;
        const isAdmin = ctx.session.user.isSuperAdmin === true;

        let forced = false;
        if (!termSigned) {
          if (!input.force) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "O termo de devolucao deve ser assinado antes do cancelamento. Envie o termo para assinatura ou confirme a devolucao fisica.",
            });
          }
          if (!isAdmin) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Apenas administradores podem forcar cancelamento sem termo de devolucao.",
            });
          }
          forced = true;
        }

        // Release all reserved product stock
        const releasedCount = await releaseAllOsItems(tx, ctx.tenantId, ctx.session.user.id, input.id);

        await tx.serviceOrder.update({
          where: { id: input.id },
          data: {
            status: "CANCELLED",
            cancellationReason: input.reason,
          },
        });

        const noteParts: string[] = [];
        if (forced) noteParts.push("[FORCADO SEM TERMO DE DEVOLUCAO]");
        noteParts.push(input.reason);
        if (releasedCount > 0) noteParts.push(`(${releasedCount} item(ns) de estoque liberado(s))`);

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.id,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: "CANCELLED",
            notes: noteParts.join(" "),
          },
        });

        return { success: true };
      });
    }),

  // ── UNCANCEL (admin only) ──
  uncancel: tenantProcedure
    .input(uncancelOrderSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.id } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });

        if (order.status !== "CANCELLED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas OS canceladas podem ser descanceladas." });
        }

        await tx.serviceOrder.update({
          where: { id: input.id },
          data: {
            status: "IN_DIAGNOSIS",
            cancellationReason: null,
          },
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.id,
            userId: ctx.session.user.id,
            previousStatus: "CANCELLED",
            newStatus: "IN_DIAGNOSIS",
            notes: `[DESCANCELAMENTO] ${input.reason}`,
          },
        });

        return { success: true };
      });
    }),

  // ── REFUND (admin only) ──
  refund: tenantProcedure
    .input(refundOrderSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.id } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });

        if (order.status !== "DELIVERED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas OS entregues podem ser estornadas." });
        }

        await tx.serviceOrder.update({
          where: { id: input.id },
          data: {
            status: "REFUNDED",
            refundReason: input.reason,
            refundedAt: new Date(),
            refundedById: ctx.session.user.id,
          },
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.id,
            userId: ctx.session.user.id,
            previousStatus: "DELIVERED",
            newStatus: "REFUNDED",
            notes: `[ESTORNO] ${input.reason}`,
          },
        });

        return { success: true };
      });
    }),

  // ── DELETE (admin only, permanent) ──
  delete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.id } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });

        // C6: Bloquear se ha OS de garantia/retorno que referencia esta como
        // originalOrderId. Paridade com Laravel destroy().
        const linkedOrders = await tx.serviceOrder.findMany({
          where: { originalOrderId: input.id, deletedAt: null },
          select: { number: true },
        });
        if (linkedOrders.length > 0) {
          const numbers = linkedOrders.map((o) => o.number).join(", ");
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Nao e possivel excluir esta OS pois ela e referenciada como OS Original pelas seguintes OS de garantia/retorno: ${numbers}. Exclua primeiro as OS vinculadas ou remova o vinculo.`,
          });
        }

        // Soft delete
        await tx.serviceOrder.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });

        return { success: true };
      });
    }),

  // ── ADD ITEM ──
  addItem: tenantProcedure
    .input(addItemSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order || order.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        // Paridade Laravel `OrdemServicoController::adicionarItem`: bloqueia em
        // estados finalizados — adicionar item depois recalcula totais e reserva
        // estoque indevido em OS ja paga/entregue/cancelada/estornada.
        if (["PAID", "DELIVERED", "CANCELLED", "REFUNDED"].includes(order.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `OS nao pode receber novos itens no status atual.`,
          });
        }

        const itemTotal = input.unitPrice * input.quantity;

        // Reserve stock for product items
        if (input.type === "PRODUCT" && input.productId) {
          await reserveStockForOsItem(tx, ctx.tenantId, ctx.session.user.id, {
            productId: input.productId,
            quantity: input.quantity,
            orderId: input.orderId,
            itemDescription: input.description,
          });
        }

        await tx.serviceOrderItem.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            type: input.type,
            serviceId: input.serviceId ?? null,
            productId: input.productId ?? null,
            description: input.description,
            quantity: new Prisma.Decimal(input.quantity),
            unitPrice: centsToPrisma(input.unitPrice),
            costPrice: centsToPrisma(input.costPrice ?? 0),
            total: centsToPrisma(itemTotal),
          },
        });

        // Recalculate totals
        await recalculateOrderTotals(tx, input.orderId, ctx.tenantId);

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: order.status,
            notes: `Item adicionado: ${input.description}`,
          },
        });

        return { success: true };
      });
    }),

  // ── UPDATE ITEM ──
  updateItem: tenantProcedure
    .input(updateItemSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const item = await tx.serviceOrderItem.findUnique({ where: { id: input.id } });
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });

        // Consistencia com add/remove: nao alterar item em OS finalizada.
        const order = await tx.serviceOrder.findUnique({
          where: { id: item.orderId },
          select: { status: true },
        });
        if (order && ["PAID", "DELIVERED", "CANCELLED", "REFUNDED"].includes(order.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "OS nao pode ter itens alterados no status atual.",
          });
        }

        const quantity = input.quantity ?? Number(item.quantity);
        const unitPrice = input.unitPrice !== undefined ? input.unitPrice : decimalToCents(item.unitPrice);
        const total = unitPrice * quantity;

        await tx.serviceOrderItem.update({
          where: { id: input.id },
          data: {
            description: input.description ?? undefined,
            quantity: input.quantity !== undefined ? new Prisma.Decimal(input.quantity) : undefined,
            unitPrice: input.unitPrice !== undefined ? centsToPrisma(input.unitPrice) : undefined,
            costPrice: input.costPrice !== undefined ? centsToPrisma(input.costPrice) : undefined,
            total: centsToPrisma(total),
          },
        });

        await recalculateOrderTotals(tx, item.orderId, item.tenantId);
        return { success: true };
      });
    }),

  // ── REMOVE ITEM ──
  removeItem: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const item = await tx.serviceOrderItem.findUnique({ where: { id: input.id } });
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });

        // Paridade Laravel `OrdemServicoController::removerItem`: nao remover item
        // de OS ja paga ou entregue (quebraria historico financeiro).
        const order = await tx.serviceOrder.findUnique({
          where: { id: item.orderId },
          select: { status: true },
        });
        if (order && ["PAID", "DELIVERED"].includes(order.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "OS ja paga nao pode ter itens removidos.",
          });
        }

        // Release stock for product items
        if (item.type === "PRODUCT" && item.productId) {
          await releaseStockForOsItem(tx, ctx.tenantId, ctx.session.user.id, {
            productId: item.productId,
            quantity: Number(item.quantity),
            orderId: item.orderId,
            reason: `Item removido da OS: ${item.description}`,
          });
        }

        await tx.serviceOrderItem.delete({ where: { id: input.id } });
        await recalculateOrderTotals(tx, item.orderId, item.tenantId);

        return { success: true };
      });
    }),

  // ── REGISTER PAYMENT ──
  registerPayment: tenantProcedure
    .input(registerPaymentSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.id } });
        if (!order || order.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });

        if (order.status !== "COMPLETED") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Pagamento so pode ser registrado em OS concluida.",
          });
        }

        const userId = ctx.session.user.id;
        const isAdmin = ctx.session.user.isSuperAdmin === true;
        const orderTotal = Number(order.totalAmount);
        const canSkipPdv = orderTotal <= 0 || order.isWarranty;

        // C3: Exigir caixa aberto para pagamentos via PDV.
        // Excecoes: garantia / OS sem valor; admin com flag `force`.
        const openSession = await tx.cashSession.findFirst({
          where: { userId, closedAt: null },
        });

        if (!openSession && !canSkipPdv && !(input.force && isAdmin)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Voce precisa abrir o caixa antes de registrar um recebimento.",
          });
        }

        // C7: Aplicar desconto de recompensa, se fornecido.
        // Carrega RewardAction, valida (APPROVED, nao expirado, cliente bate),
        // calcula desconto adicional e marca como USED.
        let rewardDiscountCents = 0;
        let rewardNote = "";
        if (input.rewardActionId) {
          const action = await tx.rewardAction.findUnique({
            where: { id: input.rewardActionId },
          });
          if (!action) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Recompensa nao encontrada." });
          }
          if (action.customerId !== order.customerId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Recompensa pertence a outro cliente.",
            });
          }
          if (action.status !== "APPROVED") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Recompensa nao esta disponivel.",
            });
          }
          if (action.expiresAt && action.expiresAt < new Date()) {
            await tx.rewardAction.update({
              where: { id: action.id },
              data: { status: "EXPIRED" },
            });
            throw new TRPCError({ code: "BAD_REQUEST", message: "Recompensa expirada." });
          }

          // Calcular desconto. Aceita DISCOUNT (com percentage) ou CASHBACK (value).
          const percent = Number(action.percentage);
          const value = Number(action.value);
          const discountFromPercent = percent > 0 ? Math.round((orderTotal * percent) / 100 * 100) : 0;
          const discountFromValue = value > 0 ? Math.round(value * 100) : 0;
          rewardDiscountCents = Math.max(discountFromPercent, discountFromValue);
          rewardNote = ` | Desconto recompensa: ${percent > 0 ? `${percent}%` : `R$ ${value.toFixed(2)}`}`;

          await tx.rewardAction.update({
            where: { id: action.id },
            data: {
              status: "USED",
              usedAt: new Date(),
              usedInOsId: order.id,
            },
          });
        }

        const discount = (input.paymentDiscount ?? 0) + rewardDiscountCents;

        await tx.serviceOrder.update({
          where: { id: input.id },
          data: {
            status: "PAID",
            paymentMethod: input.paymentMethod,
            paidAmount: centsToPrisma(input.paidAmount),
            paymentDiscount: centsToPrisma(discount),
            paymentNotes: (input.paymentNotes ?? "") + rewardNote || null,
            paymentDate: new Date(),
          },
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.id,
            userId,
            previousStatus: order.status,
            newStatus: "PAID",
            notes: `Pagamento registrado: ${input.paymentMethod}${rewardNote}`,
          },
        });

        // ── Register cash movement (parity with Laravel CaixaService) ──
        if (openSession) {
          await tx.cashMovement.create({
            data: {
              tenantId: ctx.tenantId,
              cashSessionId: openSession.id,
              type: "SALE",
              amount: centsToPrisma(input.paidAmount),
              nature: "INCOME",
              paymentMethod: input.paymentMethod,
              description: `Pagamento OS ${order.number}`,
              referenceType: "service_order",
              referenceId: order.id,
              createdByUserId: userId,
            },
          });
        }

        // ── Generate financial receivable (parity with Laravel gerarRecebiveisOS) ──
        const paidAmountDecimal = centsToPrisma(input.paidAmount);
        const instantPayment = ["dinheiro", "pix"].includes(input.paymentMethod);

        // Avoid duplicates
        const existingReceivable = await tx.financialTransaction.findFirst({
          where: {
            referenceType: "service_order",
            referenceId: order.id,
            type: "RECEIVABLE",
            status: { not: "CANCELLED" },
            deletedAt: null,
          },
        });

        if (!existingReceivable && input.paidAmount > 0) {
          // Load customer name
          const customer = await tx.customer.findUnique({
            where: { id: order.customerId },
            select: { name: true },
          });

          const receivable = await tx.financialTransaction.create({
            data: {
              tenantId: ctx.tenantId,
              type: "RECEIVABLE",
              status: instantPayment ? "PAID" : "PENDING",
              description: `OS #${order.number}`,
              category: "Ordem de Servico",
              customerName: customer?.name ?? null,
              customerId: order.customerId,
              totalAmount: paidAmountDecimal,
              paidAmount: instantPayment ? paidAmountDecimal : new Prisma.Decimal(0),
              dueDate: new Date(),
              emissionDate: new Date(),
              paidAt: instantPayment ? new Date() : null,
              paymentMethod: input.paymentMethod,
              referenceType: "service_order",
              referenceId: order.id,
            },
          });

          // Create single installment
          await tx.installment.create({
            data: {
              tenantId: ctx.tenantId,
              transactionId: receivable.id,
              number: 1,
              amount: paidAmountDecimal,
              dueDate: new Date(),
              paidAmount: instantPayment ? paidAmountDecimal : new Prisma.Decimal(0),
              paidAt: instantPayment ? new Date() : null,
              paymentMethod: instantPayment ? input.paymentMethod : null,
              status: instantPayment ? "PAID" : "PENDING",
            },
          });
        }

        return { success: true };
      });
    }),

  // ── UPDATE COSTS (inline) ──
  updateCosts: tenantProcedure
    .input(updateCostsSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.serviceOrder.update({
          where: { id: input.id },
          data: {
            partsCost: centsToPrisma(input.partsCost),
            otherCost: centsToPrisma(input.otherCost),
          },
        });
        return { success: true };
      });
    }),

  // ── CONFIRM PHYSICAL SIGNATURE ──
  confirmPhysicalSignature: tenantProcedure
    .input(confirmPhysicalSignatureSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });

         
        const data: any = {};
        let note = "";

        if (input.type === "entry") {
          data.physicalSignature = true;
          data.signatureSignedAt = new Date();
          note = "Assinatura fisica de entrada confirmada";
        } else if (input.type === "delivery") {
          // Paridade Laravel `confirmarTermoEntregaFisico` (OrdemServicoController:1046):
          // exige status in [PAID, READY_FOR_PICKUP] antes de marcar entregue.
          // Caso contrario, registra a assinatura fisica mas NAO avanca para DELIVERED
          // (defesa contra pular o fluxo de pagamento via "assinatura fisica").
          if (["PAID", "READY_FOR_PICKUP"].includes(order.status)) {
            data.status = "DELIVERED";
            data.deliveredDate = new Date();
            note = "Assinatura fisica do termo de entrega confirmada — equipamento entregue";
          } else {
            note = "Assinatura fisica do termo de entrega registrada (aguardando pagamento para entregar)";
          }
          data.deliveryTermSigned = true;
          data.deliveryTermPhysical = true;
          data.deliveryTermSignedAt = new Date();
        } else if (input.type === "return") {
          data.returnTermSigned = true;
          data.returnTermPhysical = true;
          data.returnTermSignedAt = new Date();
          data.status = "CANCELLED";
          data.cancellationReason = input.reason ?? "Equipamento devolvido ao cliente";
          note = "Assinatura fisica do termo de devolucao confirmada — OS cancelada";
        }

        await tx.serviceOrder.update({ where: { id: input.orderId }, data });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: data.status ?? order.status,
            notes: note,
          },
        });

        return { success: true };
      });
    }),

  // ── SEND TO LAB ──
  sendToLab: tenantProcedure
    .input(sendToLabSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: {
            sentToLab: true,
            labReceived: false,
            deliveryPersonId: input.deliveryPersonId ?? null,
          },
        });

        // Paridade Laravel `enviarParaLaboratorio` (OrdemServicoController:2780-2820):
        // dispara WhatsApp para o entregador atribuido. Best-effort.
        let whatsappSent = false;
        if (input.deliveryPersonId && input.message) {
          const deliveryPerson = await tx.deliveryPerson.findUnique({
            where: { id: input.deliveryPersonId },
          });
          if (deliveryPerson?.phone) {
            try {
              const result = await sendTextMessage(deliveryPerson.phone, input.message);
              whatsappSent = result.success;
            } catch {
              // best-effort
            }
          }
        }

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: null,
            newStatus: "IN_PROGRESS",
            notes: whatsappSent
              ? "Aparelho enviado ao laboratorio externo (entregador notificado via WhatsApp)"
              : "Aparelho enviado ao laboratorio externo",
          },
        });

        return { success: true, whatsappSent };
      });
    }),

  // ── RECEIVE FROM LAB ──
  receiveFromLab: tenantProcedure
    .input(receiveFromLabSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: { labReceived: true },
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: null,
            newStatus: "IN_PROGRESS",
            notes: "Aparelho retornou do laboratorio externo",
          },
        });

        return { success: true };
      });
    }),

  // ── CANCEL LAB ──
  cancelLab: tenantProcedure
    .input(cancelLabSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: { sentToLab: false, labReceived: false, deliveryPersonId: null },
        });
        // Paridade Laravel: registrar evento no historico para rastreabilidade.
        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: null,
            newStatus: "IN_PROGRESS",
            notes: "Envio para laboratorio externo cancelado",
          },
        });
        return { success: true };
      });
    }),

  // ── CREATE QUOTE (orcamento adicional) ──
  createQuote: tenantProcedure
    .input(createQuoteSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order || order.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });

        if (order.budgetPending) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Ja existe orcamento pendente." });
        }

        if (["CANCELLED", "DELIVERED", "READY_FOR_PICKUP"].includes(order.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nao e possivel criar orcamento para esta OS." });
        }

        const newPartsAmount = input.newPartsAmount ?? 0;
        const newDiscount = input.newDiscount ?? 0;
        const newTotal = input.newServiceAmount + newPartsAmount - newDiscount;

        const quote = await tx.serviceOrderQuote.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousServiceAmount: order.serviceAmount,
            previousPartsAmount: order.partsAmount,
            previousDiscount: order.discount,
            previousTotal: order.totalAmount,
            newServiceAmount: centsToPrisma(input.newServiceAmount),
            newPartsAmount: centsToPrisma(newPartsAmount),
            newDiscount: centsToPrisma(newDiscount),
            newTotal: centsToPrisma(newTotal),
            reason: input.reason,
            additionalServices: input.additionalServices ?? null,
            status: "pending",
            approvalLink: generateQuoteLink(),
          },
        });

        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: {
            pendingQuoteId: quote.id,
            budgetPending: true,
          },
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: order.status,
            notes: `Orcamento criado. Motivo: ${input.reason}`,
          },
        });

        return { id: quote.id, approvalLink: quote.approvalLink };
      });
    }),

  // ── CANCEL QUOTE ──
  cancelQuote: tenantProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order || !order.pendingQuoteId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum orcamento pendente." });
        }

        await tx.serviceOrderQuote.update({
          where: { id: order.pendingQuoteId },
          data: { status: "rejected", rejectedAt: new Date(), customerNotes: "Cancelado pela equipe" },
        });

        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: { pendingQuoteId: null, budgetPending: false },
        });

        return { success: true };
      });
    }),

  // ── APPROVE QUOTE MANUALLY (admin) ──
  approveQuoteManually: tenantProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order || !order.pendingQuoteId) {
          throw new TRPCError({ code: "BAD_REQUEST" });
        }

        const quote = await tx.serviceOrderQuote.findUnique({ where: { id: order.pendingQuoteId } });
        if (!quote || quote.status !== "pending") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Orcamento nao encontrado ou ja processado." });
        }

        // Approve
        await tx.serviceOrderQuote.update({
          where: { id: quote.id },
          data: { status: "approved", approvedAt: new Date(), customerNotes: "Aprovado manualmente pelo administrador" },
        });

        // Update OS values
        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: {
            serviceAmount: quote.newServiceAmount,
            partsAmount: quote.newPartsAmount,
            discount: quote.newDiscount,
            totalAmount: quote.newTotal,
            pendingQuoteId: null,
            budgetPending: false,
          },
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: order.status,
            notes: "Orcamento aprovado manualmente pelo administrador",
          },
        });

        return { success: true };
      });
    }),

  // ── PUBLIC: get by public link ──
  byPublicLink: publicProcedure
    .input(z.object({ link: z.string().min(1) }))
    .query(async ({ input }) => {
      // Public route - use withAdmin to bypass RLS
      return withAdmin(async (tx) => {
        const order = await tx.serviceOrder.findFirst({
          where: { publicLink: input.link, deletedAt: null },
          include: {
            items: true,
            history: { orderBy: { createdAt: "desc" }, take: 20 },
          },
        });

        if (!order) {
          throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        }

        // Load customer
        const customer = await tx.customer.findUnique({
          where: { id: order.customerId },
          select: { name: true, phone: true },
        });

        // Load tenant settings for branding
        const tenant = await tx.tenant.findUnique({
          where: { id: order.tenantId },
          select: { name: true },
        });

        return {
          number: order.number,
          status: order.status,
          deviceType: order.deviceType,
          deviceModel: order.deviceModel,
          reportedProblem: order.reportedProblem,
          diagnosedProblem: order.diagnosedProblem,
          totalAmount: decimalToCents(order.totalAmount),
          entryDate: order.entryDate,
          estimatedDate: order.estimatedDate,
          completedDate: order.completedDate,
          deliveredDate: order.deliveredDate,
          customerName: customer?.name ?? "—",
          tenantName: tenant?.name ?? "Arena Tech",
          items: order.items.map((i) => ({
            description: i.description,
            quantity: Number(i.quantity),
            total: decimalToCents(i.total),
          })),
          history: order.history.map((h) => ({
            newStatus: h.newStatus,
            notes: h.notes,
            createdAt: h.createdAt,
          })),
        };
      });
    }),

  // ── PUBLIC: get quote for approval ──
  getQuoteByLink: publicProcedure
    .input(z.object({ link: z.string().min(1) }))
    .query(async ({ input }) => {
      return withAdmin(async (tx) => {
        const quote = await tx.serviceOrderQuote.findFirst({
          where: { approvalLink: input.link },
          include: {
            order: {
              select: {
                number: true,
                customerId: true,
                deviceType: true,
                deviceModel: true,
                tenantId: true,
              },
            },
          },
        });

        if (!quote) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Orcamento nao encontrado" });
        }

        const customer = await tx.customer.findUnique({
          where: { id: quote.order.customerId },
          select: { name: true },
        });

        const tenant = await tx.tenant.findUnique({
          where: { id: quote.order.tenantId },
          select: { name: true },
        });

        return {
          ...serializeQuote(quote),
          orderNumber: quote.order.number,
          customerName: customer?.name ?? "—",
          tenantName: tenant?.name ?? "Arena Tech",
          deviceType: quote.order.deviceType,
          deviceModel: quote.order.deviceModel,
        };
      });
    }),

  // ── PUBLIC: respond to quote ──
  respondToQuote: publicProcedure
    .input(respondQuoteSchema)
    .mutation(async ({ input }) => {
      return withAdmin(async (tx) => {
        const quote = await tx.serviceOrderQuote.findFirst({
          where: { approvalLink: input.link },
        });

        if (!quote) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Orcamento nao encontrado" });
        }

        if (quote.status !== "pending") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Este orcamento ja foi processado." });
        }

        if (input.action === "approve") {
          await tx.serviceOrderQuote.update({
            where: { id: quote.id },
            data: {
              status: "approved",
              approvedAt: new Date(),
              customerNotes: input.customerNotes ?? null,
            },
          });

          // Update OS values
          await tx.serviceOrder.update({
            where: { id: quote.orderId },
            data: {
              serviceAmount: quote.newServiceAmount,
              partsAmount: quote.newPartsAmount,
              discount: quote.newDiscount,
              totalAmount: quote.newTotal,
              pendingQuoteId: null,
              budgetPending: false,
            },
          });

          await tx.serviceOrderHistory.create({
            data: {
              tenantId: quote.tenantId,
              orderId: quote.orderId,
              userId: quote.userId,
              previousStatus: null,
              newStatus: "APPROVED",
              notes: `Orcamento aprovado pelo cliente${input.customerNotes ? ". Obs: " + input.customerNotes : ""}`,
            },
          });
        } else {
          await tx.serviceOrderQuote.update({
            where: { id: quote.id },
            data: {
              status: "rejected",
              rejectedAt: new Date(),
              customerNotes: input.customerNotes ?? null,
            },
          });

          await tx.serviceOrder.update({
            where: { id: quote.orderId },
            data: { pendingQuoteId: null, budgetPending: false },
          });

          await tx.serviceOrderHistory.create({
            data: {
              tenantId: quote.tenantId,
              orderId: quote.orderId,
              userId: quote.userId,
              previousStatus: null,
              newStatus: "IN_DIAGNOSIS",
              notes: `Orcamento rejeitado pelo cliente${input.customerNotes ? ". Obs: " + input.customerNotes : ""}`,
            },
          });
        }

        return { success: true, action: input.action };
      });
    }),

  // ── SEND FOR DIGITAL SIGNATURE (Autentique) ──
  sendForSignature: tenantProcedure
    .input(z.object({
      orderId: z.string().uuid(),
      // Numero customizado para envio (sobrescreve telefone do cliente). Opcional.
      whatsappOverride: z.string().min(10).max(20).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // ETAPA 1 — fetch dentro de transacao RLS (rapida).
      const { order, customer, whatsapp, wasResend } = await ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({
          where: { id: input.orderId },
        });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });

        // Paridade Laravel: so bloqueia se ja esta assinado (permite reenviar).
        if (order.signatureSignedAt || order.physicalSignature) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "OS ja esta assinada." });
        }

        const customer = await tx.customer.findUnique({
          where: { id: order.customerId },
          select: { name: true, phone: true, phoneSecondary: true },
        });
        if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente nao encontrado" });

        const whatsapp = input.whatsappOverride || customer.phone || customer.phoneSecondary;
        if (!whatsapp) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cliente sem telefone cadastrado. Informe um numero." });
        }
        return { order, customer, whatsapp, wasResend: !!order.signatureDocumentId };
      });

      // ETAPA 2 — IO externo FORA da transacao (PDF + Autentique + Meta).
      // Operacoes podem demorar >5s e estourariam o timeout da tx interativa.
      let pdfBuffer: Buffer;
      try {
        const buf = await buildServiceOrderPdf(ctx.tenantId, input.orderId);
        if (!buf) throw new Error("OS nao encontrada");
        pdfBuffer = buf;
      } catch (err) {
        logger.error("Failed to build OS PDF for signature", { orderId: input.orderId, error: err });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao gerar PDF da OS para assinatura" });
      }

      const result = await createDocumentWithLink(
        `OS ${order.number} - Termo de Servico`,
        [{ name: customer.name, whatsapp: formatWhatsApp(whatsapp) }],
        pdfBuffer,
      );
      if (!result.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Erro ao enviar para Autentique" });
      }

      // ETAPA 3 — persiste resultado (transacao curta).
      await ctx.withTenant(async (tx) => {
        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: {
            signatureDocumentId: result.documentId ?? null,
            signatureUrl: result.signatureLink ?? null,
            signatureSentAt: new Date(),
          },
        });
        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: order.status,
            notes: wasResend
              ? "Documento reenviado para assinatura digital (Autentique)"
              : "Documento enviado para assinatura digital (Autentique)",
          },
        });
      });

      // ETAPA 4 — envia via Meta Cloud (fora de tx tambem; falha nao reverte).
      if (result.signatureLink) {
        const pdfToken = createPublicPdfToken(ctx.tenantId, input.orderId, 60 * 60 * 1000);
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
        const pdfUrl = `${appUrl}/api/whatsapp-media/os/pdf/${pdfToken}`;
        const autentiqueToken = extractShortlinkToken(result.signatureLink);
        const caption =
          `📋 *Assinatura - OS #${order.number}*\n\n` +
          `Olá, ${customer.name}! Para assinar digitalmente:\n${result.signatureLink}\n\n` +
          `Após assinar, seu aparelho estará liberado para o serviço.`;
        const wa = await sendPdfWithFallback({
          phone: whatsapp,
          pdfUrl,
          fileName: `OS_${order.number}_assinatura.pdf`,
          caption,
          contexto: autentiqueToken ? "os_termo_pdf_link" : "os_termo_pdf",
          params: [customer.name, order.number],
          urlButtonParam: autentiqueToken ?? undefined,
        });
        if (!wa.success) {
          logger.warn("Falha ao enviar link de assinatura via WhatsApp", {
            orderId: input.orderId, error: wa.error,
          });
        } else {
          logger.info("Link de assinatura enviado por WhatsApp", {
            orderId: input.orderId, via: wa.via, templateUsed: wa.templateUsed, messageId: wa.messageId,
          });
        }
      }

      logger.info("OS sent for digital signature", { orderId: input.orderId, documentId: result.documentId });
      return { success: true, signatureLink: result.signatureLink };
    }),

  // ── CHECK SIGNATURE STATUS (Autentique) ──
  checkSignatureStatus: tenantProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({
          where: { id: input.orderId },
        });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        if (!order.signatureDocumentId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum documento de assinatura enviado." });
        }

        const status = await getDocumentStatus(order.signatureDocumentId);

        if (!status.success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: status.error ?? "Erro ao consultar Autentique" });
        }

        if (status.signed && !order.signatureSignedAt) {
          await tx.serviceOrder.update({
            where: { id: input.orderId },
            data: { signatureSignedAt: new Date() },
          });

          await tx.serviceOrderHistory.create({
            data: {
              tenantId: ctx.tenantId,
              orderId: input.orderId,
              userId: ctx.session.user.id,
              previousStatus: order.status,
              newStatus: order.status,
              notes: "Assinatura digital confirmada via Autentique",
            },
          });
        }

        return {
          signed: status.signed,
          signaturesCompleted: status.signaturesCompleted,
          totalSignatures: status.totalSignatures,
        };
      });
    }),

  // ── LIST TECHNICIANS ──
  listTechnicians: tenantProcedure.query(async ({ ctx }) => {
    // Technicians = users linked to this tenant
    const userTenants = await withAdmin(async (adminTx) => {
      return adminTx.userTenant.findMany({
        where: { tenantId: ctx.tenantId },
        select: {
          user: { select: { id: true, name: true } },
          role: true,
        },
      });
    });

    return userTenants.map((ut) => ({
      id: ut.user.id,
      name: ut.user.name,
      role: ut.role,
    }));
  }),

  // ── LIST VENDORS ──
  listVendors: tenantProcedure.query(async ({ ctx }) => {
    const userTenants = await withAdmin(async (adminTx) => {
      return adminTx.userTenant.findMany({
        where: { tenantId: ctx.tenantId },
        select: {
          user: { select: { id: true, name: true } },
          role: true,
        },
      });
    });

    return userTenants.map((ut) => ({
      id: ut.user.id,
      name: ut.user.name,
      role: ut.role,
    }));
  }),

  // ═══════════════════════════════════════
  // TECHNICIAN REPORT
  // ═══════════════════════════════════════

  technicianReport: tenantProcedure
    .input(technicianReportSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const where: Prisma.ServiceOrderWhereInput = {
          tenantId: ctx.tenantId,
        };

        if (input.dateFrom || input.dateTo) {
          where.createdAt = {};
          if (input.dateFrom) where.createdAt.gte = new Date(input.dateFrom);
          if (input.dateTo) where.createdAt.lte = new Date(input.dateTo + "T23:59:59");
        }
        if (input.technicianId) where.technicianId = input.technicianId;

        const orders = await tx.serviceOrder.findMany({
          where,
          select: {
            id: true,
            technicianId: true,
            status: true,
            serviceAmount: true,
            partsAmount: true,
            totalAmount: true,
            partsCost: true,
            otherCost: true,
            createdAt: true,
            completedDate: true,
          },
        });

        // Group by technician
        const byTech = new Map<string, {
          technicianId: string;
          totalOs: number;
          completed: number;
          cancelled: number;
          serviceValue: number;
          partsValue: number;
          totalValue: number;
          partsCost: number;
          otherCost: number;
          totalDays: number;
          completedCount: number;
        }>();

        for (const o of orders) {
          const techId = o.technicianId ?? "__unassigned__";
          let entry = byTech.get(techId);
          if (!entry) {
            entry = {
              technicianId: techId,
              totalOs: 0, completed: 0, cancelled: 0,
              serviceValue: 0, partsValue: 0, totalValue: 0,
              partsCost: 0, otherCost: 0,
              totalDays: 0, completedCount: 0,
            };
            byTech.set(techId, entry);
          }
          entry.totalOs++;
          if (o.status === "COMPLETED" || o.status === "DELIVERED") entry.completed++;
          if (o.status === "CANCELLED") entry.cancelled++;
          entry.serviceValue += Number(o.serviceAmount ?? 0);
          entry.partsValue += Number(o.partsAmount ?? 0);
          entry.totalValue += Number(o.totalAmount ?? 0);
          entry.partsCost += Number(o.partsCost ?? 0);
          entry.otherCost += Number(o.otherCost ?? 0);

          if (o.completedDate && o.createdAt) {
            const days = (o.completedDate.getTime() - o.createdAt.getTime()) / (1000 * 60 * 60 * 24);
            entry.totalDays += days;
            entry.completedCount++;
          }
        }

        // Get technician names
        const techIds = [...byTech.keys()].filter((id) => id !== "__unassigned__");
        const users = await withAdmin(async (adminTx) => {
          return adminTx.user.findMany({
            where: { id: { in: techIds } },
            select: { id: true, name: true },
          });
        });
        const nameMap = new Map(users.map((u) => [u.id, u.name]));

        const items = [...byTech.values()]
          .map((e) => {
            const profit = e.totalValue - e.partsCost - e.otherCost;
            const ticketMedio = e.completed > 0 ? e.totalValue / e.completed : 0;
            const avgDays = e.completedCount > 0 ? Math.round(e.totalDays / e.completedCount) : null;
            return {
              technicianId: e.technicianId,
              technicianName: nameMap.get(e.technicianId) ?? "Nao identificado",
              totalOs: e.totalOs,
              completed: e.completed,
              cancelled: e.cancelled,
              serviceValue: Math.round(e.serviceValue * 100),
              partsValue: Math.round(e.partsValue * 100),
              totalValue: Math.round(e.totalValue * 100),
              partsCost: Math.round(e.partsCost * 100),
              otherCost: Math.round(e.otherCost * 100),
              profit: Math.round(profit * 100),
              ticketMedio: Math.round(ticketMedio * 100),
              avgDays,
            };
          })
          .sort((a, b) => b.totalValue - a.totalValue);

        const totals = items.reduce(
          (acc, i) => {
            acc.totalOs += i.totalOs;
            acc.completed += i.completed;
            acc.cancelled += i.cancelled;
            acc.serviceValue += i.serviceValue;
            acc.partsValue += i.partsValue;
            acc.totalValue += i.totalValue;
            acc.partsCost += i.partsCost;
            acc.otherCost += i.otherCost;
            acc.profit += i.profit;
            return acc;
          },
          { totalOs: 0, completed: 0, cancelled: 0, serviceValue: 0, partsValue: 0, totalValue: 0, partsCost: 0, otherCost: 0, profit: 0 }
        );
        const ticketMedio = totals.completed > 0 ? Math.round(totals.totalValue / totals.completed) : 0;

        return { items, totals: { ...totals, ticketMedio } };
      });
    }),

  // ═══════════════════════════════════════
  // SPRINT 1A — NEW PROCEDURES
  // ═══════════════════════════════════════

  // ── 1. GET BY CUSTOMER (warranty check) ──
  getByCustomer: tenantProcedure
    .input(getByCustomerSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const orders = await tx.serviceOrder.findMany({
          where: {
            customerId: input.customerId,
            deletedAt: null,
            status: { in: ["DELIVERED", "READY_FOR_PICKUP", "PAID"] },
          },
          include: {
            items: { select: { description: true, type: true } },
          },
          orderBy: { createdAt: "desc" },
        });

        const techIds = [...new Set(orders.map((o) => o.technicianId).filter(Boolean))] as string[];
        let techMap = new Map<string, string>();
        if (techIds.length > 0) {
          const techs = await withAdmin(async (adminTx) =>
            adminTx.user.findMany({
              where: { id: { in: techIds } },
              select: { id: true, name: true },
            }),
          );
          techMap = new Map(techs.map((t) => [t.id, t.name]));
        }

        return orders.map((o) => ({
          id: o.id,
          number: o.number,
          status: o.status,
          deviceType: o.deviceType,
          deviceModel: o.deviceModel,
          deviceBrand: o.deviceBrand,
          serialNumber: o.serialNumber,
          imei: o.imei,
          devicePassword: o.devicePassword,
          reportedProblem: o.reportedProblem,
          totalAmount: decimalToCents(o.totalAmount),
          technicianName: o.technicianId ? (techMap.get(o.technicianId) ?? null) : null,
          warrantyMonths: o.warrantyMonths,
          completedDate: o.completedDate,
          entryDate: o.entryDate,
          items: o.items.map((i) => ({ description: i.description, type: i.type })),
        }));
      });
    }),

  // ── 2. SEARCH PARTS (stock products) ──
  searchParts: tenantProcedure
    .input(searchPartsSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const limit = input.limit ?? 20;
        const where: Prisma.ProductWhereInput = {
          active: true,
          isSerialized: false,
          deletedAt: null,
        };

        if (input.query) {
          const q = input.query.trim();
          where.OR = [
            { name: { contains: q, mode: "insensitive" } },
            { sku: { contains: q, mode: "insensitive" } },
            { brand: { contains: q, mode: "insensitive" } },
          ];
        }

        const products = await tx.product.findMany({
          where,
          orderBy: { name: "asc" },
          take: limit,
        });

        return products.map((p) => ({
          id: p.id,
          name: p.name,
          brand: p.brand,
          sku: p.sku,
          stock: 0, // TODO: Estoque-B will provide real stock
          costPrice: decimalToCents(p.costPrice),
          salePrice: decimalToCents(p.salePrice),
        }));
      });
    }),

  // ── 3. SEND TRACKING ──
  sendTracking: tenantProcedure
    .input(sendTrackingSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order || order.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });

        if (!order.publicLink) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "OS sem link publico configurado." });
        }

        const customer = await tx.customer.findUnique({
          where: { id: order.customerId },
          select: { name: true },
        });

        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
        const trackingUrl = `${appUrl}/os/${order.publicLink}`;
        const customerName = customer?.name ?? "Cliente";

        const text = `Ola, ${customerName}!\n\nSua Ordem de Servico ${order.number} foi aberta. Acompanhe o status em tempo real pelo link:\n${trackingUrl}\n\nArena Tech`;

        const result = await sendTextMessage(input.phone, text);

        if (!result.success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Falha ao enviar WhatsApp" });
        }

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: order.status,
            notes: "Link de rastreamento enviado via WhatsApp",
          },
        });

        return { success: true };
      });
    }),

  // ── 4. NOTIFY DELIVERY PERSON ──
  notifyDeliveryPerson: tenantProcedure
    .input(notifyDeliveryPersonSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order || order.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });

        const deliveryPerson = await tx.deliveryPerson.findUnique({
          where: { id: input.deliveryPersonId },
        });
        if (!deliveryPerson) throw new TRPCError({ code: "NOT_FOUND", message: "Entregador nao encontrado" });

        let whatsappSent = false;
        if (deliveryPerson.phone) {
          const result = await sendTextMessage(deliveryPerson.phone, input.message);
          whatsappSent = result.success;
          if (!result.success) {
            logger.warn("Falha ao enviar WhatsApp para entregador", {
              orderId: input.orderId,
              deliveryPersonId: deliveryPerson.id,
              error: result.error,
            });
          }
        }

        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: { deliveryPersonId: deliveryPerson.id },
        });

        const context = input.context ?? "generico";
        const noteText = context === "retirada"
          ? `Solicitada retirada do aparelho no laboratorio. Entregador: ${deliveryPerson.name}`
          : `Mensagem enviada ao entregador: ${deliveryPerson.name}`;

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: order.status,
            notes: `${noteText} (WhatsApp ${whatsappSent ? "enviado" : "nao enviado"})`,
          },
        });

        return { success: true, whatsappSent };
      });
    }),

  // ── 5. SEND DELIVERY TERM ──
  sendDeliveryTerm: tenantProcedure
    .input(sendDeliveryTermSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order || order.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });

        if (!["PAID", "READY_FOR_PICKUP", "DELIVERED"].includes(order.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "O termo de entrega so pode ser enviado apos o pagamento da OS.",
          });
        }

        const customer = await tx.customer.findUnique({
          where: { id: order.customerId },
          select: { name: true, phone: true },
        });
        if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente nao encontrado" });

        const phone = input.phone ?? customer.phone;
        if (!phone) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum telefone disponivel." });

        // Generate delivery term PDF
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
        const pdfUrl = `${appUrl}/api/service-orders/${input.orderId}/termo-entrega`;
        let pdfBuffer: Buffer;
        try {
          const res = await fetch(pdfUrl, { signal: AbortSignal.timeout(15_000) });
          if (!res.ok) throw new Error(`PDF generation failed: ${res.status}`);
          pdfBuffer = Buffer.from(await res.arrayBuffer());
        } catch (err) {
          logger.error("Failed to fetch delivery term PDF", { orderId: input.orderId, error: err });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao gerar PDF do termo de entrega" });
        }

        const result = await createDocumentWithLink(
          `Termo de Entrega - OS ${order.number}`,
          [{ name: customer.name, whatsapp: formatWhatsApp(phone) }],
          pdfBuffer,
        );

        if (!result.success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Erro ao enviar para Autentique" });
        }

        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: {
            deliveryTermSent: true,
            deliveryTermSentAt: new Date(),
            deliveryTermAutentiqueId: result.documentId ?? null,
            deliveryTermLink: result.signatureLink ?? null,
          },
        });

        // Send via WhatsApp
        if (result.signatureLink) {
          const caption = `Termo de Entrega - OS #${order.number}\n\nOla, ${customer.name}! Para assinar digitalmente:\n${result.signatureLink}`;
          await sendTextMessage(phone, caption);
        }

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: order.status,
            notes: "Termo de entrega enviado para assinatura digital via WhatsApp",
          },
        });

        return { success: true, signatureLink: result.signatureLink };
      });
    }),

  // ── 6. CONFIRM PHYSICAL DELIVERY TERM ──
  confirmPhysicalDeliveryTerm: tenantProcedure
    .input(confirmPhysicalDeliveryTermSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });

        if (!["PAID", "READY_FOR_PICKUP"].includes(order.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "O termo de entrega so pode ser confirmado apos o pagamento da OS.",
          });
        }

        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: {
            deliveryTermSigned: true,
            deliveryTermPhysical: true,
            deliveryTermSignedAt: new Date(),
            status: "DELIVERED",
            deliveredDate: new Date(),
          },
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: "DELIVERED",
            notes: "Assinatura fisica do termo de entrega confirmada e equipamento entregue ao cliente",
          },
        });

        return { success: true };
      });
    }),

  // ── 7. CHECK DELIVERY TERM STATUS ──
  checkDeliveryTermStatus: tenantProcedure
    .input(checkDeliveryTermStatusSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });

        if (order.deliveryTermSigned) {
          return { signed: true, alreadySigned: true };
        }

        if (!order.deliveryTermAutentiqueId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Termo de entrega nao foi enviado para assinatura digital." });
        }

        const status = await getDocumentStatus(order.deliveryTermAutentiqueId);
        if (!status.success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: status.error ?? "Erro ao consultar Autentique" });
        }

        if (status.signed) {
          await tx.serviceOrder.update({
            where: { id: input.orderId },
            data: {
              deliveryTermSigned: true,
              deliveryTermSignedAt: new Date(),
              status: "DELIVERED",
              deliveredDate: new Date(),
            },
          });

          await tx.serviceOrderHistory.create({
            data: {
              tenantId: ctx.tenantId,
              orderId: input.orderId,
              userId: ctx.session.user.id,
              previousStatus: order.status,
              newStatus: "DELIVERED",
              notes: "Termo de entrega assinado digitalmente e equipamento entregue ao cliente",
            },
          });
        }

        return { signed: status.signed, alreadySigned: false };
      });
    }),

  // ── 8. SEND RETURN TERM ──
  sendReturnTerm: tenantProcedure
    .input(sendReturnTermSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order || order.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });

        const customer = await tx.customer.findUnique({
          where: { id: order.customerId },
          select: { name: true, phone: true },
        });
        if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente nao encontrado" });

        const phone = input.phone ?? customer.phone;
        if (!phone) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum telefone disponivel." });

        // Generate return term PDF
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
        const pdfUrl = `${appUrl}/api/service-orders/${input.orderId}/termo-devolucao`;
        let pdfBuffer: Buffer;
        try {
          const res = await fetch(pdfUrl, { signal: AbortSignal.timeout(15_000) });
          if (!res.ok) throw new Error(`PDF generation failed: ${res.status}`);
          pdfBuffer = Buffer.from(await res.arrayBuffer());
        } catch (err) {
          logger.error("Failed to fetch return term PDF", { orderId: input.orderId, error: err });
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao gerar PDF do termo de devolucao" });
        }

        const result = await createDocumentWithLink(
          `Termo de Devolucao - OS ${order.number}`,
          [{ name: customer.name, whatsapp: formatWhatsApp(phone) }],
          pdfBuffer,
        );

        if (!result.success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Erro ao enviar para Autentique" });
        }

        const reason = input.reason ?? "Equipamento devolvido ao cliente";

        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: {
            returnTermSent: true,
            returnTermSentAt: new Date(),
            returnTermAutentiqueId: result.documentId ?? null,
            returnTermLink: result.signatureLink ?? null,
            cancellationReason: reason,
          },
        });

        // Send via WhatsApp
        if (result.signatureLink) {
          const caption = `Termo de Devolucao - OS #${order.number}\n\nOla, ${customer.name}! Para assinar digitalmente:\n${result.signatureLink}`;
          await sendTextMessage(phone, caption);
        }

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: order.status,
            notes: "Termo de devolucao enviado para assinatura digital via WhatsApp",
          },
        });

        return { success: true, signatureLink: result.signatureLink };
      });
    }),

  // ── 9. CONFIRM PHYSICAL RETURN TERM ──
  confirmPhysicalReturnTerm: tenantProcedure
    .input(confirmPhysicalReturnTermSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });

        const reason = input.reason ?? order.cancellationReason ?? "Equipamento devolvido ao cliente";

        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: {
            returnTermSigned: true,
            returnTermPhysical: true,
            returnTermSignedAt: new Date(),
            status: "CANCELLED",
            cancellationReason: reason,
          },
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: order.status,
            notes: "Assinatura fisica do termo de devolucao confirmada",
          },
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: "CANCELLED",
            notes: `OS cancelada - ${reason}`,
          },
        });

        return { success: true };
      });
    }),

  // ── 10. CHECK RETURN TERM STATUS ──
  checkReturnTermStatus: tenantProcedure
    .input(checkReturnTermStatusSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });

        if (order.returnTermSigned) {
          return { signed: true, alreadySigned: true, cancelled: false };
        }

        if (!order.returnTermAutentiqueId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Termo de devolucao nao foi enviado para assinatura digital." });
        }

        const status = await getDocumentStatus(order.returnTermAutentiqueId);
        if (!status.success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: status.error ?? "Erro ao consultar Autentique" });
        }

        if (status.signed) {
          const reason = order.cancellationReason ?? "Equipamento devolvido ao cliente";

          await tx.serviceOrder.update({
            where: { id: input.orderId },
            data: {
              returnTermSigned: true,
              returnTermSignedAt: new Date(),
              status: "CANCELLED",
            },
          });

          await tx.serviceOrderHistory.create({
            data: {
              tenantId: ctx.tenantId,
              orderId: input.orderId,
              userId: ctx.session.user.id,
              previousStatus: order.status,
              newStatus: order.status,
              notes: "Termo de devolucao assinado digitalmente pelo cliente",
            },
          });

          await tx.serviceOrderHistory.create({
            data: {
              tenantId: ctx.tenantId,
              orderId: input.orderId,
              userId: ctx.session.user.id,
              previousStatus: order.status,
              newStatus: "CANCELLED",
              notes: `OS cancelada - ${reason}`,
            },
          });

          return { signed: true, alreadySigned: false, cancelled: true };
        }

        return { signed: false, alreadySigned: false, cancelled: false };
      });
    }),

  // ── 11. SEND QUOTE VIA WHATSAPP ──
  sendQuoteWhatsApp: tenantProcedure
    .input(sendQuoteWhatsAppSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order || order.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });

        if (!order.pendingQuoteId || !order.budgetPending) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nao existe orcamento pendente para enviar." });
        }

        const quote = await tx.serviceOrderQuote.findUnique({ where: { id: order.pendingQuoteId } });
        if (!quote || quote.status !== "pending") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Orcamento nao encontrado ou ja processado." });
        }

        const customer = await tx.customer.findUnique({
          where: { id: order.customerId },
          select: { name: true, phone: true },
        });
        if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente nao encontrado" });

        const phone = input.phone ?? customer.phone;
        if (!phone) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum telefone disponivel." });

        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
        const approvalLink = `${appUrl}/quote/${quote.approvalLink}`;
        const totalFormatted = (Number(quote.newTotal)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

        const text = `Orcamento - OS #${order.number}\nValor: ${totalFormatted}\n\nPara aprovar ou rejeitar:\n${approvalLink}`;

        // Also try to send the quote PDF
        const pdfUrl = `${appUrl}/api/service-orders/${input.orderId}/quote-pdf`;
        try {
          const pdfRes = await fetch(pdfUrl, { signal: AbortSignal.timeout(10_000) });
          if (pdfRes.ok) {
            await sendMediaMessage(phone, pdfUrl, text);
          } else {
            await sendTextMessage(phone, text);
          }
        } catch {
          // Fallback to text-only
          await sendTextMessage(phone, text);
        }

        await tx.serviceOrderQuote.update({
          where: { id: quote.id },
          data: { sentToCustomer: true, sentAt: new Date() },
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: order.status,
            notes: "Orcamento enviado para o cliente via WhatsApp",
          },
        });

        return { success: true };
      });
    }),

  // ── 12. CHECK QUOTE STATUS ──
  checkQuoteStatus: tenantProcedure
    .input(checkQuoteStatusSchema)
    .query(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });

        if (!order.pendingQuoteId) {
          return { pending: false, status: null, approved: false, rejected: false };
        }

        const quote = await tx.serviceOrderQuote.findUnique({ where: { id: order.pendingQuoteId } });
        if (!quote) {
          return { pending: false, status: null, approved: false, rejected: false };
        }

        return {
          pending: quote.status === "pending",
          status: quote.status,
          approved: quote.status === "approved",
          rejected: quote.status === "rejected",
          sentToCustomer: quote.sentToCustomer,
          customerNotes: quote.customerNotes,
        };
      });
    }),

  // ── 13. UPDATE TECHNICAL INFO ──
  updateTechnicalInfo: tenantProcedure
    .input(updateTechnicalInfoSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order || order.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });

        const finalStatuses = ["COMPLETED", "PAID", "READY_FOR_PICKUP", "DELIVERED", "CANCELLED", "REFUNDED"];
        if (finalStatuses.includes(order.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "As informacoes tecnicas nao podem ser alteradas apos a conclusao da OS.",
          });
        }

        const updateData: Record<string, unknown> = {};
        if (input.diagnosedProblem !== undefined) updateData.diagnosedProblem = input.diagnosedProblem;
        if (input.internalNotes !== undefined) updateData.internalNotes = input.internalNotes;

        await tx.serviceOrder.update({ where: { id: input.orderId }, data: updateData });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: order.status,
            notes: "Informacoes tecnicas atualizadas",
          },
        });

        return { success: true };
      });
    }),

  // ── 14. UPDATE TECHNICIAN ──
  updateTechnician: tenantProcedure
    .input(updateTechnicianSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order || order.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });

        // Get previous technician name
        let previousName = "Nenhum";
        if (order.technicianId) {
          const prev = await withAdmin(async (adminTx) =>
            adminTx.user.findUnique({ where: { id: order.technicianId! }, select: { name: true } }),
          );
          previousName = prev?.name ?? "Nenhum";
        }

        // Get new technician name
        const newTech = await withAdmin(async (adminTx) =>
          adminTx.user.findUnique({ where: { id: input.technicianId }, select: { name: true } }),
        );
        if (!newTech) throw new TRPCError({ code: "NOT_FOUND", message: "Tecnico nao encontrado" });

        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: { technicianId: input.technicianId },
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: order.status,
            notes: `Tecnico responsavel alterado de "${previousName}" para "${newTech.name}"`,
          },
        });

        return { success: true };
      });
    }),

  // ── 15. SEND RECEIPT via WhatsApp ──
  sendReceipt: tenantProcedure
    .input(sendReceiptSchema)
    .mutation(async ({ ctx, input }) => {
      // ETAPA 1 — fetch dentro de tx RLS.
      const { order, phone, customerName } = await ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({
          where: { id: input.orderId },
          include: { items: true },
        });
        if (!order || order.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });

        if (!["PAID", "READY_FOR_PICKUP", "DELIVERED"].includes(order.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Recibo so pode ser enviado apos pagamento.",
          });
        }

        const customer = await tx.customer.findUnique({
          where: { id: order.customerId },
          select: { name: true, phone: true },
        });
        const phone = input.phone ?? customer?.phone ?? null;
        if (!phone) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cliente nao possui telefone cadastrado." });
        }
        return { order, phone, customerName: customer?.name ?? "Cliente" };
      });

      // ETAPA 2 — envio Meta Cloud (fora de tx; HTTP pode demorar).
      // Paridade Laravel OrdemServicoController::enviarReciboWhatsApp.
      const pdfToken = createPublicPdfToken(ctx.tenantId, input.orderId, 60 * 60 * 1000);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
      const pdfUrl = `${appUrl}/api/whatsapp-media/os/pdf/${pdfToken}`;
      const caption = `📄 Recibo - OS #${order.number}\n\nOlá, ${customerName}! Segue em anexo o recibo da sua Ordem de Serviço.`;
      const wa = await sendPdfWithFallback({
        phone,
        pdfUrl,
        fileName: `OS_${order.number}_recibo.pdf`,
        caption,
        contexto: "os_recibo_pdf",
        params: [customerName, order.number],
      });
      const sent = wa.success;
      if (!sent) {
        logger.warn("Falha ao enviar recibo via WhatsApp", { orderId: input.orderId, error: wa.error });
      }

      // ETAPA 3 — persiste se sucesso (tx curta).
      if (sent) {
        await ctx.withTenant(async (tx) => {
          await tx.serviceOrder.update({
            where: { id: input.orderId },
            data: { receiptSent: true, receiptSentAt: new Date() },
          });
          await tx.serviceOrderHistory.create({
            data: {
              tenantId: ctx.tenantId,
              orderId: input.orderId,
              userId: ctx.session.user.id,
              previousStatus: order.status,
              newStatus: order.status,
              notes: "Recibo enviado via WhatsApp",
            },
          });
        });
      }

      return { success: true, sent };
    }),

  // ═══════════════════════════════════════
  // DEPIX / PIX INTEGRATION
  // ═══════════════════════════════════════

  /** Generate PIX QR code for OS payment (faithful to Laravel gerarPixDepix) */
  generatePix: tenantProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order || order.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });

        if (!["COMPLETED"].includes(order.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "PIX so pode ser gerado para OS concluida" });
        }

        const totalAmount = Number(order.totalAmount);
        if (totalAmount <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Valor da OS deve ser maior que zero" });
        }

        const result = await createPixPayment(
          totalAmount,
          `OS ${order.number}`,
          order.id
        );

        if (!result.success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Erro ao gerar PIX" });
        }

        // Update OS with DEPIX transaction info
        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: {
            depixTransactionId: result.transactionId ?? null,
            depixStatus: "pending",
          },
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: order.status,
            notes: "PIX gerado para pagamento",
          },
        });

        return {
          transactionId: result.transactionId,
          qrCode: result.qrCode,
          qrCodeBase64: result.qrCodeBase64,
          pixKey: result.pixKey,
        };
      });
    }),

  /** Cancel pending PIX for OS */
  cancelPix: tenantProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });

        if (!order.depixTransactionId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum PIX pendente para esta OS" });
        }

        const result = await cancelPixPayment(order.depixTransactionId);

        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: { depixStatus: "cancelled" },
        });

        return { success: result.success };
      });
    }),
});

// ── Helper: Recalculate order totals from items ──

 
async function recalculateOrderTotals(tx: any, orderId: string, _tenantId: string) {
  const items = await tx.serviceOrderItem.findMany({
    where: { orderId },
  });

  let serviceAmount = 0;
  let partsAmount = 0;

  for (const item of items) {
    const total = Number(item.total);
    if (item.type === "SERVICE") serviceAmount += total;
    else partsAmount += total;
  }

  const order = await tx.serviceOrder.findUnique({
    where: { id: orderId },
    select: { discount: true },
  });

  const discount = Number(order?.discount ?? 0);
  const totalAmount = serviceAmount + partsAmount - discount;

  await tx.serviceOrder.update({
    where: { id: orderId },
    data: {
      serviceAmount: new Prisma.Decimal(serviceAmount),
      partsAmount: new Prisma.Decimal(partsAmount),
      totalAmount: new Prisma.Decimal(Math.max(0, totalAmount)),
    },
  });
}
