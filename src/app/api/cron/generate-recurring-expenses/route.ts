import { NextRequest, NextResponse } from "next/server";
import { withCronLock } from "@/server/cron-lock";
import { logger } from "@/lib/logger";
import { timingSafeEqualString } from "@/lib/utils/timing-safe";
import { generateDueRecurringExpenses } from "@/server/services/recurring-expense.service";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/generate-recurring-expenses
 *
 * Gera as contas do mês a partir dos templates recorrentes (aluguel, salário,
 * internet...). Idempotente (CAS em last_generated_period) — pode rodar todo dia
 * sem duplicar. Cross-tenant (o service usa withAdmin). Cron diário sugerido:
 * 05:00 BRT (depois do mark-overdue).
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    logger.error("[cron-generate-recurring] CRON_SECRET not configured");
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }
  if (!timingSafeEqualString(authHeader ?? "", `Bearer ${expectedSecret}`)) {
    logger.warn("[cron-generate-recurring] Unauthorized cron attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const captured: { generated: number } = { generated: 0 };
    const ran = await withCronLock("generate-recurring-expenses", async () => {
      const result = await generateDueRecurringExpenses(new Date());
      captured.generated = result.generated;
    });

    if (!ran) {
      return NextResponse.json({ skipped: "locked" });
    }
    logger.info("[cron-generate-recurring] done", { generated: captured.generated });
    return NextResponse.json({ generated: captured.generated });
  } catch (error) {
    logger.error("[cron-generate-recurring] failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
