import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function AdminPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!session.user.isSuperAdmin) redirect("/no-access");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Painel Super Admin</h1>
        <Badge className="bg-warning text-warning-foreground">SUPER ADMIN</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Visão Geral</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Logado como:{" "}
            <span className="font-medium text-foreground">{session.user.name}</span> (
            {session.user.cpf})
          </p>
          <p className="text-muted-foreground text-sm">
            Módulos administrativos em construção. Use o menu lateral para navegar.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
