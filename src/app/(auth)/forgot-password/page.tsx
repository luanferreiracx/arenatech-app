import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  return (
    <>
      <CardHeader className="text-center pb-4 pt-6">
        <CardTitle className="text-xl font-semibold">Esqueci minha senha</CardTitle>
        <CardDescription>
          Funcionalidade em desenvolvimento. Entre em contato com o administrador para
          redefinir sua senha.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center pb-6">
        <Button variant="outline" asChild>
          <a href="/login" className="flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Voltar ao login
          </a>
        </Button>
      </CardContent>
    </>
  );
}
