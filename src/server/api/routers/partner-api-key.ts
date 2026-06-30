/**
 * Gestão das API-keys de parceiro (ADR 0057). O PRÓPRIO TENANT (admin OWNER/
 * MANAGER) emite/lista/revoga suas keys — desde que o SUPERADMIN tenha liberado o
 * acesso à API externa pra esse tenant (`Tenant.apiAccessEnabled`). A validação
 * real das keys acontece na borda REST (`withPartnerAuth`), não aqui.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, tenantAdminProcedure } from "@/server/api/trpc";
import { withAdmin } from "@/server/db";
import { assertPublicHttpsUrl } from "@/lib/security/ssrf";
import { ALL_PARTNER_SCOPES } from "@/lib/partner-api/scopes";
import {
  issuePartnerApiKey,
  listPartnerApiKeys,
  revokePartnerApiKey,
} from "@/server/services/partner-api-key.service";
import {
  getPartnerWebhookConfig,
  setPartnerWebhookUrl,
  rotatePartnerWebhookSecret,
} from "@/server/services/partner-webhook.service";

/** Bloqueia se o superadmin não liberou a API externa pra este tenant. */
async function assertApiAccessEnabled(tenantId: string): Promise<void> {
  const tenant = await withAdmin((tx) =>
    tx.tenant.findUnique({ where: { id: tenantId }, select: { apiAccessEnabled: true } }),
  );
  if (!tenant?.apiAccessEnabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Acesso à API externa não habilitado para este tenant. Solicite à Arena Tech.",
    });
  }
}

export const partnerApiKeyRouter = createTRPCRouter({
  /** O tenant tem acesso à API externa liberado? (pra UI decidir o que mostrar) */
  getAccess: tenantAdminProcedure.query(async ({ ctx }) => {
    const tenant = await withAdmin((tx) =>
      tx.tenant.findUnique({ where: { id: ctx.tenantId }, select: { apiAccessEnabled: true } }),
    );
    return { enabled: tenant?.apiAccessEnabled === true };
  }),

  /** Lista as keys do tenant (sem segredo/hash). */
  list: tenantAdminProcedure.query(async ({ ctx }) => {
    await assertApiAccessEnabled(ctx.tenantId);
    return listPartnerApiKeys(ctx.tenantId);
  }),

  /** Emite uma key nova. Retorna o segredo COMPLETO uma única vez. */
  issue: tenantAdminProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(80),
        scopes: z.array(z.enum(ALL_PARTNER_SCOPES as [string, ...string[]])).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertApiAccessEnabled(ctx.tenantId);
      const issued = await issuePartnerApiKey({
        tenantId: ctx.tenantId,
        name: input.name,
        scopes: input.scopes,
        createdById: ctx.session.user.id,
      });
      return issued; // { id, keyPrefix, plaintextKey }
    }),

  /** Revoga (soft) uma key do tenant. */
  revoke: tenantAdminProcedure
    .input(z.object({ keyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Revogar é permitido mesmo se o acesso foi desligado (limpeza).
      await revokePartnerApiKey({ tenantId: ctx.tenantId, keyId: input.keyId });
      return { success: true };
    }),

  // ── Webhook de saída (ADR 0057, Fase 4) ──────────────────────────────────

  /** Config atual do webhook (URL + se há secret + última entrega). */
  getWebhook: tenantAdminProcedure.query(async ({ ctx }) => {
    await assertApiAccessEnabled(ctx.tenantId);
    return getPartnerWebhookConfig(ctx.tenantId);
  }),

  /** Define a URL (HTTPS). Vazio limpa. Gera o secret na primeira vez (exibe 1x). */
  setWebhookUrl: tenantAdminProcedure
    .input(z.object({ url: z.string().trim().url().max(500).nullable() }))
    .mutation(async ({ ctx, input }) => {
      await assertApiAccessEnabled(ctx.tenantId);
      // Anti-SSRF: HTTPS obrigatório + rejeita hosts internos/privados (o servidor
      // faz POST nessa URL; sem o guard, o tenant apontaria pra rede interna).
      if (input.url) {
        try {
          assertPublicHttpsUrl(input.url);
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err instanceof Error ? err.message : "URL de webhook inválida.",
          });
        }
      }
      return setPartnerWebhookUrl({ tenantId: ctx.tenantId, url: input.url });
    }),

  /** Rotaciona o secret (retorna o novo — exibido 1x). */
  rotateWebhookSecret: tenantAdminProcedure.mutation(async ({ ctx }) => {
    await assertApiAccessEnabled(ctx.tenantId);
    return rotatePartnerWebhookSecret(ctx.tenantId);
  }),
});
