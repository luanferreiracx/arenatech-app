import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";
import { isTenantAdmin } from "@/lib/auth/roles";
import { withAdmin } from "@/server/db";

/**
 * Guard server-side da aba "API de Parceiros": exige admin do tenant E que o
 * superadmin tenha liberado a API externa (`Tenant.apiAccessEnabled`). O router
 * também valida (defesa em profundidade); aqui evitamos a UI quebrada por URL direta.
 */
export default async function PartnerApiLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const cookieStore = await cookies();
  const activeTenant = session
    ? resolveActiveTenant(session, cookieStore.get("x-active-tenant")?.value)
    : null;

  const allowed =
    !!session &&
    !!activeTenant &&
    isTenantAdmin(session, activeTenant.id) &&
    (await withAdmin((tx) =>
      tx.tenant.findUnique({ where: { id: activeTenant.id }, select: { apiAccessEnabled: true } }),
    ))?.apiAccessEnabled === true;

  if (!allowed) redirect("/settings/general");
  return <>{children}</>;
}
