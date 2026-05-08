import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TenantSelector } from "./tenant-selector";

export default async function SelectTenantPage() {
  const session = await auth();
  if (!session) redirect("/login");

  if (session.availableTenants.length === 0 && !session.user.isSuperAdmin) {
    redirect("/no-access");
  }

  return (
    <>
      <CardHeader className="text-center pb-4 pt-6">
        <CardTitle className="text-xl font-semibold">Selecione a loja</CardTitle>
        <CardDescription>Escolha a loja que deseja acessar</CardDescription>
      </CardHeader>
      <CardContent className="pb-6">
        <TenantSelector tenants={session.availableTenants} />
      </CardContent>
    </>
  );
}
