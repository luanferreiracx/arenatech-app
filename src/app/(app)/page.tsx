import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { DashboardClient } from "./_components/dashboard-client";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const cookieStore = await cookies();
  const activeTenantId = cookieStore.get("x-active-tenant")?.value ?? session.activeTenantId;
  const activeTenant = session.availableTenants.find((t) => t.id === activeTenantId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        {activeTenant && (
          <p className="text-muted-foreground mt-1">
            Loja ativa: <span className="font-medium text-foreground">{activeTenant.name}</span>
          </p>
        )}
      </div>

      <DashboardClient />

      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold">Bem-vindo, {session.user.name}!</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Use o menu lateral para navegar entre os modulos do sistema.
        </p>
      </div>
    </div>
  );
}
