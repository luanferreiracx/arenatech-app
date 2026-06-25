import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { isTenantAdmin } from "@/lib/auth/roles";
import {
  createValuationSchema,
  updateValuationSchema,
  listValuationsSchema,
  bulkAdjustSchema,
  bulkAdjustFixedSchema,
  duplicateModelSchema,
  deleteModelSchema,
  sendValuationWhatsAppSchema,
  STORAGE_OPTIONS,
  BATTERY_HEALTH_OPTIONS,
} from "@/lib/validators/valuation";
import { logger } from "@/lib/logger";
import { logAudit } from "@/server/services/audit-log.service";
import { compareValuations } from "@/lib/valuation-ordering";
import { sendTextWithFallback } from "@/lib/whatsapp/send-with-fallback";

function decimalToCents(v: Prisma.Decimal | null | undefined): number {
  if (v == null) return 0;
  return Math.round(Number(v) * 100);
}

function centsToPrisma(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(cents / 100);
}

/**
 * RBAC: avaliacao = tabela de precos de compra (sensivel). Restrito a admin do
 * tenant (ou superadmin) — operador nao gerencia avaliacoes.
 */
function assertCanManageValuations(ctx: {
  session: { user: { isSuperAdmin?: boolean }; availableTenants: Array<{ id: string; role: string }> };
  tenantId: string;
}): void {
  if (!isTenantAdmin(ctx.session, ctx.tenantId)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Apenas administradores do tenant podem gerenciar avaliacoes.",
    });
  }
}

export const valuationRouter = createTRPCRouter({
  /** List valuations with optional filters */
  list: tenantProcedure
    .input(listValuationsSchema)
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 0;
      const pageSize = input.pageSize ?? 50;

      return ctx.withTenant(async (tx) => {
        const where: Prisma.DeviceValuationWhereInput = {
          deletedAt: null,
        };
        if (input.modelo) where.modelo = input.modelo;
        if (input.armazenamento) where.armazenamento = input.armazenamento;

        // Ordenacao numerica/semantica (storage + bateria) nao e expressavel no
        // orderBy do Prisma — fazemos em memoria. A tabela de precos por tenant
        // e pequena, entao buscar tudo e paginar em memoria e seguro e garante
        // a ordem correta na paginacao (paridade Laravel orderByRaw).
        const all = await tx.deviceValuation.findMany({ where });
        all.sort(compareValuations);
        const total = all.length;
        // `input.all` (matriz da tela de Avaliacoes) devolve a tabela inteira; sem
        // ele, pagina. O default antigo cortava em 100 e escondia modelos.
        const pageItems = input.all
          ? all
          : all.slice(page * pageSize, page * pageSize + pageSize);

        return {
          data: pageItems.map((v) => ({
            ...v,
            valor: decimalToCents(v.valor),
          })),
          total,
          pageCount: input.all ? 1 : Math.ceil(total / pageSize),
        };
      });
    }),

  /** Get distinct models for filter */
  listModels: tenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const result = await tx.deviceValuation.findMany({
        where: { deletedAt: null },
        select: { modelo: true },
        distinct: ["modelo"],
        orderBy: { modelo: "asc" },
      });
      return result.map((r) => r.modelo);
    });
  }),

  /** Create a valuation entry */
  create: tenantProcedure
    .input(createValuationSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageValuations(ctx);
      return ctx.withTenant(async (tx) => {
        // Le validade default do tenant (TenantAssistanceSettings.valuationValidityDays)
        // ou usa 7 dias como fallback global.
        let defaultValidityDays = 7;
        if (input.validadeDias == null) {
          const settings = await tx.tenantAssistanceSettings.findUnique({
            where: { tenantId: ctx.tenantId },
            select: { valuationValidityDays: true },
          });
          defaultValidityDays = settings?.valuationValidityDays ?? 7;
        }
        const valuation = await tx.deviceValuation.create({
          data: {
            tenantId: ctx.tenantId,
            modelo: input.modelo,
            armazenamento: input.armazenamento,
            saudeBateria: input.saudeBateria,
            valor: centsToPrisma(input.valor),
            validadeDias: input.validadeDias ?? defaultValidityDays,
          },
        });
        return { id: valuation.id };
      });
    }),

  /** Update a valuation entry */
  update: tenantProcedure
    .input(updateValuationSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageValuations(ctx);
      return ctx.withTenant(async (tx) => {
        const existing = await tx.deviceValuation.findUnique({ where: { id: input.id } });
        if (!existing || existing.deletedAt) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Avaliacao nao encontrada" });
        }

        await tx.deviceValuation.update({
          where: { id: input.id },
          data: {
            modelo: input.modelo,
            armazenamento: input.armazenamento,
            saudeBateria: input.saudeBateria,
            valor: centsToPrisma(input.valor),
            validadeDias: input.validadeDias,
          },
        });
        return { success: true };
      });
    }),

  /** Delete a valuation entry (soft) */
  delete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      assertCanManageValuations(ctx);
      return ctx.withTenant(async (tx) => {
        await tx.deviceValuation.update({
          where: { id: input.id },
          data: { deletedAt: new Date() },
        });
        return { success: true };
      });
    }),

  /** Bulk adjust prices for a model by percentage */
  bulkAdjust: tenantProcedure
    .input(bulkAdjustSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageValuations(ctx);
      return ctx.withTenant(async (tx) => {
        // gap Va1: ANTES era loop com N updates (50+ avaliacoes -> 50+
        // roundtrips dentro da mesma tx). Agora UM UPDATE atomico via
        // $executeRaw — round() no SQL preserva 2 casas decimais.
        const factor = 1 + input.adjustPercent / 100;

        const updated = await tx.$executeRaw`
          UPDATE device_valuations
          SET valor = ROUND(valor * ${factor}::numeric, 2),
              updated_at = NOW()
          WHERE modelo = ${input.modelo}
            AND deleted_at IS NULL
        `;

        if (updated === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma avaliacao encontrada para este modelo" });
        }

        logger.info("Bulk adjust valuations", {
          modelo: input.modelo,
          adjustPercent: input.adjustPercent,
          updated,
        });

        await logAudit(tx as never, {
          tenantId: ctx.tenantId,
          userId: ctx.session.user.id,
          action: "bulk_adjust_percent",
          entity: "device_valuation",
          payload: { modelo: input.modelo, adjustPercent: input.adjustPercent, updated },
        });

        return { updated };
      });
    }),

  /** Duplicate all entries from one model to another */
  duplicateModel: tenantProcedure
    .input(duplicateModelSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageValuations(ctx);
      return ctx.withTenant(async (tx) => {
        const sourceEntries = await tx.deviceValuation.findMany({
          where: { modelo: input.sourceModelo, deletedAt: null },
        });

        if (sourceEntries.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Modelo de origem nao encontrado" });
        }

        let created = 0;
        for (const entry of sourceEntries) {
          await tx.deviceValuation.create({
            data: {
              tenantId: ctx.tenantId,
              modelo: input.targetModelo,
              armazenamento: entry.armazenamento,
              saudeBateria: entry.saudeBateria,
              valor: entry.valor,
              validadeDias: entry.validadeDias,
            },
          });
          created++;
        }

        logger.info("Duplicate model valuations", {
          source: input.sourceModelo,
          target: input.targetModelo,
          created,
        });

        await logAudit(tx as never, {
          tenantId: ctx.tenantId,
          userId: ctx.session.user.id,
          action: "duplicate_model",
          entity: "device_valuation",
          payload: { sourceModelo: input.sourceModelo, targetModelo: input.targetModelo, created },
        });

        return { created };
      });
    }),

  /** Bulk adjust prices by fixed R$ amount (like Laravel) */
  bulkAdjustFixed: tenantProcedure
    .input(bulkAdjustFixedSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageValuations(ctx);
      return ctx.withTenant(async (tx) => {
        // gap Va1 (espelho): UM UPDATE atomico. GREATEST(valor + delta, 0)
        // garante o piso em zero igual ao Math.max original.
        const adjustReais = input.adjustAmount / 100;

        const updated = await tx.$executeRaw`
          UPDATE device_valuations
          SET valor = GREATEST(valor + ${adjustReais}::numeric, 0),
              updated_at = NOW()
          WHERE modelo = ${input.modelo}
            AND deleted_at IS NULL
        `;

        if (updated === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma avaliacao encontrada para este modelo" });
        }

        logger.info("Bulk adjust fixed valuations", {
          modelo: input.modelo,
          adjustAmount: input.adjustAmount,
          updated,
        });

        await logAudit(tx as never, {
          tenantId: ctx.tenantId,
          userId: ctx.session.user.id,
          action: "bulk_adjust_fixed",
          entity: "device_valuation",
          payload: { modelo: input.modelo, adjustAmount: input.adjustAmount, updated },
        });

        return { updated };
      });
    }),

  /** Delete all valuations for a model */
  deleteModel: tenantProcedure
    .input(deleteModelSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageValuations(ctx);
      return ctx.withTenant(async (tx) => {
        const result = await tx.deviceValuation.updateMany({
          where: { modelo: input.modelo, deletedAt: null },
          data: { deletedAt: new Date() },
        });

        logger.info("Delete model valuations", {
          modelo: input.modelo,
          deleted: result.count,
        });

        await logAudit(tx as never, {
          tenantId: ctx.tenantId,
          userId: ctx.session.user.id,
          action: "delete_model",
          entity: "device_valuation",
          payload: { modelo: input.modelo, deleted: result.count },
        });

        return { deleted: result.count };
      });
    }),

  /** Get distinct storage options for a model */
  listStorageOptions: tenantProcedure.query(async () => {
    return STORAGE_OPTIONS;
  }),

  /** Get distinct battery health options */
  listBatteryOptions: tenantProcedure.query(async () => {
    return BATTERY_HEALTH_OPTIONS;
  }),

  /**
   * Envia a tabela de avaliacao de um modelo por WhatsApp (Cloud API).
   * Stateless: monta a mensagem-texto e usa o fallback inteligente — texto
   * dentro da janela 24h, template `avaliacao_orcamento` fora dela.
   * Paridade Laravel AvaliacaoController::enviarWhatsApp (modo tabela).
   */
  sendWhatsApp: tenantProcedure
    .input(sendValuationWhatsAppSchema)
    .mutation(async ({ ctx, input }) => {
      const built = await ctx.withTenant(async (tx) => {
        const valuations = await tx.deviceValuation.findMany({
          where: { modelo: input.modelo, deletedAt: null },
        });
        valuations.sort(compareValuations);

        if (valuations.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Nenhuma avaliacao encontrada para este modelo",
          });
        }

        // Nome da loja + validade vem das settings de assistencia (nao hardcode).
        const settings = await tx.tenantAssistanceSettings.findUnique({
          where: { tenantId: ctx.tenantId },
          select: { valuationValidityDays: true, assistanceName: true },
        });
        let storeName = settings?.assistanceName ?? null;
        if (!storeName) {
          const t = await tx.tenant.findUnique({
            where: { id: ctx.tenantId },
            select: { name: true },
          });
          storeName = t?.name ?? "Arena Tech";
        }
        const validadeDias =
          settings?.valuationValidityDays ?? valuations[0]?.validadeDias ?? 7;
        const nome = input.customerName?.trim() || "Cliente";

        // Agrupa por armazenamento (ja ordenado).
        const grouped = new Map<string, Array<{ saudeBateria: string; valor: Prisma.Decimal }>>();
        for (const v of valuations) {
          if (!grouped.has(v.armazenamento)) grouped.set(v.armazenamento, []);
          grouped.get(v.armazenamento)!.push({ saudeBateria: v.saudeBateria, valor: v.valor });
        }

        let message = `*Avaliacao de Aparelho - ${storeName}*\n\n`;
        message += `Ola, ${nome}!\n\n`;
        message += `Segue a tabela de avaliacao para *${input.modelo}*:\n\n`;
        for (const [armazenamento, items] of grouped.entries()) {
          message += `*${armazenamento}:*\n`;
          for (const item of items) {
            const valor = Number(item.valor).toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            });
            message += `  - Bateria ${item.saudeBateria}: *${valor}*\n`;
          }
          message += `\n`;
        }
        message += `Validade: ${validadeDias} dias\n`;
        message += `Valores sujeitos a analise do aparelho.\n\n`;
        message += `*${storeName}*`;

        return { message, nome };
      });

      const sendResult = await sendTextWithFallback({
        phone: input.phone,
        freeText: built.message,
        contexto: "avaliacao_orcamento",
        // template avaliacao_orcamento: {{1}}=nome, {{2}}=descricao do aparelho
        params: [built.nome, `do seu ${input.modelo}`],
        log: { tenantId: ctx.tenantId, originType: "avaliacao" },
      });

      if (!sendResult.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Falha ao enviar WhatsApp: ${sendResult.error ?? "erro desconhecido"}`,
        });
      }

      logger.info("Valuation WhatsApp sent", {
        tenantId: ctx.tenantId,
        modelo: input.modelo,
        via: sendResult.via,
      });

      return { success: true, via: sendResult.via, messageId: sendResult.messageId };
    }),
});
