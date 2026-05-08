import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/actions/auth";

export default async function AdminPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!session.user.isSuperAdmin) redirect("/");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Painel Super Admin</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Logado como: <span className="font-medium text-foreground">{session.user.name}</span> ({session.user.cpf})
          </p>
          <form action={logoutAction}>
            <Button variant="ghost" type="submit">Sair</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
