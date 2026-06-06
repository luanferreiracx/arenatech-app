export type SessionTenant = {
  id: string;
  slug: string;
  name: string;
  role: string;
  modules: string[];
};

export type TenantSession = {
  activeTenantId: string | null;
  availableTenants: SessionTenant[];
};

export function findSessionTenant(
  session: TenantSession,
  tenantId: string | null | undefined,
): SessionTenant | null {
  if (!tenantId) return null;
  return session.availableTenants.find((tenant) => tenant.id === tenantId) ?? null;
}

export function resolveActiveTenant(
  session: TenantSession,
  cookieTenantId: string | null | undefined,
): SessionTenant | null {
  return (
    findSessionTenant(session, cookieTenantId) ??
    findSessionTenant(session, session.activeTenantId)
  );
}

export function hasTenantAccess(session: TenantSession, tenantId: string): boolean {
  return session.availableTenants.some((tenant) => tenant.id === tenantId);
}
