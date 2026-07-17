/**
 * Teto do fail-open do refresh do JWT (decisão 2, auditoria 2026-07-14).
 *
 * O refresh do JWT roda em TODA navegação e re-verifica membership/role/plano no
 * banco. Se o banco falha, derrubar a navegação pro error boundary é inaceitável,
 * então o refresh degrada MANTENDO o token atual (fail-open). Mas fail-open sem
 * limite deixa um usuário revogado (tenant suspenso, membership removido, role
 * rebaixado) reter o acesso antigo enquanto o banco estiver com erro.
 *
 * Solução: fail-open COM TETO. Blips transitórios (segundos) passam livres; uma
 * sessão que não consegue se re-verificar há mais que o teto de graça é
 * invalidada (força re-login). Bounda a janela de acesso stale sem deslogar todo
 * mundo num hiccup transitório de banco.
 */
export const JWT_REFRESH_STALE_GRACE_MS = 15 * 60 * 1000; // 15 min

/**
 * True se a sessão está stale além do teto — deve ser invalidada quando o refresh
 * falha. `lastVerifiedAt` = ms epoch do último login/refresh bem-sucedido;
 * `undefined` (token legado sem o campo) conta como stale (fail-safe).
 */
export function isSessionRefreshStale(
  lastVerifiedAt: number | undefined,
  nowMs: number,
  graceMs: number = JWT_REFRESH_STALE_GRACE_MS,
): boolean {
  const last = typeof lastVerifiedAt === "number" ? lastVerifiedAt : 0;
  return nowMs - last > graceMs;
}
