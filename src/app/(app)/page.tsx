import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ordens Abertas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">—</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Vendas Hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">—</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Clientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">—</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Faturamento do Mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">—</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bem-vindo, {session.user.name}!</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            O dashboard está em construção. Use o menu lateral para navegar.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
