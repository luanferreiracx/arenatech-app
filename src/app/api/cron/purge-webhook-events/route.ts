import { NextRequest, NextResponse } from "next/server"
import { withAdmin } from "@/server/db"
import { logger } from "@/lib/logger"
import { timingSafeEqualString } from "@/lib/utils/timing-safe"
import { withCronLock } from "@/server/cron-lock"

export const dynamic = "force-dynamic"

/**
 * POST /api/cron/purge-webhook-events
 *
 * Purga eventos de webhook antigos. Cron diário (sugerido: 04:00 UTC).
 *
 * Auditoria 2026-07-25: `webhook_events` guarda o payload JSON COMPLETO de todo
 * webhook recebido, indefinidamente, numa tabela de escrita quente. Medido em
 * produção em 2026-07-27: 21.517 linhas / 43 MB em 2 meses — crescimento
 * monotônico, sem nenhuma purga.
 *
 * A tabela existe para IDEMPOTÊNCIA (o unique `(provider, eventId)` barra a
 * reentrega). A janela precisa, então, ser bem maior que o retry de qualquer
 * provedor — que na prática é de horas, no máximo poucos dias. 90 dias dá uma
 * ordem de grandeza de folga: um evento re-entregue depois disso não seria
 * barrado pelo guard, mas nenhum provedor real reenvia com 3 meses de atraso.
 */
const RETENTION_DAYS = 90

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const expectedSecret = process.env.CRON_SECRET

  if (!expectedSecret) {
    logger.error("[cron-purge-webhooks] CRON_SECRET not configured")
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 })
  }

  if (!timingSafeEqualString(authHeader ?? "", `Bearer ${expectedSecret}`)) {
    logger.warn("[cron-purge-webhooks] Unauthorized cron attempt")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
    let deleted = 0
    let deletedDepix = 0

    // Lock pelo mesmo motivo dos demais crons: duas execuções sobrepostas
    // apenas duplicariam trabalho, mas o lock mantém o padrão e o log honesto.
    const ran = await withCronLock("purge-webhook-events", async () => {
      // Cross-tenant (a tabela é global) → withAdmin.
      deleted = await withAdmin(async (tx) => {
        // Apaga em LOTES: um DELETE único de centenas de milhares de linhas
        // seguraria lock longo numa tabela que recebe escrita o tempo todo.
        let total = 0
        for (;;) {
          const batch = await tx.$executeRaw`
            DELETE FROM webhook_events
            WHERE id IN (
              SELECT id FROM webhook_events
              WHERE created_at < ${cutoff}
              LIMIT 5000
            )
          `
          total += batch
          if (batch < 5000) break
        }
        return total
      })

      // `depix_webhook_events` e a tabela IRMA: guarda o payload completo dos
      // webhooks da Eulen (chave PIX, CPF do pagador, valores) e ficou de fora da
      // purga original — 730 linhas desde 2026-05-23 em producao, nenhuma apagada.
      // Cresce devagar (nao e risco de disco), mas e retencao de dado pessoal sem
      // prazo, que e o motivo pelo qual a purga existe.
      deletedDepix = await withAdmin(async (tx) => {
        let total = 0
        for (;;) {
          const batch = await tx.$executeRaw`
            DELETE FROM depix_webhook_events
            WHERE id IN (
              SELECT id FROM depix_webhook_events
              WHERE created_at < ${cutoff}
              LIMIT 5000
            )
          `
          total += batch
          if (batch < 5000) break
        }
        return total
      })
    })

    if (!ran) {
      logger.info("[cron-purge-webhooks] Skipped (outro processo segurando o lock)")
      return NextResponse.json({ skipped: true })
    }

    logger.info("[cron-purge-webhooks] Concluído", { deleted, deletedDepix, retentionDays: RETENTION_DAYS })
    return NextResponse.json({ deleted, deletedDepix, retentionDays: RETENTION_DAYS })
  } catch (error) {
    logger.error("[cron-purge-webhooks] Falhou", {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
