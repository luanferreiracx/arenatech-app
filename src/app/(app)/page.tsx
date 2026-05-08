import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/actions/auth";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const cookieStore = await cookies();
  const activeTenantId = cookieStore.get("x-active-tenant")?.value ?? session.activeTenantId;
  const activeTenant = session.availableTenants.find((t) => t.id === activeTenantId);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            Bem-vindo, {session.user.name}!
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeTenant && (
            <p className="text-muted-foreground">
              Loja ativa: <span className="font-medium text-foreground">{activeTenant.name}</span>
            </p>
          )}

          <div className="flex gap-2">
            {session.availableTenants.length > 1 && (
              <Button variant="outline" asChild>
                <a href="/select-tenant">Trocar de loja</a>
              </Button>
            )}
            <form action={logoutAction}>
              <Button variant="ghost" type="submit">Sair</Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
