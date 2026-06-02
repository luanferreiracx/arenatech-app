import { cookies } from "next/headers";
import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { DashboardContent } from "../_components/dashboard-content";

export const metadata = {
  title: "Painel | Arena Tech",
};

export default async function PainelPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const cookieStore = await cookies();
  const activeTenantId =
    cookieStore.get("x-active-tenant")?.value ?? session.activeTenantId;
  const activeTenant = session.availableTenants.find((t) => t.id === activeTenantId);

  return <DashboardContent userName={session.user.name} tenantSlug={activeTenant?.slug} />;
}
