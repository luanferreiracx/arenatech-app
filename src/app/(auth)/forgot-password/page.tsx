import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Esqueci minha senha</CardTitle>
        <CardDescription>
          Funcionalidade em desenvolvimento. Entre em contato com o administrador para redefinir sua senha.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <Button variant="outline" asChild>
          <a href="/login">Voltar ao login</a>
        </Button>
      </CardContent>
    </Card>
  );
}
