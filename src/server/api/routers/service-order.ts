import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure, publicProcedure } from "@/server/api/trpc";
import { isTenantAdmin } from "@/lib/auth/roles";
import { rateLimitMiddleware } from "@/server/api/middleware/rate-limit";
import { withAdmin } from "@/server/db";
import { createDocumentWithLink, getDocumentStatus, formatWhatsApp, extractShortlinkToken } from "@/lib/services/autentique-service";
import { buildServiceOrderPdf } from "@/lib/pdf/service-order-pdf-builder";
import { buildServiceOrderQuotePdf } from "@/lib/pdf/service-order-quote-builder";
import { buildServiceOrderTermoEntregaPdf, buildServiceOrderTermoDevolucaoPdf } from "@/lib/pdf/service-order-terms-builder";
import { sendPdfWithFallback, sendTextWithFallback } from "@/lib/whatsapp/send-with-fallback";
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
  requestBudgetApprovalSchema,
  respondQuoteSchema,
  attachNfseSchema,
  detachNfseSchema,
  saveSignaturePadSchema,
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
  checkQuoteStatusSchema,
  updateTechnicalInfoSchema,
  updateTechnicianSchema,
  getByCustomerSchema,
  sendReceiptSchema,
  ALLOWED_TRANSITIONS,
  STATUS_GROUPS,
  isCancellableOsStatus,
  isRefundableOsStatus,
  isLabEligibleStatus,
  type ServiceOrderStatus,
} from "@/lib/validators/service-order";
import { technicianReportSchema } from "@/lib/validators/subscription";
import { sendCloudText } from "@/lib/services/whatsapp-cloud-service";
import { statusAfterQuote, lastRealOriginWhere } from "@/lib/services/quote-status";
import { endOfDayBrt, startOfDayBrt } from "@/lib/utils/date-range";
import { generatePublicToken } from "@/lib/utils/public-link";
import { getAppBaseUrl } from "@/lib/utils/app-url";
import {
  reserveStockForOsItem,
  releaseStockForOsItem,
  releaseAllOsItems,
} from "@/server/services/os-stock.service";
import { createOsTechnicianCommission } from "@/server/services/os-commission.service";
import { buildTechnicianReport } from "@/server/services/os-technician-report.service";
import { deleteNfseAttachment } from "@/server/services/os-nfse-storage.service";
// ── Helpers ──

function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Number(v) * 100);
}

function centsToPrisma(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(cents / 100);
}

function generatePublicLink(): string {
  return generatePublicToken(12);
}

function generateQuoteLink(): string {
  return generatePublicToken(16);
}

/**
 * Privilegio para forcar operacoes que normalmente exigem assinatura do
 * cliente (cancelar sem termo, entregar sem termo, etc.). Paridade Laravel
 * `role === 'admin'`, mas aqui ampliamos para adm/gerente conforme pedido:
 * superadmin OU role do tenant em [owner, admin, manager].
 */
function canForceSignatureOps(ctx: {
  session: { user: { isSuperAdmin?: boolean }; availableTenants: Array<{ id: string; role: string }> };
  tenantId: string;
}): boolean {
  return isTenantAdmin(ctx.session, ctx.tenantId);
}

/**
 * Restaura o status anterior da OS ao aprovar/rejeitar orcamento.
 * Le o ultimo serviceOrderHistory com newStatus=WAITING_APPROVAL —
 * ele guarda em previousStatus o status que a OS estava antes do quote.
 * Fallback: APPROVED em aprovacao, IN_DIAGNOSIS em rejeicao.
 *
 * IMPORTANTE: ignora registros cujo previousStatus tambem e WAITING_APPROVAL.
 * Quando uma revisao de orcamento comeca enquanto a OS JA esta WAITING_APPROVAL
 * (revisoes encadeadas — cliente/equipe alterando o orcamento varias vezes), o
 * history grava WAITING_APPROVAL -> WAITING_APPROVAL. Usar esse registro fazia a
 * "restauracao" devolver WAITING_APPROVAL, prendendo a OS num loop (bug real:
 * OS202600260). O status de origem correto e o ultimo que NAO era WAITING_APPROVAL.
 */
async function resolveStatusAfterQuote(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  orderId: string,
  action: "approve" | "reject",
): Promise<string> {
  const lastRealOrigin = await tx.serviceOrderHistory.findFirst({
    where: lastRealOriginWhere(orderId),
    orderBy: { createdAt: "desc" },
    select: { previousStatus: true },
  });
  return statusAfterQuote(lastRealOrigin?.previousStatus ?? null, action);
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

        // Tecnico (nao admin/gerente) ve apenas as proprias OS. Paridade
        // Técnico (flag) não-admin vê só as próprias OS (paridade Laravel
        // OrdemServicoController::index com eh_tecnico).
        const activeTenant = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId);
        const isPrivileged = isTenantAdmin(ctx.session, ctx.tenantId);
        if (activeTenant?.isTechnician && !isPrivileged) {
          where.technicianId = ctx.session.user.id;
        }

        if (input.status) {
          where.status = input.status;
        } else if (input.statusGroup) {
          // M7: paridade Laravel — filtro agrupado expande para varios statuses.
          where.status = { in: STATUS_GROUPS[input.statusGroup] };
        }
        if (input.technicianId) {
          where.technicianId = input.technicianId;
        }
        if (input.dateFrom) {
          where.entryDate = { ...(where.entryDate ?? {}), gte: startOfDayBrt(input.dateFrom) };
        }
        if (input.dateTo) {
          where.entryDate = { ...(where.entryDate ?? {}), lte: endOfDayBrt(input.dateTo) };
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

        // H3: select EXPLICITO (so os campos que a tabela renderiza). Antes
        // o include retornava o order inteiro via serializeOrder spread,
        // incluindo blobs de assinatura (data URLs de ~700KB), internalNotes,
        // depixTransactionId, publicLink — em pageSize 100 isso podia gerar
        // 70MB+ de payload por listagem.
        const [orders, total] = await Promise.all([
          tx.serviceOrder.findMany({
            where,
            select: {
              id: true,
              number: true,
              status: true,
              customerId: true,
              technicianId: true,
              deviceType: true,
              deviceModel: true,
              imei: true,
              totalAmount: true,
              entryDate: true,
              isWarranty: true,
              budgetPending: true,
            },
            orderBy,
            skip,
            take: pageSize,
          }),
          tx.serviceOrder.count({ where }),
        ]);

        const customerIds = [...new Set(orders.map((o) => o.customerId))];
        const customers = await tx.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, name: true, cpf: true, phone: true, phoneSecondary: true },
        });
        const customerMap = new Map(customers.map((c) => [c.id, c]));

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
            id: order.id,
            number: order.number,
            status: order.status,
            deviceType: order.deviceType,
            deviceModel: order.deviceModel,
            imei: order.imei,
            totalAmount: decimalToCents(order.totalAmount),
            entryDate: order.entryDate,
            isWarranty: order.isWarranty,
            budgetPending: order.budgetPending,
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
      // Tecnico (nao privilegiado) ve apenas os contadores das proprias OS
      // — espelha o escopo de `list`. Paridade Laravel index.
      const activeTenant = ctx.session.availableTenants.find((t) => t.id === ctx.tenantId);
      const isPrivileged = isTenantAdmin(ctx.session, ctx.tenantId);
      const statsWhere: { deletedAt: null; technicianId?: string } = { deletedAt: null };
      if (activeTenant?.isTechnician && !isPrivileged) {
        statsWhere.technicianId = ctx.session.user.id;
      }
      const counts = await tx.serviceOrder.groupBy({
        by: ["status"],
        where: statsWhere,
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

        // Termos/garantia configurados (exibidos dentro da OS, paridade Laravel).
        const assistance = await tx.tenantAssistanceSettings.findUnique({
          where: { tenantId: ctx.tenantId },
          select: { termsOfService: true, warrantyPolicy: true },
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
          viewerIsAdmin: isTenantAdmin(ctx.session, ctx.tenantId),
          // Pode autorizar orcamento manualmente (mesma RBAC): admin do tenant.
          viewerCanAuthorize: isTenantAdmin(ctx.session, ctx.tenantId),
          termsOfService: assistance?.termsOfService ?? null,
          warrantyPolicy: assistance?.warrantyPolicy ?? null,
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
      const txResult = await ctx.withTenant(async (tx) => {
        // Numero atomico via sequencia tenant-scoped (race-safe).
        const year = new Date().getFullYear();
        const { nextTenantNumber } = await import("@/server/services/tenant-number-sequence.service");
        const { formatted: number } = await nextTenantNumber(
          tx as unknown as Parameters<typeof nextTenantNumber>[0],
          ctx.tenantId,
          "service_order",
          year,
          { padding: 5, prefix: `OS${year}` },
        );

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
              variationId: item.variationId ?? null,
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
                variationId: item.variationId ?? null,
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

        // Carrega dados pra notificacao WhatsApp do tecnico (fora da tx).
        let technicianPhone: string | null = null;
        let technicianName: string | null = null;
        if (input.technicianId) {
          const tech = await tx.user.findUnique({
            where: { id: input.technicianId },
            select: { name: true, phone: true },
          });
          technicianPhone = tech?.phone ?? null;
          technicianName = tech?.name ?? null;
        }
        const customer = await tx.customer.findUnique({
          where: { id: input.customerId },
          select: { name: true },
        });

        return {
          id: order.id,
          number: order.number,
          technicianPhone,
          technicianName,
          customerName: customer?.name ?? null,
        };
      });

      // Notificacao WhatsApp do tecnico (paridade Laravel
      // enviarNotificacaoTecnicoWhatsApp). Best-effort — falha nao bloqueia
      // a criacao da OS.
      if (txResult.technicianPhone) {
        const text =
          `🔧 *Nova OS atribuida a voce*\n\n` +
          `OS: *${txResult.number}*\n` +
          `Cliente: ${txResult.customerName ?? "—"}\n` +
          (input.deviceBrand || input.deviceModel
            ? `Aparelho: ${[input.deviceBrand, input.deviceModel].filter(Boolean).join(" ")}\n`
            : "") +
          (input.reportedProblem ? `Defeito relatado: ${input.reportedProblem}\n` : "") +
          `\nAcesse o sistema pra mais detalhes.`;
        // Cloud API com fallback de template `tecnico_nova_os` — tecnicos
        // ficam fora da janela 24h (folga, fora do horario) e free-text puro
        // nao entrega. Paridade Laravel `enviarComFallbackTemplateAsync`.
        sendTextWithFallback({
          phone: txResult.technicianPhone,
          freeText: text,
          contexto: "tecnico_nova_os",
          params: [txResult.technicianName ?? "tecnico", txResult.number],
          log: { tenantId: ctx.tenantId, originType: "service_order", originId: txResult.id },
        }).catch((err) => {
          logger.warn("Falha ao notificar tecnico via WhatsApp", {
            orderId: txResult.id,
            technicianName: txResult.technicianName,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }

      return { id: txResult.id, number: txResult.number };
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

        // H4: trocar cliente de uma OS assinada exige privilegio (gerente/admin).
        // Antes qualquer tenant member podia trocar customerId via tRPC direto.
        if (data.customerId && data.customerId !== order.customerId) {
          if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Sem permissao para trocar o cliente da OS.",
            });
          }
        }

        // Paridade Laravel `update`:
        // - osAssinada → bloqueia equipamento/IMEI/problema relatado/entryChecklist/deviceInfo
        //   + customerId (aparelho do cliente ja sob responsabilidade da loja).
        // - osConcluida → bloqueia ADICIONALMENTE diagnosedProblem/internalNotes/warrantyMonths
        const isSigned = isEntrySigned(order);
        const isCompleted = ["COMPLETED", "PAID", "READY_FOR_PICKUP", "DELIVERED", "REFUNDED"].includes(order.status);
        const lockedFields = new Set<string>();
        if (isSigned) {
          lockedFields.add("customerId");
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
        // H5: toggle nfseIssued=false tambem zera nfseAttachmentPath/nfseNumber
        // e agenda delete do arquivo no MinIO — antes orfanava o anexo.
        let nfseKeyToDelete: string | null = null;
        if (updateData.nfseIssued === false && order.nfseIssued) {
          updateData.nfseIssuedAt = null;
          updateData.nfseAttachmentPath = null;
          updateData.nfseNumber = null;
          nfseKeyToDelete = order.nfseAttachmentPath ?? null;
        }

        await tx.serviceOrder.update({ where: { id }, data: updateData });
        if (nfseKeyToDelete) {
          // Best-effort, fora da tx logica (mas dentro da withTenant cb — o
          // delete e idempotente em caso de retry).
          await deleteNfseAttachment(id, nfseKeyToDelete);
        }

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

        // Exigir assinatura de entrada (Autentique, fisica OU signature-pad) antes
        // de avancar o status para alem de OPEN. Cancelamento e estados especiais
        // sao excecao. Paridade com regra do Laravel: aparelho na loja exige
        // assinatura antes de iniciar o fluxo de servico.
        const isSigned = isEntrySigned(order);
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
        const canForce = canForceSignatureOps(ctx);

        // C2: Bloquear PAID via updateStatus direto. Pagamento deve passar por
        // `registerPayment` (que registra caixa + financeiro). Excecoes:
        // OS de garantia / sem valor; admin/gerente com flag `force`.
        if (newStatus === "PAID" && !canSkipPdv && !input.force) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Pagamento de OS deve ser registrado via PDV. Use 'Receber Pagamento' para prosseguir.",
          });
        }
        if (newStatus === "PAID" && input.force && !canForce) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Apenas administradores ou gerentes podem forcar status=PAID fora do PDV.",
          });
        }

        // C2 (auditoria): Bloquear CANCELLED via updateStatus. O cancelamento
        // exige termo de devolucao, RBAC, liberar estoque, cancelar recebiveis
        // e PIX — tudo na procedure `cancel`. Aceitar CANCELLED direto aqui
        // pularia todos esses gates e zeraria o trabalho do `cancel`.
        if (newStatus === "CANCELLED") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Use a acao 'Cancelar OS' para cancelar — o cancelamento exige termo de devolucao e libera estoque/recebiveis.",
          });
        }

        // C4: Bloquear DELIVERED sem termo de entrega assinado (adm/gerente pode bypassar)
        if (newStatus === "DELIVERED" && !canSkipPdv) {
          const termSigned = order.deliveryTermSigned || order.deliveryTermPhysical;
          if (!termSigned && !(input.force && canForce)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "O termo de entrega deve ser assinado antes de avancar para entregue. Envie o termo ou registre assinatura fisica.",
            });
          }
        }

        // C5: Se ha termo de devolucao em curso (enviado mas nao assinado) e o
        // usuario decide retomar a OS, limpar os campos do termo. (CANCELLED ja
        // foi bloqueado acima em C2, entao nao precisa checar aqui.)
        const interruptingReturnTerm = order.returnTermSent && !order.returnTermSigned;


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

        let rewardDiscountCents = 0;
        let rewardNote = "";
        if (newStatus === "PAID") {
          updateData.paymentDate = new Date();
          if (input.paymentMethod) updateData.paymentMethod = input.paymentMethod;

          // L1: aplicar RewardAction como desconto, se fornecida (mesmo helper
          // usado por registerPayment — paridade Laravel).
          if (input.rewardActionId) {
            const r = await applyRewardActionToOrder(tx, input.rewardActionId, order);
            rewardDiscountCents = r.discountCents;
            rewardNote = r.note;
          }

          const manualDiscountCents = input.paymentDiscount ?? 0;
          const totalDiscountCents = manualDiscountCents + rewardDiscountCents;
          if (totalDiscountCents > 0) {
            updateData.paymentDiscount = centsToPrisma(totalDiscountCents);
          }
          const paidCents = Math.max(0, decimalToCents(order.totalAmount) - totalDiscountCents);
          updateData.paidAmount = centsToPrisma(paidCents);
          if (input.paymentNotes || rewardNote) {
            updateData.paymentNotes = (input.paymentNotes ?? "") + rewardNote || null;
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
              // Paridade Laravel FinanceiroService: dinheiro/pix/depix sao
              // pagamentos instantaneos (recebivel ja nasce PAID).
              const instantPay = ["dinheiro", "pix", "depix"].includes(paymentMethodUsed);
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
                  // serviceOrderId e o link da discriminated union (queries
                  // de cancelamento, refund, dashboard). referenceId permanece
                  // pra compat com queries antigas que usam referenceType.
                  serviceOrderId: order.id,
                  referenceType: "service_order",
                  referenceId: order.id,
                  createdByUserId: ctx.session.user.id,
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

        // C8: Notificar conclusao via WhatsApp Cloud (best-effort, nao bloqueia).
        // Paridade com Laravel `enviarNotificacaoConclusaoWhatsApp` — usa o
        // template `os_concluida` quando fora da janela 24h.
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
              await sendTextWithFallback({
                phone,
                freeText: text,
                contexto: "os_conclusao",
                params: [name, order.number],
                log: { tenantId: ctx.tenantId, originType: "service_order", originId: order.id },
              });
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
      const txResult = await ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.id } });
        if (!order || order.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        }

        if (!isCancellableOsStatus(order.status)) {
          // OS paga → desfazer é estorno (reverte o dinheiro). Cancelar deixaria
          // o pagamento registrado. Concluída/finalizada não é cancelável.
          const message = isRefundableOsStatus(order.status)
            ? "Esta OS já foi paga. Use 'Estornar' para reverter o pagamento."
            : "Nao e possivel cancelar uma OS concluida ou finalizada.";
          throw new TRPCError({ code: "BAD_REQUEST", message });
        }

        // Paridade Laravel (`OrdemServicoController::cancelar`): TODA OS tem
        // aparelho fisico do cliente — exige termo de devolucao assinado
        // (Autentique OU fisico) antes do cancelamento. Admin/gerente pode
        // forcar via input.force - registrado como '[FORCADO]' no historico.
        const termSigned = order.returnTermSigned || order.returnTermPhysical;
        const canForce = canForceSignatureOps(ctx);

        let forced = false;
        if (!termSigned) {
          if (!input.force) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "O termo de devolucao deve ser assinado antes do cancelamento. Envie o termo para assinatura ou confirme a devolucao fisica.",
            });
          }
          if (!canForce) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Apenas administradores ou gerentes podem forcar cancelamento sem termo de devolucao.",
            });
          }
          forced = true;
        }

        // Release all reserved product stock
        const releasedCount = await releaseAllOsItems(tx, ctx.tenantId, ctx.session.user.id, input.id);

        // Cancela receivables pendentes vinculados a OS (FT + installments).
        // Sem isso, mesmo apos cancelar a OS, parcelas pendentes ficavam
        // vencendo eternamente — quebrava dashboard de contas a receber.
        const pendingTransactions = await tx.financialTransaction.findMany({
          where: {
            serviceOrderId: input.id,
            status: { notIn: ["CANCELLED", "PAID"] },
          },
          select: { id: true },
        });
        for (const t of pendingTransactions) {
          await tx.installment.updateMany({
            where: { transactionId: t.id, status: { in: ["PENDING", "OVERDUE"] } },
            data: { status: "CANCELLED" },
          });
          await tx.financialTransaction.update({
            where: { id: t.id },
            data: {
              status: "CANCELLED",
              cancelledAt: new Date(),
              cancelledByUserId: ctx.session.user.id,
              cancelReason: `OS cancelada: ${input.reason}`,
            },
          });
        }

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
        if (pendingTransactions.length > 0) {
          noteParts.push(`(${pendingTransactions.length} recebivel(is) cancelado(s))`);
        }

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

      return txResult;
    }),

  // ── UNCANCEL (admin only) ──
  uncancel: tenantProcedure
    .input(uncancelOrderSchema)
    .mutation(async ({ ctx, input }) => {
      // RBAC: paridade Laravel `descancelar` exige role admin.
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao para descancelar OS" });
      }
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.id } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });

        if (order.status !== "CANCELLED") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Apenas OS canceladas podem ser descanceladas." });
        }

        // P3: re-reserva o estoque liberado no cancel (simetria). Se uma peca
        // foi consumida por outra OS no meio-tempo, reserveStockForOsItem lanca
        // e o descancelamento falha — nao reativa uma OS sem estoque disponivel.
        const productItems = await tx.serviceOrderItem.findMany({
          where: { orderId: input.id, type: "PRODUCT" },
        });
        let reReserved = 0;
        for (const item of productItems) {
          if (!item.productId) continue;
          const qty = Number(item.quantity);
          if (qty <= 0) continue;
          await reserveStockForOsItem(tx, ctx.tenantId, ctx.session.user.id, {
            productId: item.productId,
            quantity: qty,
            orderId: input.id,
            itemDescription: item.description,
          });
          reReserved++;
        }

        // P5a: restaura os recebiveis que o cancel cancelou (simetria). So os
        // que foram cancelados PELO cancelamento desta OS (cancelReason com o
        // prefixo "OS cancelada:") voltam para PENDING.
        const cancelledTx = await tx.financialTransaction.findMany({
          where: {
            serviceOrderId: input.id,
            status: "CANCELLED",
            cancelReason: { startsWith: "OS cancelada:" },
          },
          select: { id: true },
        });
        for (const t of cancelledTx) {
          await tx.installment.updateMany({
            where: { transactionId: t.id, status: "CANCELLED" },
            data: { status: "PENDING" },
          });
          await tx.financialTransaction.update({
            where: { id: t.id },
            data: {
              status: "PENDING",
              cancelledAt: null,
              cancelledByUserId: null,
              cancelReason: null,
            },
          });
        }

        // Restaura o status anterior ao CANCELLED a partir do history.
        // Antes caia hardcoded em IN_DIAGNOSIS, fazendo OS que estava
        // em WAITING_PARTS/IN_PROGRESS/COMPLETED voltar para diagnostico —
        // operador tinha que avancar manualmente. Buscamos o ultimo history
        // newStatus=CANCELLED e usamos seu previousStatus. Fallback IN_DIAGNOSIS
        // se nao houver previousStatus ou se for terminal (PAID/DELIVERED/
        // CANCELLED/REFUNDED nao fazem sentido como destino de descancelamento).
        const lastCancelHistory = await tx.serviceOrderHistory.findFirst({
          where: { orderId: input.id, newStatus: "CANCELLED" },
          orderBy: { createdAt: "desc" },
          select: { previousStatus: true },
        });
        const terminalStatuses = new Set(["PAID", "DELIVERED", "CANCELLED", "REFUNDED"]);
        const restoreCandidate = lastCancelHistory?.previousStatus;
        const restoredStatus =
          restoreCandidate && !terminalStatuses.has(restoreCandidate)
            ? (restoreCandidate as ServiceOrderStatus)
            : "IN_DIAGNOSIS";

        await tx.serviceOrder.update({
          where: { id: input.id },
          data: {
            status: restoredStatus,
            cancellationReason: null,
          },
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.id,
            userId: ctx.session.user.id,
            previousStatus: "CANCELLED",
            newStatus: restoredStatus,
            notes:
              `[DESCANCELAMENTO] ${input.reason}` +
              (reReserved > 0 ? ` (${reReserved} item(ns) de estoque re-reservado(s))` : "") +
              (cancelledTx.length > 0 ? ` (${cancelledTx.length} recebivel(is) restaurado(s))` : ""),
          },
        });

        return { success: true, restoredStatus };
      });
    }),

  // ── REFUND (admin only) ──
  refund: tenantProcedure
    .input(refundOrderSchema)
    .mutation(async ({ ctx, input }) => {
      // RBAC: paridade Laravel `estornar` exige role admin.
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao para estornar OS" });
      }
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.id } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });

        if (!isRefundableOsStatus(order.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Apenas OS pagas (paga, aguardando retirada ou entregue) podem ser estornadas.",
          });
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

        // P5: cancela comissao ainda nao paga do tecnico — nao se paga comissao
        // por uma OS estornada. Comissoes ja PAGAS nao sao mexidas (clawback
        // exige fluxo financeiro proprio).
        const cancelledCommissions = await tx.commission.updateMany({
          where: {
            referenceType: "SERVICE_ORDER",
            referenceId: input.id,
            status: { in: ["PENDING", "APPROVED"] },
          },
          data: { status: "CANCELLED" },
        });

        // P5b: se a OS foi paga via PDV, estorna a Sale vinculada (sem itens —
        // pagamento puro): saida de caixa + cancela recebiveis + status REFUNDED.
        // CAS no status evita estorno duplo se a venda for estornada em paralelo.
        let saleRefunded = false;
        const linkedSale = await tx.sale.findFirst({
          where: {
            serviceOrderId: input.id,
            isOSPayment: true,
            status: "COMPLETED",
            deletedAt: null,
          },
          select: { id: true, number: true, totalAmount: true },
        });
        if (linkedSale) {
          const cas = await tx.sale.updateMany({
            where: { id: linkedSale.id, status: "COMPLETED" },
            data: { status: "REFUNDED" },
          });
          if (cas.count === 1) {
            saleRefunded = true;
            const refundedCents = decimalToCents(linkedSale.totalAmount);
            const openSession = await tx.cashSession.findFirst({
              where: { userId: ctx.session.user.id, closedAt: null },
            });
            if (openSession && refundedCents > 0) {
              await tx.cashMovement.create({
                data: {
                  tenantId: ctx.tenantId,
                  cashSessionId: openSession.id,
                  type: "WITHDRAWAL",
                  amount: centsToPrisma(refundedCents),
                  nature: "OUTCOME",
                  paymentMethod: null,
                  description: `Estorno venda ${linkedSale.number} (OS ${order.number})`,
                  referenceId: linkedSale.id,
                  referenceType: "SALE_REFUND",
                  createdByUserId: ctx.session.user.id,
                },
              });
            }
            const saleTx = await tx.financialTransaction.findMany({
              where: { saleId: linkedSale.id, status: { not: "CANCELLED" } },
              select: { id: true },
            });
            if (saleTx.length > 0) {
              const ids = saleTx.map((t) => t.id);
              await tx.installment.updateMany({
                where: { transactionId: { in: ids }, status: { in: ["PENDING", "OVERDUE"] } },
                data: { status: "CANCELLED" },
              });
              await tx.financialTransaction.updateMany({
                where: { id: { in: ids } },
                data: {
                  status: "CANCELLED",
                  cancelledAt: new Date(),
                  cancelledByUserId: ctx.session.user.id,
                  cancelReason: `Estorno OS ${order.number}: ${input.reason}`,
                },
              });
            }
          }
        }

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.id,
            userId: ctx.session.user.id,
            previousStatus: "DELIVERED",
            newStatus: "REFUNDED",
            notes:
              `[ESTORNO] ${input.reason}` +
              (cancelledCommissions.count > 0
                ? ` (${cancelledCommissions.count} comissao(oes) cancelada(s))`
                : "") +
              (saleRefunded ? ` (venda ${linkedSale!.number} estornada)` : ""),
          },
        });

        return { success: true };
      });
    }),

  // ── DELETE (admin only, permanent) ──
  delete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // RBAC: paridade Laravel `destroy` exige role admin.
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao para excluir OS" });
      }
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

        // P2: libera o estoque reservado pelos itens-produto (consistente com
        // `cancel`) — uma OS excluida nao deve manter peças fora do estoque.
        await releaseAllOsItems(tx, ctx.tenantId, ctx.session.user.id, input.id);

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

        // Regime B (OS ja assinada): abre/garante revisao de orcamento ANTES de
        // mutar, capturando o estado autorizado anterior para revert na rejeicao.
        await ensureBudgetRevision(tx, order, ctx.session.user.id, ctx.tenantId);

        const itemTotal = input.unitPrice * input.quantity;

        // Reserve stock for product items
        if (input.type === "PRODUCT" && input.productId) {
          await reserveStockForOsItem(tx, ctx.tenantId, ctx.session.user.id, {
            productId: input.productId,
            variationId: input.variationId ?? null,
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
            variationId: input.variationId ?? null,
            description: input.description,
            quantity: new Prisma.Decimal(input.quantity),
            unitPrice: centsToPrisma(input.unitPrice),
            costPrice: centsToPrisma(input.costPrice ?? 0),
            total: centsToPrisma(itemTotal),
          },
        });

        // Recalculate totals
        await recalculateOrderTotals(tx, input.orderId, ctx.tenantId);
        // Atualiza os valores `new*` da revisao pendente (se houver).
        await syncBudgetRevision(tx, input.orderId);

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
        const order = await tx.serviceOrder.findUnique({ where: { id: item.orderId } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });
        if (["PAID", "DELIVERED", "CANCELLED", "REFUNDED"].includes(order.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "OS nao pode ter itens alterados no status atual.",
          });
        }

        // Regime B: garante revisao de orcamento antes de mutar.
        await ensureBudgetRevision(tx, order, ctx.session.user.id, ctx.tenantId);

        const quantity = input.quantity ?? Number(item.quantity);
        const unitPrice = input.unitPrice !== undefined ? input.unitPrice : decimalToCents(item.unitPrice);
        const total = unitPrice * quantity;

        // Reconcilia estoque quando a quantidade de um item-produto muda.
        if (item.type === "PRODUCT" && item.productId && input.quantity !== undefined) {
          const delta = input.quantity - Number(item.quantity);
          if (delta > 0) {
            await reserveStockForOsItem(tx, ctx.tenantId, ctx.session.user.id, {
              productId: item.productId,
              variationId: item.variationId ?? null,
              quantity: delta,
              orderId: item.orderId,
              itemDescription: item.description,
            });
          } else if (delta < 0) {
            await releaseStockForOsItem(tx, ctx.tenantId, ctx.session.user.id, {
              productId: item.productId,
              variationId: item.variationId ?? null,
              quantity: -delta,
              orderId: item.orderId,
              reason: `Ajuste de quantidade na OS: ${item.description}`,
            });
          }
        }

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
        await syncBudgetRevision(tx, item.orderId);
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
        const order = await tx.serviceOrder.findUnique({ where: { id: item.orderId } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });
        if (["PAID", "DELIVERED", "CANCELLED", "REFUNDED"].includes(order.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "OS nao pode ter itens removidos no status atual.",
          });
        }

        // Regime B: garante revisao de orcamento (snapshot inclui o item removido).
        await ensureBudgetRevision(tx, order, ctx.session.user.id, ctx.tenantId);

        // Release stock for product items
        if (item.type === "PRODUCT" && item.productId) {
          await releaseStockForOsItem(tx, ctx.tenantId, ctx.session.user.id, {
            productId: item.productId,
            variationId: item.variationId ?? null,
            quantity: Number(item.quantity),
            orderId: item.orderId,
            reason: `Item removido da OS: ${item.description}`,
          });
        }

        await tx.serviceOrderItem.delete({ where: { id: input.id } });
        await recalculateOrderTotals(tx, item.orderId, item.tenantId);
        await syncBudgetRevision(tx, item.orderId);

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

        // Gate: orcamento com alteracao pendente nao pode ser pago ate o cliente
        // (ou gerente/adm) autorizar — evita cobrar valor nao acordado.
        if (order.budgetPending) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Orcamento aguardando autorizacao — nao e possivel registrar pagamento.",
          });
        }

        const userId = ctx.session.user.id;
        const isAdmin = isTenantAdmin(ctx.session, ctx.tenantId);
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

        // C7: Aplicar desconto de recompensa, se fornecido (helper compartilhado
        // com updateStatus PAID-path).
        let rewardDiscountCents = 0;
        let rewardNote = "";
        if (input.rewardActionId) {
          const r = await applyRewardActionToOrder(tx, input.rewardActionId, order);
          rewardDiscountCents = r.discountCents;
          rewardNote = r.note;
        }

        const discount = (input.paymentDiscount ?? 0) + rewardDiscountCents;
        // P6: o desconto de recompensa reduz o valor efetivamente recebido — o
        // recebivel/caixa/paidAmount refletem o liquido (nao o bruto). Para o
        // caso comum (sem recompensa) `collected` == input.paidAmount.
        const collectedCents = Math.max(0, input.paidAmount - rewardDiscountCents);

        // F (CAS): compare-and-set no status para evitar que dois callers
        // paralelos passem o check de COMPLETED e criem cash/comissao em dobro.
        // Receivable ja era guardado por existingReceivable; caixa e comissao
        // nao. updateMany so faz a transicao se o status atual ainda for
        // COMPLETED; se outro processo ja marcou como PAID, count=0 → throw
        // CONFLICT e a tx faz rollback (sem efeitos colaterais).
        const cas = await tx.serviceOrder.updateMany({
          where: { id: input.id, status: "COMPLETED" },
          data: {
            status: "PAID",
            paymentMethod: input.paymentMethod,
            paidAmount: centsToPrisma(collectedCents),
            paymentDiscount: centsToPrisma(discount),
            paymentNotes: (input.paymentNotes ?? "") + rewardNote || null,
            paymentDate: new Date(),
          },
        });
        if (cas.count !== 1) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "OS ja foi paga por outra operacao em andamento.",
          });
        }

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
        // So quando ha valor recebido (cortesia/garantia gratuita = R$0 nao gera
        // movimento de caixa).
        if (openSession && collectedCents > 0) {
          await tx.cashMovement.create({
            data: {
              tenantId: ctx.tenantId,
              cashSessionId: openSession.id,
              type: "SALE",
              amount: centsToPrisma(collectedCents),
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
        const paidAmountDecimal = centsToPrisma(collectedCents);
        // Paridade Laravel: dinheiro/pix/depix = instantaneo (recebivel PAID).
        const instantPayment = ["dinheiro", "pix", "depix"].includes(input.paymentMethod);

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

        if (!existingReceivable && collectedCents > 0) {
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
              serviceOrderId: order.id,
              referenceType: "service_order",
              referenceId: order.id,
              createdByUserId: userId,
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

        // ── Trigger automatico de comissao do tecnico ao finalizar OS ──
        // Mesma logica usada pelo finalize do PDV (service compartilhado). Base =
        // valor liquido recebido (cortesia/garantia gratuita = 0 → sem comissao).
        await createOsTechnicianCommission(tx, ctx.tenantId, order, collectedCents);

        return { success: true };
      });
    }),

  // ── UPDATE COSTS (inline) ──
  // Custos internos (partsCost/otherCost) sao independentes do total cobrado do
  // cliente — nao disparam revisao de orcamento.
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

  // NOTA: desconto não é mais dado na OS — a OS leva o valor BRUTO e o desconto
  // é aplicado no PDV (decisão do dono). A antiga `updateDiscount` foi removida.

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
          // M5: NAO sobrescrever signatureSignedAt se a assinatura digital
          // (Autentique) ja foi registrada antes — preserva trilha de auditoria
          // do que aconteceu primeiro. Para confirmacao fisica usamos um campo
          // proprio (entrySignatureAt) que isEntrySigned tambem reconhece.
          if (!order.signatureSignedAt) {
            data.signatureSignedAt = new Date();
          }
          if (!order.entrySignatureAt) {
            data.entrySignatureAt = new Date();
          }
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
      // tx1: persistir status do lab + carregar dados do entregador.
      const prep = await ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({
          where: { id: input.orderId },
          select: { status: true, sentToLab: true, labReceived: true },
        });
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });
        if (!isLabEligibleStatus(order.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nao e possivel enviar ao laboratorio uma OS paga, entregue, cancelada ou estornada.",
          });
        }
        if (order.sentToLab && !order.labReceived) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Este aparelho ja esta no laboratorio externo. Confirme o recebimento antes de reenviar.",
          });
        }

        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: {
            sentToLab: true,
            labReceived: false,
            deliveryPersonId: input.deliveryPersonId,
          },
        });

        const dp = await tx.deliveryPerson.findUnique({
          where: { id: input.deliveryPersonId },
          select: { name: true, phone: true },
        });

        const orderInfo = await tx.serviceOrder.findUnique({
          where: { id: input.orderId },
          select: { number: true },
        });

        return {
          order,
          deliveryName: dp?.name ?? "entregador",
          deliveryPhone: dp?.phone ?? null,
          orderNumber: orderInfo?.number ?? "",
        };
      });

      // WhatsApp Cloud com fallback de template `entregador_solicitacao` —
      // entregador raramente fala com a loja todo dia, free-text puro nao
      // entrega fora da janela 24h. Paridade Laravel `enviarComFallbackTemplate`.
      let whatsappSent = false;
      if (prep.deliveryPhone) {
        try {
          const result = await sendTextWithFallback({
            phone: prep.deliveryPhone,
            freeText: input.message,
            contexto: "entregador_solicitacao",
            params: [prep.deliveryName, `envio ao laboratorio da OS ${prep.orderNumber}`],
            log: { tenantId: ctx.tenantId, originType: "service_order", originId: input.orderId },
          });
          whatsappSent = result.success;
        } catch {
          // best-effort
        }
      }

      // tx2: history.
      await ctx.withTenant(async (tx) => {
        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: prep.order.status,
            newStatus: prep.order.status,
            notes: whatsappSent
              ? "Aparelho enviado ao laboratorio externo (entregador notificado via WhatsApp)"
              : "Aparelho enviado ao laboratorio externo",
          },
        });
      });

      return { success: true, whatsappSent };
    }),

  // ── RECEIVE FROM LAB ──
  receiveFromLab: tenantProcedure
    .input(receiveFromLabSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({
          where: { id: input.orderId },
          select: { status: true, sentToLab: true, labReceived: true },
        });
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });
        if (!order.sentToLab || order.labReceived) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nenhum aparelho aguardando retorno do laboratorio.",
          });
        }

        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: { labReceived: true },
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: order.status,
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
        const order = await tx.serviceOrder.findUnique({
          where: { id: input.orderId },
          select: { status: true, sentToLab: true },
        });
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });
        if (!order.sentToLab) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nenhum envio ao laboratorio para cancelar.",
          });
        }

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
            previousStatus: order.status,
            newStatus: order.status,
            notes: "Envio para laboratorio externo cancelado",
          },
        });
        return { success: true };
      });
    }),

  // ── CANCEL QUOTE (cancelar alteracao — reverte itens) ──
  // A equipe descarta a revisao de orcamento em andamento: reverte os itens ao
  // estado autorizado anterior (snapshot), reconcilia estoque e restaura o
  // status. Mesmo efeito de uma rejeicao, porem iniciado internamente.
  cancelQuote: tenantProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order || !order.pendingQuoteId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum orcamento pendente." });
        }
        assertOrderAcceptsQuote(order);

        const quote = await tx.serviceOrderQuote.findUnique({ where: { id: order.pendingQuoteId } });
        if (!quote) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Orcamento nao encontrado." });
        }

        await tx.serviceOrderQuote.update({
          where: { id: quote.id },
          data: { status: "rejected", rejectedAt: new Date(), customerNotes: "Cancelado pela equipe" },
        });

        // Reverte itens ao estado anterior autorizado.
        const snapshot = (quote.previousItemsSnapshot ?? null) as ItemSnapshot[] | null;
        await revertItemsToSnapshot(
          tx,
          { id: order.id, tenantId: ctx.tenantId },
          snapshot,
          decimalToCents(quote.previousDiscount),
          ctx.session.user.id,
        );

        const restoredStatus = await resolveStatusAfterQuote(tx, input.orderId, "reject");
        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: { pendingQuoteId: null, budgetPending: false, status: restoredStatus as never },
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: "WAITING_APPROVAL",
            newStatus: restoredStatus,
            notes: "Alteracao de orcamento cancelada pela equipe — itens revertidos",
          },
        });

        return { success: true };
      });
    }),

  // ── APPROVE QUOTE MANUALLY (admin) ──
  approveQuoteManually: tenantProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // RBAC: paridade Laravel `aprovarOrcamentoManual` exige gerente/admin.
      // Super admin sempre pode.
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao para aprovar orcamento manualmente" });
      }
      const userName = ctx.session.user.name ?? "Administrador";
      const txResult = await ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order || !order.pendingQuoteId) {
          throw new TRPCError({ code: "BAD_REQUEST" });
        }

        const quote = await tx.serviceOrderQuote.findUnique({ where: { id: order.pendingQuoteId } });
        if (!quote || quote.status !== "pending") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Orcamento nao encontrado ou ja processado." });
        }

        await applyQuoteApproval(
          tx,
          order,
          quote,
          ctx.session.user.id,
          ctx.tenantId,
          `Orcamento aprovado manualmente por ${userName}`,
          `Aprovado manualmente por ${userName}`,
        );

        return { success: true };
      });

      return txResult;
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
          // diagnosedProblem e notas do historico sao INTERNOS — nao expor no
          // link publico do cliente (pode conter diagnostico tecnico/custos).
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

        // Whitelist explicito — endpoint PUBLICO; nao expor tenantId, userId,
        // orderId, approvalLink, id (campos internos que serializeQuote() espalha).
        return {
          status: quote.status,
          reason: quote.reason,
          additionalServices: quote.additionalServices,
          sentToCustomer: quote.sentToCustomer,
          sentAt: quote.sentAt,
          approvedAt: quote.approvedAt,
          rejectedAt: quote.rejectedAt,
          customerNotes: quote.customerNotes,
          createdAt: quote.createdAt,
          previousServiceAmount: decimalToCents(quote.previousServiceAmount),
          previousPartsAmount: decimalToCents(quote.previousPartsAmount),
          previousDiscount: decimalToCents(quote.previousDiscount),
          previousTotal: decimalToCents(quote.previousTotal),
          newServiceAmount: decimalToCents(quote.newServiceAmount),
          newPartsAmount: decimalToCents(quote.newPartsAmount),
          newDiscount: decimalToCents(quote.newDiscount),
          newTotal: decimalToCents(quote.newTotal),
          previousItemsSnapshot: quote.previousItemsSnapshot,
          newItemsSnapshot: quote.newItemsSnapshot,
          orderNumber: quote.order.number,
          customerName: customer?.name ?? "—",
          tenantName: tenant?.name ?? "Arena Tech",
          deviceType: quote.order.deviceType,
          deviceModel: quote.order.deviceModel,
        };
      });
    }),

  // ── PUBLIC: respond to quote ──
  // Rate limit: 20 respostas por IP/15min — protege contra spam mesmo
  // que o atacante tenha obtido um link valido.
  respondToQuote: publicProcedure
    .use(rateLimitMiddleware({ limit: 20, windowMs: 15 * 60 * 1000 }))
    .input(respondQuoteSchema)
    .mutation(async ({ input }) => {
      const txResult = await withAdmin(async (tx) => {
        const quote = await tx.serviceOrderQuote.findFirst({
          where: { approvalLink: input.link },
        });

        if (!quote) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Orcamento nao encontrado" });
        }

        if (quote.status !== "pending") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Este orcamento ja foi processado." });
        }

        const order = await tx.serviceOrder.findUnique({ where: { id: quote.orderId } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });

        const obs = input.customerNotes ? ". Obs: " + input.customerNotes : "";
        if (input.action === "approve") {
          await applyQuoteApproval(
            tx,
            order,
            quote,
            quote.userId,
            quote.tenantId,
            `Orcamento aprovado pelo cliente${obs}`,
            input.customerNotes ?? null,
          );
        } else {
          await applyQuoteRejection(
            tx,
            order,
            quote,
            quote.userId,
            quote.tenantId,
            `Orcamento rejeitado pelo cliente${obs}`,
            input.customerNotes ?? null,
          );
        }

        return { success: true, action: input.action };
      });

      return txResult;
    }),

  // NOTA: aprovar/rejeitar orcamento manualmente (sem link publico) já é coberto
  // por `approveQuoteManually` (aprovar) e `cancelQuote` (rejeitar/reverter,
  // restaurando o status anterior). A antiga `adminRespondQuote` (redundante) foi
  // removida.

  // ── ATTACH NFS-e (upload de PDF/imagem) ──
  /**
   * Anexa o PDF (ou imagem) da NFS-e emitida manualmente em outro sistema.
   * Sobe no MinIO em `nfse/{tenantId}/{orderId}/{fileName}` e persiste o
   * path em `nfseAttachmentPath`. Paridade Laravel campo `nfse_anexo`.
   */
  attachNfse: tenantProcedure
    .input(attachNfseSchema)
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao para anexar NFS-e" });
      }

      // Decodifica base64 (aceita data URL prefix)
      const cleanBase64 = input.fileBase64.replace(/^data:[^;]+;base64,/, "");
      let buffer: Buffer;
      try {
        buffer = Buffer.from(cleanBase64, "base64");
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo base64 invalido" });
      }
      if (buffer.length > 4 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo maior que 4 MB" });
      }

      // Upload MinIO via S3 SDK (mesma infra de logo/imagem de produto).
      const sanitized = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `nfse/${ctx.tenantId}/${input.orderId}/${Date.now()}_${sanitized}`;
      const bucket = process.env.S3_BUCKET || process.env.MINIO_BUCKET || "arenatech";
      const endpoint =
        process.env.S3_ENDPOINT || process.env.MINIO_ENDPOINT || "http://localhost:9000";
      try {
        const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
        const client = new S3Client({
          region: "us-east-1",
          endpoint,
          forcePathStyle: true,
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY || "minioadmin",
            secretAccessKey: process.env.S3_SECRET_KEY || "minioadmin",
          },
        });
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType: input.contentType,
          }),
        );
      } catch (err) {
        if (process.env.NODE_ENV === "production") {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Falha ao subir arquivo: " + (err instanceof Error ? err.message : "erro"),
          });
        }
        logger.warn("NFS-e upload skipped (dev mode)", { key });
      }

      // Persiste no DB
      let oldKey: string | null = null;
      await ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });
        oldKey = order.nfseAttachmentPath ?? null;
        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: {
            nfseAttachmentPath: key,
            nfseIssued: true,
            nfseIssuedAt: order.nfseIssuedAt ?? new Date(),
            ...(input.nfseNumber ? { nfseNumber: input.nfseNumber } : {}),
          },
        });
        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: order.status,
            notes: `NFS-e anexada: ${sanitized}${input.nfseNumber ? ` (numero ${input.nfseNumber})` : ""}`,
          },
        });
      });

      // Apaga o anexo antigo no MinIO (best-effort) para evitar orfaos quando
      // o operador re-anexa uma NFS-e.
      if (oldKey && oldKey !== key) {
        await deleteNfseAttachment(input.orderId, oldKey);
      }

      return { success: true, key };
    }),

  // ── DETACH NFS-e ──
  // Remove o anexo e zera nfseIssued/nfseNumber/nfseIssuedAt/nfseAttachmentPath.
  // Apaga o arquivo do MinIO (best-effort).
  detachNfse: tenantProcedure
    .input(detachNfseSchema)
    .mutation(async ({ ctx, input }) => {
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao para desfazer anexo de NFS-e" });
      }

      const oldKey = await ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });
        const old = order.nfseAttachmentPath ?? null;
        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: {
            nfseAttachmentPath: null,
            nfseIssued: false,
            nfseIssuedAt: null,
            nfseNumber: null,
          },
        });
        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: order.status,
            notes: "Anexo da NFS-e removido",
          },
        });
        return old;
      });

      if (oldKey) {
        await deleteNfseAttachment(input.orderId, oldKey);
      }

      return { success: true };
    }),

  // ── SIGNATURE PAD (assinatura SVG/PNG capturada na tela) ──
  /**
   * Salva assinatura SVG/PNG base64 capturada via signature-pad
   * (alternativa ao Autentique digital). Paridade Laravel
   * `assinatura_entrada_*` / `assinatura_saida_*`.
   */
  saveSignaturePad: tenantProcedure
    .input(saveSignaturePadSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({
          where: { id: input.orderId },
          select: { status: true },
        });
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });

        const fieldName =
          input.moment === "entry"
            ? input.signer === "client"
              ? "entrySignatureClient"
              : "entrySignatureTechnician"
            : input.signer === "client"
              ? "exitSignatureClient"
              : "exitSignatureTechnician";
        const tsField = input.moment === "entry" ? "entrySignatureAt" : "exitSignatureAt";

        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: {
            [fieldName]: input.dataUrl,
            [tsField]: new Date(),
          } as never,
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: order.status,
            notes: `Assinatura ${input.moment === "entry" ? "de entrada" : "de saida"} capturada (${input.signer === "client" ? "cliente" : "tecnico"})`,
          },
        });

        return { success: true };
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
        const appUrl = getAppBaseUrl();
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
          log: { tenantId: ctx.tenantId, originType: "service_order", originId: input.orderId },
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
      // tx1: validar + carregar order
      const order = await ctx.withTenant(async (tx) => {
        const o = await tx.serviceOrder.findUnique({
          where: { id: input.orderId },
        });
        if (!o) throw new TRPCError({ code: "NOT_FOUND", message: "OS nao encontrada" });
        if (!o.signatureDocumentId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum documento de assinatura enviado." });
        }
        return o;
      });

      // HTTP Autentique fora da tx (mesma logica das outras checkXxxStatus).
      const status = await getDocumentStatus(order.signatureDocumentId!);
      if (!status.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: status.error ?? "Erro ao consultar Autentique" });
      }

      // tx2: aplicar resultado se acabou de ser assinado.
      if (status.signed && !order.signatureSignedAt) {
        await ctx.withTenant(async (tx) => {
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
        });
      }

      return {
        signed: status.signed,
        signaturesCompleted: status.signaturesCompleted,
        totalSignatures: status.totalSignatures,
      };
    }),

  // ── LIST TECHNICIANS ──
  listTechnicians: tenantProcedure.query(async ({ ctx }) => {
    // Quem pode ser o tecnico responsavel pela OS — filtra por `isTechnician`
    // (paridade Laravel `usuarios.eh_tecnico`). A flag e independente do
    // papel de login: um owner/admin/manager pode atuar como tecnico, e um
    // operator pode estar no balcao sem trabalhar em bancada. O dropdown
    // de tecnicos da OS so deve listar quem efetivamente faz o reparo.
    const userTenants = await withAdmin(async (adminTx) => {
      return adminTx.userTenant.findMany({
        where: { tenantId: ctx.tenantId, isTechnician: true },
        select: {
          user: { select: { id: true, name: true } },
          role: true,
        },
        orderBy: { user: { name: "asc" } },
      });
    });

    // Todos aqui têm a flag isTechnician; ordena por nome (já vem ordenado).
    return userTenants.map((ut) => ({ id: ut.user.id, name: ut.user.name, role: ut.role }));
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
        const { items, totals } = await buildTechnicianReport(tx, ctx.tenantId, input);
        const ticketMedio = totals.completed > 0
          ? Math.round(totals.totalValue / totals.completed)
          : 0;
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
          // P9: limite — usado p/ checagem de garantia; clientes antigos podem
          // ter dezenas de OS. As mais recentes bastam.
          take: 50,
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
          include: {
            variations: {
              where: { active: true, deletedAt: null },
              include: { attributeValues: { include: { attributeValue: true } } },
            },
          },
        });

        return products.map((p) => ({
          id: p.id,
          name: p.name,
          brand: p.brand,
          sku: p.sku,
          // Produtos sem variacao: currentStock e a fonte da verdade. Com
          // variacao, o estoque/preco vem de cada variacao (abaixo).
          stock: p.currentStock,
          costPrice: decimalToCents(p.costPrice),
          salePrice: decimalToCents(p.salePrice),
          hasVariations: p.hasVariations,
          variations: p.hasVariations
            ? p.variations.map((v) => ({
                id: v.id,
                label:
                  v.attributeValues
                    .map((av) => av.attributeValue.displayValue ?? av.attributeValue.value)
                    .join(" / ") || (v.sku ?? "Variacao"),
                stock: v.currentStock,
                salePrice: decimalToCents(v.salePrice ?? p.salePrice),
                costPrice: decimalToCents(v.costPrice ?? p.costPrice),
              }))
            : [],
        }));
      });
    }),

  // ── 3. SEND TRACKING ──
  sendTracking: tenantProcedure
    .input(sendTrackingSchema)
    .mutation(async ({ ctx, input }) => {
      // Fetch curto na tx — envio HTTP fora.
      const { order, customerName, phone, trackingUrl } = await ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order || order.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
        if (!order.publicLink) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "OS sem link publico configurado." });
        }
        const customer = await tx.customer.findUnique({
          where: { id: order.customerId },
          select: { name: true, phone: true },
        });
        const phone = input.phone ?? customer?.phone ?? null;
        if (!phone) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Cliente sem telefone para envio." });
        }
        const appUrl = getAppBaseUrl();
        return {
          order,
          customerName: customer?.name ?? "Cliente",
          phone,
          trackingUrl: `${appUrl}/os/${order.publicLink}`,
        };
      });

      const freeText = `Ola, ${customerName}!\n\nSua Ordem de Servico ${order.number} foi aberta. Acompanhe o status em tempo real pelo link:\n${trackingUrl}\n\nArena Tech`;
      // Template fora da janela 24h — paridade Laravel `os_rastreamento`.
      const result = await sendTextWithFallback({
        phone,
        freeText,
        contexto: "os_rastreamento",
        params: [customerName, order.number],
        log: { tenantId: ctx.tenantId, originType: "service_order", originId: input.orderId },
        urlButtonParam: order.publicLink ?? undefined,
      });
      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error ?? "Falha ao enviar WhatsApp",
        });
      }

      await ctx.withTenant(async (tx) => {
        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: order.status,
            newStatus: order.status,
            notes: `Link de rastreamento enviado via WhatsApp (${result.via})`,
          },
        });
      });

      return { success: true };
    }),

  // ── 4. NOTIFY DELIVERY PERSON ── (HTTP fora da tx)
  notifyDeliveryPerson: tenantProcedure
    .input(notifyDeliveryPersonSchema)
    .mutation(async ({ ctx, input }) => {
      // tx1: validar + carregar.
      const prep = await ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order || order.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });

        const deliveryPerson = await tx.deliveryPerson.findUnique({
          where: { id: input.deliveryPersonId },
        });
        if (!deliveryPerson) throw new TRPCError({ code: "NOT_FOUND", message: "Entregador nao encontrado" });

        return { order, deliveryPerson };
      });

      // WhatsApp Cloud com fallback de template `entregador_solicitacao` —
      // entregador fora da janela 24h e free-text puro nao entrega.
      // Paridade Laravel `enviarComFallbackTemplate('entregador_solicitacao', ...)`.
      let whatsappSent = false;
      if (prep.deliveryPerson.phone) {
        const result = await sendTextWithFallback({
          phone: prep.deliveryPerson.phone,
          freeText: input.message,
          contexto: "entregador_solicitacao",
          params: [prep.deliveryPerson.name, `OS ${prep.order.number}`],
          log: { tenantId: ctx.tenantId, originType: "service_order", originId: input.orderId },
        });
        whatsappSent = result.success;
        if (!result.success) {
          logger.warn("Falha ao enviar WhatsApp para entregador", {
            orderId: input.orderId,
            deliveryPersonId: prep.deliveryPerson.id,
            error: result.error,
          });
        }
      }

      // tx2: persistir + history.
      await ctx.withTenant(async (tx) => {
        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: { deliveryPersonId: prep.deliveryPerson.id },
        });

        const context = input.context ?? "generico";
        const noteText = context === "retirada"
          ? `Solicitada retirada do aparelho no laboratorio. Entregador: ${prep.deliveryPerson.name}`
          : `Mensagem enviada ao entregador: ${prep.deliveryPerson.name}`;

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: prep.order.status,
            newStatus: prep.order.status,
            notes: `${noteText} (WhatsApp ${whatsappSent ? "enviado" : "nao enviado"})`,
          },
        });
      });

      return { success: true, whatsappSent };
    }),

  // ── 5. SEND DELIVERY TERM ──
  sendDeliveryTerm: tenantProcedure
    .input(sendDeliveryTermSchema)
    .mutation(async ({ ctx, input }) => {
      // tx1: validar + carregar dados necessarios.
      const prep = await ctx.withTenant(async (tx) => {
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

        return { order, customer, phone };
      });

      // PDF do termo via builder direto (gerado em processo). Antes ia via
      // fetch HTTP no proprio endpoint /api/service-orders/[id]/termo-entrega,
      // que exige cookie de sessao — o fetch server-to-server nao propaga o
      // cookie e sempre retornava 401 em producao.
      let pdfBuffer: Buffer;
      try {
        const pdf = await buildServiceOrderTermoEntregaPdf(ctx.tenantId, input.orderId);
        if (!pdf) throw new Error("OS not found");
        pdfBuffer = pdf;
      } catch (err) {
        logger.error("Failed to build delivery term PDF", { orderId: input.orderId, error: err });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao gerar PDF do termo de entrega" });
      }

      const result = await createDocumentWithLink(
        `Termo de Entrega - OS ${prep.order.number}`,
        [{ name: prep.customer.name, whatsapp: formatWhatsApp(prep.phone) }],
        pdfBuffer,
      );

      if (!result.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Erro ao enviar para Autentique" });
      }

      // WhatsApp Cloud — legenda com o link Autentique (free-text, best-effort).
      if (result.signatureLink) {
        const caption = `Termo de Entrega - OS #${prep.order.number}\n\nOla, ${prep.customer.name}! Para assinar digitalmente:\n${result.signatureLink}`;
        await sendCloudText(prep.phone, caption).catch((err) => {
          logger.warn("WhatsApp envio do termo de entrega falhou", {
            orderId: input.orderId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }

      // tx2: persistir resultado + historico.
      return await ctx.withTenant(async (tx) => {
        await tx.serviceOrder.update({
          where: { id: input.orderId },
          data: {
            deliveryTermSent: true,
            deliveryTermSentAt: new Date(),
            deliveryTermAutentiqueId: result.documentId ?? null,
            deliveryTermLink: result.signatureLink ?? null,
          },
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: prep.order.status,
            newStatus: prep.order.status,
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

  // ── 7. CHECK DELIVERY TERM STATUS ── (HTTP Autentique fora da tx)
  checkDeliveryTermStatus: tenantProcedure
    .input(checkDeliveryTermStatusSchema)
    .mutation(async ({ ctx, input }) => {
      const prep = await ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });

        if (order.deliveryTermSigned) {
          return { alreadySigned: true as const, order };
        }

        if (!order.deliveryTermAutentiqueId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Termo de entrega nao foi enviado para assinatura digital." });
        }

        return { alreadySigned: false as const, order };
      });

      if (prep.alreadySigned) {
        return { signed: true, alreadySigned: true };
      }

      const status = await getDocumentStatus(prep.order.deliveryTermAutentiqueId!);
      if (!status.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: status.error ?? "Erro ao consultar Autentique" });
      }

      if (status.signed) {
        // M4: so avanca para DELIVERED se a OS ja estiver paga (PAID/READY_FOR_PICKUP),
        // mesmo gate que confirmPhysicalDeliveryTerm e confirmPhysicalSignature(delivery).
        // Cliente assinando o termo antes do pagamento nao deve pular o fluxo financeiro.
        const canDeliver = ["PAID", "READY_FOR_PICKUP"].includes(prep.order.status);
        await ctx.withTenant(async (tx) => {
          await tx.serviceOrder.update({
            where: { id: input.orderId },
            data: {
              deliveryTermSigned: true,
              deliveryTermSignedAt: new Date(),
              ...(canDeliver
                ? { status: "DELIVERED", deliveredDate: new Date() }
                : {}),
            },
          });

          await tx.serviceOrderHistory.create({
            data: {
              tenantId: ctx.tenantId,
              orderId: input.orderId,
              userId: ctx.session.user.id,
              previousStatus: prep.order.status,
              newStatus: canDeliver ? "DELIVERED" : prep.order.status,
              notes: canDeliver
                ? "Termo de entrega assinado digitalmente e equipamento entregue ao cliente"
                : "Termo de entrega assinado digitalmente (aguardando pagamento para entregar)",
            },
          });
        });
      }

      return { signed: status.signed, alreadySigned: false };
    }),

  // ── 8. SEND RETURN TERM ── (HTTP fora da tx — ver sendDeliveryTerm)
  sendReturnTerm: tenantProcedure
    .input(sendReturnTermSchema)
    .mutation(async ({ ctx, input }) => {
      const prep = await ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order || order.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });

        const customer = await tx.customer.findUnique({
          where: { id: order.customerId },
          select: { name: true, phone: true },
        });
        if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Cliente nao encontrado" });

        const phone = input.phone ?? customer.phone;
        if (!phone) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum telefone disponivel." });

        return { order, customer, phone };
      });

      // PDF do termo via builder direto (mesmo motivo do sendDeliveryTerm:
      // fetch HTTP server-to-server nao propaga cookie e o endpoint exige auth).
      let pdfBuffer: Buffer;
      try {
        const pdf = await buildServiceOrderTermoDevolucaoPdf(ctx.tenantId, input.orderId);
        if (!pdf) throw new Error("OS not found");
        pdfBuffer = pdf;
      } catch (err) {
        logger.error("Failed to build return term PDF", { orderId: input.orderId, error: err });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao gerar PDF do termo de devolucao" });
      }

      const result = await createDocumentWithLink(
        `Termo de Devolucao - OS ${prep.order.number}`,
        [{ name: prep.customer.name, whatsapp: formatWhatsApp(prep.phone) }],
        pdfBuffer,
      );

      if (!result.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Erro ao enviar para Autentique" });
      }

      if (result.signatureLink) {
        const caption = `Termo de Devolucao - OS #${prep.order.number}\n\nOla, ${prep.customer.name}! Para assinar digitalmente:\n${result.signatureLink}`;
        await sendCloudText(prep.phone, caption).catch((err) => {
          logger.warn("WhatsApp envio do termo de devolucao falhou", {
            orderId: input.orderId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }

      const reason = input.reason ?? "Equipamento devolvido ao cliente";

      return await ctx.withTenant(async (tx) => {
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

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: prep.order.status,
            newStatus: prep.order.status,
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

  // ── 10. CHECK RETURN TERM STATUS ── (HTTP Autentique fora da tx)
  checkReturnTermStatus: tenantProcedure
    .input(checkReturnTermStatusSchema)
    .mutation(async ({ ctx, input }) => {
      const prep = await ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order) throw new TRPCError({ code: "NOT_FOUND" });

        if (order.returnTermSigned) {
          return { alreadySigned: true as const, order };
        }

        if (!order.returnTermAutentiqueId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Termo de devolucao nao foi enviado para assinatura digital." });
        }

        return { alreadySigned: false as const, order };
      });

      if (prep.alreadySigned) {
        return { signed: true, alreadySigned: true, cancelled: false };
      }

      const status = await getDocumentStatus(prep.order.returnTermAutentiqueId!);
      if (!status.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: status.error ?? "Erro ao consultar Autentique" });
      }

      if (!status.signed) {
        return { signed: false, alreadySigned: false, cancelled: false };
      }

      const reason = prep.order.cancellationReason ?? "Equipamento devolvido ao cliente";

      await ctx.withTenant(async (tx) => {
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
            previousStatus: prep.order.status,
            newStatus: prep.order.status,
            notes: "Termo de devolucao assinado digitalmente pelo cliente",
          },
        });

        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: prep.order.status,
            newStatus: "CANCELLED",
            notes: `OS cancelada - ${reason}`,
          },
        });
      });

      return { signed: true, alreadySigned: false, cancelled: true };
    }),

  // ── 11. REQUEST BUDGET APPROVAL ── (envia revisao ao cliente, HTTP fora da tx)
  // Substitui o antigo createQuote+sendQuoteWhatsApp: a revisao ja existe
  // (auto-criada na edicao dos itens). Aqui o operador registra o motivo,
  // congela o snapshot dos novos itens e dispara a mensagem ao cliente.
  requestBudgetApproval: tenantProcedure
    .input(requestBudgetApprovalSchema)
    .mutation(async ({ ctx, input }) => {
      // tx1: validar + registrar motivo/snapshot + carregar customer.
      const prep = await ctx.withTenant(async (tx) => {
        const order = await tx.serviceOrder.findUnique({ where: { id: input.orderId } });
        if (!order || order.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
        assertOrderAcceptsQuote(order);

        if (!order.pendingQuoteId || !order.budgetPending) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nao ha alteracao de orcamento para autorizar." });
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

        // Congela o motivo + snapshot dos itens atuais (estado enviado ao cliente).
        const items = await tx.serviceOrderItem.findMany({ where: { orderId: order.id } });
        const updatedQuote = await tx.serviceOrderQuote.update({
          where: { id: quote.id },
          data: {
            reason: input.reason,
            additionalServices: input.additionalServices ?? null,
            newItemsSnapshot: snapshotItems(items) as unknown as Prisma.InputJsonValue,
            sentToCustomer: true,
            sentAt: new Date(),
          },
        });

        return { order, quote: updatedQuote, customer, phone };
      });

      // IO externo FORA da tx — gera PDF do orcamento e cria documento no
      // Autentique para o cliente assinar (paridade com a assinatura de entrada
      // da OS). O orcamento revisado segue o mesmo fluxo: o cliente recebe um
      // PDF com botao "Assinar". A aprovacao via /quote permanece disponivel
      // como fallback (page publica), e admin/gerente pode aprovar manualmente
      // via approveQuoteManually.
      let pdfBuffer: Buffer;
      try {
        const buf = await buildServiceOrderQuotePdf(ctx.tenantId, input.orderId);
        if (!buf) throw new Error("Orcamento nao encontrado");
        pdfBuffer = buf;
      } catch (err) {
        logger.error("Falha ao gerar PDF do orcamento para assinatura", { orderId: input.orderId, error: err });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao gerar PDF do orcamento para assinatura" });
      }

      const autentique = await createDocumentWithLink(
        `Orcamento - OS ${prep.order.number}`,
        [{ name: prep.customer.name, whatsapp: formatWhatsApp(prep.phone) }],
        pdfBuffer,
      );
      if (!autentique.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: autentique.error ?? "Erro ao enviar orcamento para Autentique",
        });
      }

      // Persiste o vinculo Autentique no quote (o webhook usa signatureDocumentId
      // para aprovar o orcamento quando o cliente assinar).
      await ctx.withTenant(async (tx) => {
        await tx.serviceOrderQuote.update({
          where: { id: prep.quote.id },
          data: {
            signatureDocumentId: autentique.documentId ?? null,
            signatureLink: autentique.signatureLink ?? null,
          },
        });
      });

      // Envia via WhatsApp com botao "Assinar" (template os_termo_pdf_link).
      const appUrl = getAppBaseUrl();
      const pdfToken = createPublicPdfToken(ctx.tenantId, input.orderId, 60 * 60 * 1000);
      const pdfUrl = `${appUrl}/api/whatsapp-media/os-quote/pdf/${pdfToken}`;
      const autentiqueToken = autentique.signatureLink
        ? extractShortlinkToken(autentique.signatureLink)
        : null;
      const totalFormatted = (Number(prep.quote.newTotal)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const signatureLine = autentique.signatureLink
        ? `Para aprovar, assine digitalmente:\n${autentique.signatureLink}`
        : "Para aprovar, assine digitalmente pelo botao abaixo.";
      const caption =
        `📋 *Orcamento - OS #${prep.order.number}*\n\n` +
        `Ola, ${prep.customer.name}! Houve uma alteracao no orcamento.\n` +
        `Novo valor: ${totalFormatted}\n\n${signatureLine}`;

      const wa = await sendPdfWithFallback({
        phone: prep.phone,
        pdfUrl,
        fileName: `OS_${prep.order.number}_orcamento.pdf`,
        caption,
        contexto: autentiqueToken ? "os_termo_pdf_link" : "os_termo_pdf",
        params: [prep.customer.name, prep.order.number],
        urlButtonParam: autentiqueToken ?? undefined,
        log: { tenantId: ctx.tenantId, originType: "service_order", originId: input.orderId },
      });
      if (!wa.success) {
        logger.warn("Falha ao enviar orcamento por WhatsApp", {
          orderId: input.orderId, error: wa.error,
        });
      }

      // tx2: registrar envio no historico.
      await ctx.withTenant(async (tx) => {
        await tx.serviceOrderHistory.create({
          data: {
            tenantId: ctx.tenantId,
            orderId: input.orderId,
            userId: ctx.session.user.id,
            previousStatus: prep.order.status,
            newStatus: prep.order.status,
            notes: `Orcamento enviado para assinatura digital (Autentique). Motivo: ${input.reason}`,
          },
        });
      });

      return { success: true, whatsappSent: wa.success, signatureLink: autentique.signatureLink };
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
      // RBAC: paridade Laravel `atualizarTecnico` exige role admin.
      if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao para alterar tecnico responsavel" });
      }
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

        // SEGURANCA (isolamento cross-tenant): o tecnico precisa pertencer ao
        // tenant ativo. `tx` roda escopado (withTenant); a PK composta de
        // user_tenants filtra por tenantId, entao so casa se houver vinculo.
        const techLink = await tx.userTenant.findUnique({
          where: { userId_tenantId: { userId: input.technicianId, tenantId: ctx.tenantId } },
          select: { userId: true },
        });
        if (!techLink) throw new TRPCError({ code: "NOT_FOUND", message: "Tecnico nao pertence a este tenant" });

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
      const appUrl = getAppBaseUrl();
      const pdfUrl = `${appUrl}/api/whatsapp-media/os/pdf/${pdfToken}`;
      const caption = `📄 Recibo - OS #${order.number}\n\nOlá, ${customerName}! Segue em anexo o recibo da sua Ordem de Serviço.`;
      const wa = await sendPdfWithFallback({
        phone,
        pdfUrl,
        fileName: `OS_${order.number}_recibo.pdf`,
        caption,
        contexto: "os_recibo_pdf",
        params: [customerName, order.number],
        log: { tenantId: ctx.tenantId, originType: "service_order", originId: input.orderId },
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

  // NOTA (ADR OS): o reenvio manual de "OS pronta" vive em
  // `communication.notifyOsCompleted` (com override de telefone + log em
  // Message). A notificacao automatica ocorre no updateStatus -> COMPLETED.
  // A antiga `serviceOrder.notifyCompletion` (orfa) foi removida.

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

  // Total BRUTO (serviço + peças). Desconto não é mais dado na OS — vai pro PDV.
  const totalAmount = serviceAmount + partsAmount;

  await tx.serviceOrder.update({
    where: { id: orderId },
    data: {
      serviceAmount: new Prisma.Decimal(serviceAmount),
      partsAmount: new Prisma.Decimal(partsAmount),
      totalAmount: new Prisma.Decimal(Math.max(0, totalAmount)),
    },
  });
}

// ── Helpers: revisao de orcamento (autorizacao pos-assinatura) ──

/**
 * Snapshot de um item para JSON (valores em centavos). Inclui serviceId/productId
 * e costPrice para permitir recriar o item (e reservar estoque) na reversao.
 */
type ItemSnapshot = {
  type: "SERVICE" | "PRODUCT";
  serviceId: string | null;
  productId: string | null;
  variationId: string | null;
  description: string;
  quantity: number;
  unitPrice: number; // centavos
  costPrice: number; // centavos
  total: number; // centavos
};


function snapshotItems(items: any[]): ItemSnapshot[] {
  return items.map((i) => ({
    type: i.type,
    serviceId: i.serviceId ?? null,
    productId: i.productId ?? null,
    variationId: i.variationId ?? null,
    description: i.description,
    quantity: Number(i.quantity),
    unitPrice: decimalToCents(i.unitPrice),
    costPrice: decimalToCents(i.costPrice),
    total: decimalToCents(i.total),
  }));
}

/**
 * True quando a assinatura de ENTRADA do cliente foi confirmada no sistema
 * (Autentique, fisica ou signature-pad). A partir desse ponto o aparelho esta
 * sob responsabilidade da loja com o orcamento aceito — qualquer alteracao de
 * valor exige nova autorizacao do cliente (decisao do dono).
 */
function isEntrySigned(order: {
  physicalSignature?: boolean | null;
  signatureSignedAt?: Date | null;
  entrySignatureAt?: Date | null;
}): boolean {
  return (
    !!order.physicalSignature ||
    order.signatureSignedAt != null ||
    order.entrySignatureAt != null
  );
}

/**
 * Garante que existe uma revisao de orcamento pendente quando a OS ja foi
 * assinada (regime B). Deve ser chamado ANTES de mutar os itens — captura o
 * estado autorizado anterior (previous* + previousItemsSnapshot) para permitir
 * reverter na rejeicao. Idempotente: se ja ha quote pendente, nao faz nada.
 *
 * `order` deve ser a linha pre-edicao (com amounts, status e flags de assinatura).
 * Retorna o id do quote pendente (novo ou existente) ou null se regime A.
 */

async function ensureBudgetRevision(
  tx: any,
  order: any,
  userId: string,
  tenantId: string,
): Promise<string | null> {
  if (!isEntrySigned(order)) return null; // regime A — edicao livre
  if (order.pendingQuoteId) return order.pendingQuoteId; // ja em revisao

  const items = await tx.serviceOrderItem.findMany({ where: { orderId: order.id } });
  const prevSnapshot = snapshotItems(items);

  const quote = await tx.serviceOrderQuote.create({
    data: {
      tenantId,
      orderId: order.id,
      userId,
      previousServiceAmount: order.serviceAmount,
      previousPartsAmount: order.partsAmount,
      previousDiscount: order.discount,
      previousTotal: order.totalAmount,
      // new* iniciam iguais ao anterior; syncBudgetRevision atualiza apos a edicao.
      newServiceAmount: order.serviceAmount,
      newPartsAmount: order.partsAmount,
      newDiscount: order.discount,
      newTotal: order.totalAmount,
      previousItemsSnapshot: prevSnapshot as unknown as Prisma.InputJsonValue,
      reason: "Alteracao de itens do orcamento",
      status: "pending",
      approvalLink: generateQuoteLink(),
    },
  });

  await tx.serviceOrder.update({
    where: { id: order.id },
    data: {
      pendingQuoteId: quote.id,
      budgetPending: true,
      status: "WAITING_APPROVAL",
    },
  });

  await tx.serviceOrderHistory.create({
    data: {
      tenantId,
      orderId: order.id,
      userId,
      previousStatus: order.status,
      newStatus: "WAITING_APPROVAL",
      notes: "Orcamento alterado apos assinatura — aguardando autorizacao",
    },
  });

  return quote.id;
}

/**
 * Atualiza os valores novos (new) do quote pendente com os totais atuais da OS.
 * Chamado APOS recalculateOrderTotals em cada edicao de item/desconto no
 * regime B. Nao toca nos valores anteriores nem nos snapshots.
 */

async function syncBudgetRevision(tx: any, orderId: string): Promise<void> {
  const order = await tx.serviceOrder.findUnique({
    where: { id: orderId },
    select: {
      pendingQuoteId: true,
      serviceAmount: true,
      partsAmount: true,
      discount: true,
      totalAmount: true,
    },
  });
  if (!order?.pendingQuoteId) return;

  const quote = await tx.serviceOrderQuote.findUnique({
    where: { id: order.pendingQuoteId },
    select: { status: true, sentToCustomer: true },
  });
  if (!quote || quote.status !== "pending") return;

  await tx.serviceOrderQuote.update({
    where: { id: order.pendingQuoteId },
    data: {
      newServiceAmount: order.serviceAmount,
      newPartsAmount: order.partsAmount,
      newDiscount: order.discount,
      newTotal: order.totalAmount,
      // R6: se o orcamento ja tinha sido enviado, a nova edicao o torna defasado
      // — exige reenvio para o cliente nao aprovar valores antigos.
      ...(quote.sentToCustomer ? { sentToCustomer: false } : {}),
    },
  });
}

/**
 * Reverte os itens da OS para um snapshot (rejeicao de orcamento / cancelar
 * alteracao). Reconcilia estoque: libera o reservado atual, recria os itens do
 * snapshot e re-reserva. Restaura tambem o desconto e recalcula os totais.
 *
 * R2 — `snapshot` null = quote legado (criado antes da migration de snapshots,
 * sem estado de itens). Nesse caso NAO mexe nos itens nem no desconto: apenas
 * deixa a OS como esta (a rejeicao em si limpa a pendencia/status no chamador).
 *
 * R3 — se a re-reserva nao puder ser satisfeita (peca foi consumida por outra OS
 * no meio-tempo), `reserveStockForOsItem` lanca e a tx inteira faz rollback —
 * integridade de estoque acima de UX. A rejeicao falha e o orcamento continua
 * pendente para a equipe resolver.
 */

async function revertItemsToSnapshot(
  tx: any,
  order: { id: string; tenantId: string },
  snapshot: ItemSnapshot[] | null,
  previousDiscountCents: number,
  userId: string,
): Promise<void> {
  // R2: quote legado sem snapshot de itens — nao reverte itens/desconto.
  if (snapshot == null) return;

  // 1. Libera estoque dos itens-produto atuais.
  await releaseAllOsItems(tx, order.tenantId, userId, order.id);

  // 2. Remove itens atuais.
  await tx.serviceOrderItem.deleteMany({ where: { orderId: order.id } });

  // 3. Recria a partir do snapshot.
  if (snapshot.length > 0) {
    await tx.serviceOrderItem.createMany({
      data: snapshot.map((s) => ({
        tenantId: order.tenantId,
        orderId: order.id,
        type: s.type,
        serviceId: s.serviceId ?? null,
        productId: s.productId ?? null,
        variationId: s.variationId ?? null,
        description: s.description,
        quantity: new Prisma.Decimal(s.quantity),
        unitPrice: centsToPrisma(s.unitPrice),
        costPrice: centsToPrisma(s.costPrice),
        total: centsToPrisma(s.total),
      })),
    });

    // 4. Re-reserva estoque dos itens-produto. Falha => rollback (R3).
    for (const s of snapshot) {
      if (s.type === "PRODUCT" && s.productId) {
        await reserveStockForOsItem(tx, order.tenantId, userId, {
          productId: s.productId,
          variationId: s.variationId ?? null,
          quantity: s.quantity,
          orderId: order.id,
          itemDescription: s.description,
        });
      }
    }
  }

  // 5. Restaura desconto e recalcula.
  await tx.serviceOrder.update({
    where: { id: order.id },
    data: { discount: centsToPrisma(previousDiscountCents) },
  });
  await recalculateOrderTotals(tx, order.id, order.tenantId);
}

/**
 * Aplica uma RewardAction como desconto no pagamento da OS. Valida (cliente
 * bate, APPROVED, nao expirada), marca como USED e retorna o desconto em
 * centavos + uma nota descritiva. Compartilhada entre `registerPayment` e o
 * PAID-path do `updateStatus`.
 */

async function applyRewardActionToOrder(
  tx: any,
  rewardActionId: string,
  order: { id: string; customerId: string; totalAmount: { toString(): string } },
): Promise<{ discountCents: number; note: string }> {
  const action = await tx.rewardAction.findUnique({ where: { id: rewardActionId } });
  if (!action) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Recompensa nao encontrada." });
  }
  if (action.customerId !== order.customerId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Recompensa pertence a outro cliente." });
  }
  if (action.status !== "APPROVED") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Recompensa nao esta disponivel." });
  }
  if (action.expiresAt && action.expiresAt < new Date()) {
    await tx.rewardAction.update({ where: { id: action.id }, data: { status: "EXPIRED" } });
    throw new TRPCError({ code: "BAD_REQUEST", message: "Recompensa expirada." });
  }
  const orderTotalReais = Number(order.totalAmount);
  const percent = Number(action.percentage);
  const value = Number(action.value);
  const discountFromPercent = percent > 0 ? Math.round(((orderTotalReais * percent) / 100) * 100) : 0;
  const discountFromValue = value > 0 ? Math.round(value * 100) : 0;
  const discountCents = Math.max(discountFromPercent, discountFromValue);
  const note = ` | Desconto recompensa: ${percent > 0 ? `${percent}%` : `R$ ${value.toFixed(2)}`}`;

  await tx.rewardAction.update({
    where: { id: action.id },
    data: { status: "USED", usedAt: new Date(), usedInOsId: order.id },
  });
  return { discountCents, note };
}

/**
 * R4 — rejeita responder/enviar orcamento quando a OS nao esta mais elegivel
 * (excluida ou em estado terminal). Evita que um link publico antigo reative
 * uma OS cancelada/entregue/estornada.
 */
function assertOrderAcceptsQuote(order: { deletedAt: Date | null; status: string }): void {
  if (order.deletedAt || ["CANCELLED", "REFUNDED", "DELIVERED"].includes(order.status)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Esta OS nao esta mais disponivel para alteracao de orcamento.",
    });
  }
}

/**
 * Aprova a revisao de orcamento. Como os itens ja sao a fonte da verdade (e os
 * totais ja refletem a alteracao), aqui apenas: registra o snapshot aprovado,
 * limpa a pendencia, restaura o status anterior e cancela PIX que nao bate mais.
 * Retorna o transactionId de PIX a cancelar fora da tx (ou null).
 */

async function applyQuoteApproval(
  tx: any,
  order: any,
  quote: any,
  userId: string,
  tenantId: string,
  noteText: string,
  customerNotes: string | null,
): Promise<void> {
  assertOrderAcceptsQuote(order);
  const items = await tx.serviceOrderItem.findMany({ where: { orderId: order.id } });
  await tx.serviceOrderQuote.update({
    where: { id: quote.id },
    data: {
      status: "approved",
      approvedAt: new Date(),
      customerNotes,
      newItemsSnapshot: snapshotItems(items) as unknown as Prisma.InputJsonValue,
    },
  });

  const restoredStatus = await resolveStatusAfterQuote(tx, order.id, "approve");
  await tx.serviceOrder.update({
    where: { id: order.id },
    data: { pendingQuoteId: null, budgetPending: false, status: restoredStatus as never },
  });

  await tx.serviceOrderHistory.create({
    data: {
      tenantId,
      orderId: order.id,
      userId,
      previousStatus: "WAITING_APPROVAL",
      newStatus: restoredStatus,
      notes: noteText,
    },
  });
}

/**
 * Rejeita a revisao de orcamento: reverte os itens ao estado autorizado anterior
 * (snapshot, com reconciliacao de estoque), restaura o desconto e leva a OS de
 * volta para diagnostico para renegociar (decisao do dono).
 */

async function applyQuoteRejection(
  tx: any,
  order: any,
  quote: any,
  userId: string,
  tenantId: string,
  noteText: string,
  customerNotes: string | null,
): Promise<void> {
  assertOrderAcceptsQuote(order);
  await tx.serviceOrderQuote.update({
    where: { id: quote.id },
    data: { status: "rejected", rejectedAt: new Date(), customerNotes },
  });

  const snapshot = (quote.previousItemsSnapshot ?? null) as ItemSnapshot[] | null;
  await revertItemsToSnapshot(
    tx,
    { id: order.id, tenantId },
    snapshot,
    decimalToCents(quote.previousDiscount),
    userId,
  );

  await tx.serviceOrder.update({
    where: { id: order.id },
    data: { pendingQuoteId: null, budgetPending: false, status: "IN_DIAGNOSIS" },
  });

  await tx.serviceOrderHistory.create({
    data: {
      tenantId,
      orderId: order.id,
      userId,
      previousStatus: "WAITING_APPROVAL",
      newStatus: "IN_DIAGNOSIS",
      notes: noteText,
    },
  });
}
