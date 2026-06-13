/**
 * Fonte única da verdade de papéis/permissões de tenant.
 *
 * Modelo (decisão do dono):
 * - superadmin (flag `isSuperAdmin`): nível máximo do sistema, acesso total +
 *   gestão de tenants + único com acesso ao painel /admin.
 * - admin: nível máximo DENTRO de um tenant — faz tudo no(s) tenant(s) vinculado(s).
 * - operator: usuário normal do tenant.
 *
 * "Técnico" e "caixa" NÃO são níveis de privilégio — são funções marcadas por
 * flags (isTechnician / isCashier) independentes do papel.
 *
 * Papéis legados da migração do Laravel (owner/manager/technician/cashier) são
 * normalizados aqui para não espalhar divergência: owner/manager → admin;
 * technician/cashier → operator. (A migration de dados zera o legado no banco;
 * esta normalização é defesa em profundidade durante e após a transição.)
 */
export type TenantRole = "admin" | "operator";

export type RoleSession = {
  user: { isSuperAdmin?: boolean };
  availableTenants: Array<{ id: string; role: string }>;
};

const ADMIN_RAW_ROLES = new Set(["admin", "owner", "manager"]);

/** Normaliza qualquer string de papel (inclusive legado) para admin | operator. */
export function normalizeTenantRole(raw: string | null | undefined): TenantRole {
  return ADMIN_RAW_ROLES.has((raw ?? "").toLowerCase()) ? "admin" : "operator";
}

/** Papel (normalizado) do usuário no tenant indicado. Default: operator. */
export function getTenantRole(session: RoleSession, tenantId: string): TenantRole {
  const raw = session.availableTenants.find((t) => t.id === tenantId)?.role;
  return normalizeTenantRole(raw);
}

/**
 * O usuário é administrador do tenant indicado?
 * Superadmin tem acesso total, então conta como admin em qualquer tenant.
 */
export function isTenantAdmin(session: RoleSession, tenantId: string): boolean {
  return session.user.isSuperAdmin === true || getTenantRole(session, tenantId) === "admin";
}
