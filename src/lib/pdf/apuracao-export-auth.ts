import { withTenant } from "@/server/db";
import { isTenantAdmin, type RoleSession } from "@/lib/auth/roles";

/**
 * Autoriza o export (PDF/CSV) da apuracao: admin do tenant OU o proprio
 * prestador (dono da apuracao). Tenant-scoped: resolve o provider via RLS.
 */
export async function assertCanExportApuracao(
  session: RoleSession & { user: { id: string } },
  tenantId: string,
  providerId: string,
): Promise<boolean> {
  if (isTenantAdmin(session, tenantId)) return true;

  const provider = await withTenant(tenantId, (tx) =>
    tx.provider.findUnique({ where: { id: providerId }, select: { userId: true } }),
  );
  return provider?.userId === session.user.id;
}
