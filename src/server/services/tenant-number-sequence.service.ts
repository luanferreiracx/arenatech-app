import type { Prisma } from "@prisma/client";

/**
 * Aloca o proximo numero da sequencia (tenantId, scope, year) de forma
 * atomica. Usa `INSERT ... ON CONFLICT UPDATE ... RETURNING` numa unica
 * round-trip — proteção contra race condition entre duas vendas/OS
 * simultaneas que tentariam gravar o mesmo numero (P2002 antes).
 *
 * Inicializa em 1 se nao existe ou se mudou de ano. Continua a partir
 * do `lastSeed` (opcional) — util para sincronizar com dados ja migrados
 * do Laravel na primeira execucao por (tenant, scope, year).
 */
export async function nextTenantNumber(
  tx: Prisma.TransactionClient,
  tenantId: string,
  scope: string,
  year: number,
  opts: { padding?: number; prefix?: string; lastSeed?: number } = {},
): Promise<{ value: number; formatted: string }> {
  const padding = opts.padding ?? 5;
  const prefix = opts.prefix ?? "";
  const seed = opts.lastSeed ?? 0;

  // Upsert atomico — postgres garante serialization mesmo sob concurrency.
  const rows = await tx.$queryRaw<Array<{ value: number }>>`
    INSERT INTO tenant_number_sequences (tenant_id, scope, year, value, updated_at)
    VALUES (${tenantId}::uuid, ${scope}, ${year}, ${seed + 1}, NOW())
    ON CONFLICT (tenant_id, scope, year)
    DO UPDATE SET value = tenant_number_sequences.value + 1, updated_at = NOW()
    RETURNING value
  `;
  const value = rows[0]?.value ?? 1;
  return {
    value,
    formatted: `${prefix}${String(value).padStart(padding, "0")}`,
  };
}
