/**
 * Teto de saque diário: override do tenant vs default do ambiente.
 *
 * Mora aqui, isolado, por dois motivos: é lógica pura (dá pra testar sem subir
 * meio mundo — os services de saque arrastam NextAuth/Prisma) e governa quanto
 * dinheiro sai por dia, então merece teste próprio.
 */

/**
 * Resolve o teto efetivo em centavos.
 *
 * `null`/`undefined` = o superadmin não definiu nada para este tenant → default
 * do ambiente.
 *
 * Override `<= 0` também cai no default, de propósito: zerar o campo por engano
 * travaria TODO saque do tenant, e "0" é ambíguo demais para significar "bloqueie
 * tudo". Para bloquear saque existe suspender o tenant — um caminho explícito,
 * auditável e reversível, em vez de um zero perdido num campo de texto.
 */
export function resolveDailyCapCents(
  override: number | null | undefined,
  fallback: number,
): number {
  return override != null && override > 0 ? override : fallback;
}
