import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TenantSelector } from "./tenant-selector";

export default async function SelectTenantPage() {
  const session = await auth();
  if (!session) redirect("/login");

  if (session.availableTenants.length === 0 && !session.user.isSuperAdmin) {
    redirect("/no-access");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Selecione a loja</CardTitle>
          <CardDescription>
            Escolha a loja que deseja acessar
          </CardDescription>
        </CardHeader>
      </Card>

      <TenantSelector tenants={session.availableTenants} />
    </div>
  );
}
