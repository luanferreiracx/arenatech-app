import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/actions/auth";

export default function NoAccessPage() {
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Sem acesso</CardTitle>
        <CardDescription>
          Sua conta ainda não está vinculada a nenhuma loja.
          Entre em contato com o administrador para solicitar acesso.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <form action={logoutAction}>
          <Button variant="outline" type="submit">Sair</Button>
        </form>
      </CardContent>
    </Card>
  );
}
