import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/server/db";
import { withCronLock } from "@/server/cron-lock";
import { logger } from "@/lib/logger";
import { timingSafeEqualString } from "@/lib/utils/timing-safe";
import { getAppBaseUrl } from "@/lib/utils/app-url";
import {
  listCloudIntegrations,
  runCloudHealthCheck,
  type HealthCheckSummary,
} from "@/server/services/whatsapp-health.service";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/check-whatsapp-credentials
 *
 * Verifica, tenant a tenant, se a credencial da WhatsApp Cloud API ainda vale —
 * e avisa o lojista ANTES de o cliente dele descobrir.
 *
 * Por que existe: credencial de terceiro apodrece sozinha. O token da Meta
 * expira (24h no temporário, 60 dias no de usuário; só o de system user é
 * permanente), pode ser revogado no Business Manager por outra pessoa, e o
 * número pode perder a verificação. Nada disso gera evento nosso. Sem este cron,
 * o primeiro sinal de que o bot de uma loja morreu é um cliente dela reclamando
 * que ninguém respondeu.
 *
 * Avisa UMA vez por problema (ver `whatsapp-health-policy`): repetir todo dia
 * treina o dono a ignorar, e no dia em que quebrar outra coisa ele não lê. Avisa
 * de novo quando o motivo muda, e avisa a recuperação para quem soube da quebra.
 *
 * Global cross-tenant: `withAdmin` (BYPASSRLS) cobre todos os tenants numa
 * chamada. Cadência sugerida: 1×/dia. Mais frequente não ajuda — o token não
 * expira mais rápido que isso — e gasta cota da Graph API à toa.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    logger.error("[cron-check-whatsapp] CRON_SECRET not configured");
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }
  if (!timingSafeEqualString(authHeader ?? "", `Bearer ${expectedSecret}`)) {
    logger.warn("[cron-check-whatsapp] Unauthorized cron attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const captured: { summary: HealthCheckSummary | null } = { summary: null };

    const ran = await withCronLock("check-whatsapp-credentials", async () => {
      const now = new Date();

      // LER dentro de transação; VERIFICAR (rede) fora dela. Uma chamada à Meta
      // por tenant segurando conexão de banco transformaria lentidão do
      // provedor em rollback do lote inteiro.
      const candidates = await withAdmin((tx) => listCloudIntegrations(tx));
      if (candidates.length === 0) {
        captured.summary = { checked: 0, ok: 0, broken: 0, recovered: 0, notified: 0, skipped: 0 };
        return;
      }

      captured.summary = await runCloudHealthCheck({
        candidates,
        now,
        appUrl: getAppBaseUrl(),
        persist: async (integrationId, data) => {
          await withAdmin((tx) =>
            tx.tenantIntegration.update({ where: { id: integrationId }, data }),
          );
        },
        recipients: async (tenantId) =>
          withAdmin(async (tx) => {
            const links = await tx.userTenant.findMany({
              where: { tenantId, role: "admin" },
              select: { user: { select: { email: true } } },
            });
            return links.map((l) => l.user.email).filter((e): e is string => Boolean(e));
          }),
      });
    });

    if (!ran) {
      return NextResponse.json({ skipped: true, reason: "locked" });
    }

    logger.info("[cron-check-whatsapp] processed", { ...captured.summary });
    return NextResponse.json({ success: true, ...captured.summary });
  } catch (error) {
    logger.error("[cron-check-whatsapp] failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
