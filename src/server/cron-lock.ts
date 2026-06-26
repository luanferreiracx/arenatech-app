/**
 * Lock cooperativo por JOB para os crons cross-tenant (P1-4 da auditoria
 * 2026-06-26). A prova de pool de conexoes (ao contrario de advisory lock de
 * sessao, que pode soltar em outra conexao do pool). Usa a tabela `cron_locks`
 * com um lease (`expiresAt`): se a instancia que segura o lock cai sem liberar,
 * outra instancia o retoma apos o lease expirar.
 *
 * Uso:
 *   const ran = await withCronLock("process-deposit-repayments", async () => {
 *     // ... corpo do cron (pode abrir suas proprias transacoes) ...
 *   });
 *   if (!ran) return NextResponse.json({ skipped: "locked" });
 */
import { randomUUID } from "node:crypto";
import { withAdmin } from "@/server/db";
import { logger } from "@/lib/logger";

/** Lease padrao do lock. Deve ser > duracao tipica do job e < intervalo do cron. */
const DEFAULT_LEASE_MS = 15 * 60_000;

/**
 * Tenta adquirir o lock do job. Retorna `null` se outra instancia ja o segura
 * (lock vivo). Caso contrario retorna um `lockToken` para liberar depois.
 *
 * Aquisicao em UM unico statement atomico (`INSERT ... ON CONFLICT DO UPDATE`
 * com guarda de lease no `WHERE`): insere se nunca existiu, OU retoma se o lease
 * expirou. O `RETURNING` so devolve linha pra quem venceu — uma unica instancia
 * ganha a corrida. (Evitamos catch de P2002 dentro de transacao, que abortaria
 * a transacao no Postgres e quebraria um segundo statement.)
 */
async function acquireCronLock(jobName: string, leaseMs: number): Promise<string | null> {
  const lockToken = randomUUID();
  const leaseSeconds = Math.ceil(leaseMs / 1000);

  return withAdmin(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ job_name: string }>>`
      INSERT INTO cron_locks (job_name, locked_by, locked_at, expires_at)
      VALUES (${jobName}, ${lockToken}, now(), now() + make_interval(secs => ${leaseSeconds}))
      ON CONFLICT (job_name) DO UPDATE
        SET locked_by = EXCLUDED.locked_by,
            locked_at = EXCLUDED.locked_at,
            expires_at = EXCLUDED.expires_at
        WHERE cron_locks.expires_at < now()
      RETURNING job_name
    `;
    return rows.length === 1 ? lockToken : null;
  });
}

/** Libera o lock — so se ainda formos o dono (evita liberar lock de outra instancia). */
async function releaseCronLock(jobName: string, lockToken: string): Promise<void> {
  await withAdmin(async (tx) =>
    tx.cronLock.updateMany({
      where: { jobName, lockedBy: lockToken },
      // Expira imediatamente em vez de deletar: mantem 1 linha por job (historico
      // de quem rodou por ultimo) e simplifica a corrida de aquisicao.
      data: { expiresAt: new Date(0) },
    }),
  );
}

/**
 * Roda `fn` sob o lock do job. Retorna `true` se rodou (tinha o lock) ou `false`
 * se outra instancia ja estava rodando (pulou). O lock e sempre liberado no fim,
 * mesmo se `fn` lancar.
 */
export async function withCronLock(
  jobName: string,
  fn: () => Promise<void>,
  opts?: { leaseMs?: number },
): Promise<boolean> {
  const token = await acquireCronLock(jobName, opts?.leaseMs ?? DEFAULT_LEASE_MS);
  if (!token) {
    logger.warn("[cron-lock] job ja em execucao por outra instancia — pulando", { jobName });
    return false;
  }
  try {
    await fn();
    return true;
  } finally {
    await releaseCronLock(jobName, token).catch((err) =>
      logger.error("[cron-lock] falha ao liberar lock (lease cuida do residual)", {
        jobName,
        err: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
