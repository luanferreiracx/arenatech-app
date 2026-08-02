/**
 * Que status de tenant ainda rendem uma sessão (ADR 0061 — bloqueio suave).
 *
 * Mora fora de `auth.ts` de propósito: aquele arquivo importa o NextAuth e não
 * sobe num teste. A regra que decide se o cliente entra ou é expulso precisa de
 * guardião, então vive num módulo puro que auth.ts, o proxy e os testes
 * compartilham.
 */

export const ACTIVE_TENANT_STATUS = "ACTIVE" as const;
export const SUSPENDED_TENANT_STATUS = "SUSPENDED" as const;

/**
 * Status que mantêm o tenant na sessão do usuário.
 *
 * `SUSPENDED` entrou aqui porque a alternativa era pior: o tenant que atrasava a
 * assinatura sumia de `availableTenants`, o proxy o mandava para `/no-access`
 * ("sua conta ainda não está vinculada a nenhuma loja") e a tela de pagar, sendo
 * rota de tenant, ficava inalcançável. O cliente ficava trancado do lado de
 * fora, lendo uma mensagem sobre outro problema, sem caminho de volta.
 *
 * `PENDING` e `CANCELLED` continuam de fora: pendente ainda não entrou e
 * cancelado é saída, não atraso.
 */
export const SESSION_TENANT_STATUSES = [ACTIVE_TENANT_STATUS, SUSPENDED_TENANT_STATUS];

/** O tenant neste status ainda rende sessão? */
export function keepsSession(status: string): boolean {
  return SESSION_TENANT_STATUSES.some((allowed) => allowed === status);
}

/** O tenant neste status está bloqueado por inadimplência (piso só)? */
export function isBlockedStatus(status: string): boolean {
  return status === SUSPENDED_TENANT_STATUS;
}
