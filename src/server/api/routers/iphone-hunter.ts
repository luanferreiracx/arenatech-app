import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, centralTenantProcedure } from "@/server/api/trpc";
import { logger } from "@/lib/logger";

const searchSchema = z.object({
  model: z.string().min(2).max(64).optional(),
  hoursBack: z.number().int().min(1).max(168).default(48),
  requiresPrice: z.boolean().default(false),
  minPriceCents: z.number().int().nonnegative().optional(),
  maxPriceCents: z.number().int().nonnegative().optional(),
});

const upsertGroupSchema = z.object({
  evolutionGroupJid: z.string().min(5).max(128).endsWith("@g.us"),
  name: z.string().min(1).max(128),
  monitored: z.boolean().default(true),
});

const toggleGroupSchema = z.object({
  id: z.string().uuid(),
  monitored: z.boolean(),
});

/**
 * Lista grupos disponíveis da instância Evolution.
 * Endpoint: GET /group/fetchAllGroups/{instance}
 */
async function fetchEvolutionGroups(): Promise<Array<{ jid: string; name: string }>> {
  const url = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instanceName = process.env.EVOLUTION_INSTANCE_NAME ?? "arena-intranet";
  if (!url || !apiKey) return [];

  try {
    const response = await fetch(
      `${url.replace(/\/$/, "")}/group/fetchAllGroups/${instanceName}?getParticipants=false`,
      {
        method: "GET",
        headers: { apikey: apiKey },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      logger.warn("iphone-hunter: fetchAllGroups failed", { status: response.status });
      return [];
    }
    const data = (await response.json()) as Array<{ id?: string; subject?: string }>;
    return data
      .filter((g): g is { id: string; subject: string } =>
        Boolean(g.id && g.subject && g.id.endsWith("@g.us")),
      )
      .map((g) => ({ jid: g.id, name: g.subject }));
  } catch (error) {
    logger.error("iphone-hunter: fetchAllGroups error", { error: String(error) });
    return [];
  }
}

export const iphoneHunterRouter = createTRPCRouter({
  listGroups: centralTenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const persisted = await tx.whatsAppGroup.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          evolutionGroupJid: true,
          name: true,
          monitored: true,
          lastSyncAt: true,
        },
      });
      return persisted;
    });
  }),

  /**
   * Lista grupos da instância Evolution (vivos) e marca quais já estão cadastrados.
   * Usado pela tela de gerenciamento para o admin escolher quais monitorar.
   */
  listEvolutionGroups: centralTenantProcedure.query(async ({ ctx }) => {
    const evolutionGroups = await fetchEvolutionGroups();
    return ctx.withTenant(async (tx) => {
      const persisted = await tx.whatsAppGroup.findMany({
        select: { id: true, evolutionGroupJid: true, monitored: true },
      });
      const persistedByJid = new Map(persisted.map((g) => [g.evolutionGroupJid, g]));
      return evolutionGroups.map((g) => ({
        jid: g.jid,
        name: g.name,
        persistedId: persistedByJid.get(g.jid)?.id ?? null,
        monitored: persistedByJid.get(g.jid)?.monitored ?? false,
      }));
    });
  }),

  upsertGroup: centralTenantProcedure
    .input(upsertGroupSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const existing = await tx.whatsAppGroup.findFirst({
          where: { evolutionGroupJid: input.evolutionGroupJid },
          select: { id: true },
        });
        if (existing) {
          return tx.whatsAppGroup.update({
            where: { id: existing.id },
            data: { name: input.name, monitored: input.monitored },
          });
        }
        return tx.whatsAppGroup.create({
          data: {
            tenantId: ctx.tenantId,
            evolutionGroupJid: input.evolutionGroupJid,
            name: input.name,
            monitored: input.monitored,
          },
        });
      });
    }),

  toggleGroup: centralTenantProcedure
    .input(toggleGroupSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.withTenant(async (tx) => {
        const group = await tx.whatsAppGroup.findUnique({ where: { id: input.id } });
        if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Grupo não encontrado" });
        return tx.whatsAppGroup.update({
          where: { id: input.id },
          data: { monitored: input.monitored },
        });
      });
    }),

  search: centralTenantProcedure.input(searchSchema).query(async ({ ctx, input }) => {
    return ctx.withTenant(async (tx) => {
      const since = new Date(Date.now() - input.hoursBack * 3600 * 1000);
      const listings = await tx.iPhoneListing.findMany({
        where: {
          postedAt: { gte: since },
          ...(input.model && {
            model: { contains: input.model, mode: "insensitive" },
          }),
          ...(input.requiresPrice && { priceCents: { not: null } }),
          ...(input.minPriceCents !== undefined && {
            priceCents: { gte: input.minPriceCents },
          }),
          ...(input.maxPriceCents !== undefined && {
            priceCents: { lte: input.maxPriceCents },
          }),
        },
        orderBy: { postedAt: "desc" },
        take: 200,
        include: {
          message: {
            select: {
              senderJid: true,
              senderName: true,
              group: { select: { name: true, evolutionGroupJid: true } },
            },
          },
        },
      });

      return listings.map((l) => ({
        id: l.id,
        model: l.model,
        storageGb: l.storageGb,
        color: l.color,
        priceCents: l.priceCents,
        condition: l.condition,
        rawSnippet: l.rawSnippet,
        postedAt: l.postedAt,
        senderJid: l.message.senderJid,
        senderName: l.message.senderName,
        groupName: l.message.group.name,
        whatsappLink: senderToWaLink(l.message.senderJid),
      }));
    });
  }),

  /**
   * Estatísticas leves para o header da página (counts das últimas 48h).
   */
  stats: centralTenantProcedure.query(async ({ ctx }) => {
    return ctx.withTenant(async (tx) => {
      const since = new Date(Date.now() - 48 * 3600 * 1000);
      const [total, withPrice, monitoredGroups] = await Promise.all([
        tx.iPhoneListing.count({ where: { postedAt: { gte: since } } }),
        tx.iPhoneListing.count({
          where: { postedAt: { gte: since }, priceCents: { not: null } },
        }),
        tx.whatsAppGroup.count({ where: { monitored: true } }),
      ]);
      return { total, withPrice, monitoredGroups };
    });
  }),
});

/**
 * Converte JID de remetente em link wa.me. Para participantes de grupo
 * o JID vem como `<numero>@s.whatsapp.net` ou `<numero>@lid` (anônimo).
 * Retorna null se não conseguir extrair número discável.
 */
function senderToWaLink(jid: string): string | null {
  const number = jid.split("@")[0];
  if (!number || !/^\d{8,15}$/.test(number)) return null;
  return `https://wa.me/${number}`;
}
