import { z } from "zod";
import { createTRPCRouter, tenantProcedure } from "@/server/api/trpc";
import { generatePublicToken } from "@/lib/utils/public-link";
import { getAppBaseUrl } from "@/lib/utils/app-url";
import { generateDepositAddressQr } from "@/lib/services/depix-service";
import { DEPIX_LIMITS } from "@/lib/services/depix-transaction-fee";
import { buildPayUrl } from "@/lib/payment-link/pay-url";
import { logger } from "@/lib/logger";

/**
 * Link de pagamento DePix: UM por tenant, fixo e reutilizável.
 *
 * Não há mais "criar link por cobrança". Cobrar um valor específico é só montar
 * a URL com `?valor=` — nada é gravado por cobrança, e o mesmo endereço serve
 * para sempre. A rastreabilidade vem da transação de cada pagamento, não do link.
 */
export const paymentLinkRouter = createTRPCRouter({
  /**
   * Devolve o link do tenant, criando-o na primeira chamada.
   *
   * Idempotente por construção (`tenantId` é único): chamar de novo devolve o
   * MESMO token. Isso importa porque o link é material divulgado — gerar um novo
   * a cada visita invalidaria QR já impresso.
   */
  get: tenantProcedure.query(async ({ ctx }) => {
    const link = await ctx.withTenant(async (tx) => {
      const existing = await tx.paymentLink.findUnique({
        where: { tenantId: ctx.tenantId },
        select: { id: true, token: true, description: true, active: true },
      });
      if (existing) return existing;

      const created = await tx.paymentLink.create({
        data: {
          tenantId: ctx.tenantId,
          token: generatePublicToken(16),
          createdById: ctx.session.user.id,
        },
        select: { id: true, token: true, description: true, active: true },
      });
      logger.info("PaymentLink do tenant criado", { id: created.id, tenantId: ctx.tenantId });
      return created;
    });

    const url = buildPayUrl(getAppBaseUrl(), link.token);
    return {
      id: link.id,
      token: link.token,
      description: link.description,
      active: link.active,
      url,
      qrCodeDataUrl: await generateDepositAddressQr(url),
    };
  }),

  /**
   * Monta a URL de cobrança com valor já preenchido.
   *
   * Não grava nada: o valor viaja na query string do MESMO link. É o que permite
   * "link com valor" sem reintroduzir um registro por cobrança.
   */
  chargeUrl: tenantProcedure
    .input(
      z.object({
        amountCents: z
          .number()
          .int()
          .min(DEPIX_LIMITS.MIN_CENTS, "Valor mínimo R$ 10,00")
          .max(DEPIX_LIMITS.MAX_CENTS, "Valor máximo R$ 5.000,00"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const link = await ctx.withTenant(async (tx) =>
        tx.paymentLink.findUnique({
          where: { tenantId: ctx.tenantId },
          select: { token: true },
        }),
      );
      if (!link) {
        // Sem link ainda: `get` cria na primeira chamada. Não criamos aqui para
        // manter uma única porta de criação.
        return { url: null as string | null, amountCents: input.amountCents };
      }
      const url = buildPayUrl(getAppBaseUrl(), link.token, input.amountCents);
      return {
        url,
        amountCents: input.amountCents,
        qrCodeDataUrl: await generateDepositAddressQr(url),
      };
    }),

  /**
   * Liga/desliga o recebimento sem trocar o token.
   *
   * Desligar é reversível de propósito: o link é material divulgado, e gerar um
   * token novo invalidaria QR já impresso.
   */
  setActive: tenantProcedure
    .input(z.object({ active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.withTenant(async (tx) =>
        tx.paymentLink.updateMany({
          where: { tenantId: ctx.tenantId },
          data: { active: input.active },
        }),
      );
      return { ok: true, active: input.active };
    }),

  /** Texto exibido ao cliente na tela de pagamento. */
  setDescription: tenantProcedure
    .input(z.object({ description: z.string().trim().max(200).nullable() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.withTenant(async (tx) =>
        tx.paymentLink.updateMany({
          where: { tenantId: ctx.tenantId },
          data: { description: input.description?.trim() || null },
        }),
      );
      return { ok: true };
    }),
});
