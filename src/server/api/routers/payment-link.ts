import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { generatePublicToken } from "@/lib/utils/public-link";
import { getAppBaseUrl } from "@/lib/utils/app-url";
import { generateDepositAddressQr } from "@/lib/services/depix-service";
import { DEPIX_LIMITS } from "@/lib/services/depix-transaction-fee";
import { logger } from "@/lib/logger";

/** Monta a URL pública + QR (PNG data-url) de um token de link. */
async function buildLinkArtifacts(token: string) {
  const url = `${getAppBaseUrl()}/pay/${token}`;
  const qrCodeDataUrl = await generateDepositAddressQr(url);
  return { token, url, qrCodeDataUrl };
}

export const paymentLinkRouter = createTRPCRouter({
  /**
   * Cria um link de pagamento DePix. `amountCents` ausente = valor livre (o
   * cliente define ao pagar, dentro dos limites). Retorna URL + QR do link.
   */
  create: tenantProcedure
    .input(
      z.object({
        amountCents: z
          .number()
          .int()
          .min(DEPIX_LIMITS.MIN_CENTS, "Valor mínimo R$ 10,00")
          .max(DEPIX_LIMITS.MAX_CENTS, "Valor máximo R$ 5.000,00")
          .nullable()
          .optional(),
        description: z.string().trim().max(200).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const token = generatePublicToken(16);
      const link = await ctx.withTenant(async (tx) =>
        tx.paymentLink.create({
          data: {
            tenantId: ctx.tenantId,
            token,
            amountCents: input.amountCents ?? null,
            description: input.description?.trim() || null,
            createdById: ctx.session.user.id,
          },
          select: { id: true, token: true, amountCents: true, description: true },
        }),
      );
      logger.info("PaymentLink criado", {
        id: link.id,
        amountOpen: link.amountCents == null,
        tenantId: ctx.tenantId,
      });
      return {
        id: link.id,
        amountCents: link.amountCents,
        description: link.description,
        ...(await buildLinkArtifacts(link.token)),
      };
    }),

  /** Lista os links do tenant (mais recentes primeiro). */
  list: tenantProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const links = await ctx.withTenant(async (tx) =>
        tx.paymentLink.findMany({
          where: { tenantId: ctx.tenantId },
          orderBy: { createdAt: "desc" },
          take: input?.limit ?? 50,
          select: {
            id: true,
            token: true,
            amountCents: true,
            description: true,
            status: true,
            paidAt: true,
            createdAt: true,
          },
        }),
      );
      const base = getAppBaseUrl();
      return links.map((l) => ({ ...l, url: `${base}/pay/${l.token}` }));
    }),

  /** Cancela um link ainda ACTIVE (não pago). */
  cancel: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.withTenant(async (tx) =>
        tx.paymentLink.updateMany({
          where: { id: input.id, tenantId: ctx.tenantId, status: "ACTIVE" },
          data: { status: "CANCELLED" },
        }),
      );
      if (updated.count === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Link não encontrado ou já não está ativo.",
        });
      }
      return { ok: true };
    }),
});
