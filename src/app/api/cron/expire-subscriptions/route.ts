import { NextRequest, NextResponse } from "next/server";
import { withAdmin } from "@/server/db";
import { withCronLock } from "@/server/cron-lock";
import { logger } from "@/lib/logger";
import { timingSafeEqualString } from "@/lib/utils/timing-safe";
import { DEFAULT_GRACE_DAYS } from "@/lib/billing/subscription";
import { runSubscriptionExpiry, type SubscriptionExpiryResult } from "@/server/services/subscription-expiry.service";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/expire-subscriptions
 *
 * Vencimento da assinatura (billing manual — Fase 2). Duas transições, nesta ordem:
 *   1. ACTIVE com `currentPeriodEnd < now` → PAST_DUE (sinal de vencido; MANTÉM
 *      o acesso durante a carência).
 *   2. PAST_DUE cujo vencimento passou há mais de `SUBSCRIPTION_GRACE_DAYS` →
 *      SUSPENDED, e o Tenant vai a SUSPENDED (corta o login em auth.ts).
 *
 * Sem este cron, `currentPeriodEnd` vencia e nada acontecia — o tenant seguia
 * ACTIVE pra sempre (gap da auditoria de tenants/planos). Carência configurável
 * por `SUBSCRIPTION_GRACE_DAYS` (padrão 5 dias).
 *
 * Global cross-tenant: withAdmin (BYPASSRLS) cobre todos os tenants numa chamada.
 * Cron diário sugerido: 04:00 BRT.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    logger.error("[cron-expire-subscriptions] CRON_SECRET not configured");
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }
  if (!timingSafeEqualString(authHeader ?? "", `Bearer ${expectedSecret}`)) {
    logger.warn("[cron-expire-subscriptions] Unauthorized cron attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const graceDays = parseGraceDays(process.env.SUBSCRIPTION_GRACE_DAYS);

  try {
    // withCronLock devolve boolean (rodou vs travado por outra instância). O
    // resultado do job sai por um contêiner mutável lido após o lock.
    const captured: { result: SubscriptionExpiryResult | null } = { result: null };
    const ran = await withCronLock("expire-subscriptions", async () => {
      captured.result = await withAdmin((tx) =>
        runSubscriptionExpiry(tx, { now: new Date(), graceDays }),
      );
    });

    const result = captured.result;
    if (!ran || !result) {
      return NextResponse.json({ skipped: "locked" });
    }

    logger.info("[cron-expire-subscriptions] done", {
      markedPastDue: result.markedPastDue,
      suspended: result.suspended,
      graceDays,
    });
    return NextResponse.json({
      success: true,
      markedPastDue: result.markedPastDue,
      suspended: result.suspended,
    });
  } catch (error) {
    logger.error("[cron-expire-subscriptions] failed", { error });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** Carência em dias (env), com piso 0 e fallback pro padrão em valor inválido. */
function parseGraceDays(raw: string | undefined): number {
  if (!raw) return DEFAULT_GRACE_DAYS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_GRACE_DAYS;
}
