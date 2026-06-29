/**
 * Gestão das API-keys de parceiro (ADR 0057, Fase 1) — SUPERADMIN, por tenant.
 * Emite (mostra o segredo 1x), lista (sem segredo) e revoga. A validação real das
 * keys acontece na borda REST (`withPartnerAuth`), não aqui.
 */
import { z } from "zod";
import { createTRPCRouter, superAdminTenantProcedure } from "@/server/api/trpc";
import { ALL_PARTNER_SCOPES } from "@/lib/partner-api/scopes";
import {
  issuePartnerApiKey,
  listPartnerApiKeys,
  revokePartnerApiKey,
} from "@/server/services/partner-api-key.service";

export const partnerApiKeyRouter = createTRPCRouter({
  /** Lista as keys do tenant ativo (sem segredo/hash). */
  list: superAdminTenantProcedure.query(async ({ ctx }) => {
    return listPartnerApiKeys(ctx.tenantId);
  }),

  /** Emite uma key nova. Retorna o segredo COMPLETO uma única vez. */
  issue: superAdminTenantProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(80),
        scopes: z.array(z.enum(ALL_PARTNER_SCOPES as [string, ...string[]])).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const issued = await issuePartnerApiKey({
        tenantId: ctx.tenantId,
        name: input.name,
        scopes: input.scopes,
        createdById: ctx.session.user.id,
      });
      return issued; // { id, keyPrefix, plaintextKey }
    }),

  /** Revoga (soft) uma key do tenant ativo. */
  revoke: superAdminTenantProcedure
    .input(z.object({ keyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await revokePartnerApiKey({ tenantId: ctx.tenantId, keyId: input.keyId });
      return { success: true };
    }),
});
