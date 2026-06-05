import { cookies } from "next/headers";
import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { DashboardContent } from "../_components/dashboard-content";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";

export const metadata = {
  title: "Painel | Arena Tech",
};

export default async function PainelPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const cookieStore = await cookies();
  const activeTenant = resolveActiveTenant(
    session,
    cookieStore.get("x-active-tenant")?.value,
  );

  const allowedModules = activeTenant?.modules ?? [];

  return (
    <DashboardContent
      userName={session.user.name}
      tenantSlug={activeTenant?.slug}
      allowedModules={allowedModules}
    />
  );
}
