import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/actions/auth";
import { ShieldOff } from "lucide-react";

export default function NoAccessPage() {
  return (
    <>
      <CardHeader className="text-center pb-4 pt-6">
        <div className="flex justify-center mb-3">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldOff className="w-6 h-6 text-destructive" />
          </div>
        </div>
        <CardTitle className="text-xl font-semibold">Sem acesso</CardTitle>
        <CardDescription>
          Sua conta ainda não está vinculada a nenhuma loja. Entre em contato com o
          administrador para solicitar acesso.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center pb-6">
        <form action={logoutAction}>
          <Button variant="outline" type="submit">
            Sair
          </Button>
        </form>
      </CardContent>
    </>
  );
}
