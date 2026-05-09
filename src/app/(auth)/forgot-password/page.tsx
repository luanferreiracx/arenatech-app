"use client";

import { useState } from "react";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "@/lib/toast";

export default function ForgotPasswordPage() {
  const trpc = useTRPC();
  const [identifier, setIdentifier] = useState("");
  const [sent, setSent] = useState(false);

  const mutation = useMutation(
    trpc.auth.forgotPassword.mutationOptions({
      onSuccess: () => {
        setSent(true);
      },
      onError: (err) => {
        toast.error(err.message);
      },
    }),
  );

  if (sent) {
    return (
      <>
        <CardHeader className="text-center pb-4 pt-6">
          <div className="flex justify-center mb-3">
            <CheckCircle2 className="h-12 w-12 text-success" />
          </div>
          <CardTitle className="text-xl font-semibold">E-mail enviado!</CardTitle>
          <CardDescription>
            Se o CPF ou e-mail informado estiver cadastrado, voce recebera um link
            para redefinir sua senha. Verifique sua caixa de entrada.
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

  return (
    <>
      <CardHeader className="text-center pb-4 pt-6">
        <CardTitle className="text-xl font-semibold">Esqueci minha senha</CardTitle>
        <CardDescription>
          Informe seu CPF ou e-mail cadastrado para receber o link de redefinicao.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pb-6">
        <div className="space-y-2">
          <Label htmlFor="identifier">CPF ou E-mail</Label>
          <Input
            id="identifier"
            placeholder="000.000.000-00 ou email@exemplo.com"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && identifier.trim()) {
                mutation.mutate({ identifier: identifier.trim() });
              }
            }}
          />
        </div>

        <Button
          className="w-full"
          disabled={!identifier.trim() || mutation.isPending}
          onClick={() => mutation.mutate({ identifier: identifier.trim() })}
        >
          {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Enviar link de redefinicao
        </Button>

        <div className="flex justify-center">
          <Button variant="ghost" size="sm" asChild>
            <a href="/login" className="flex items-center gap-2 text-muted-foreground">
              <ArrowLeft className="w-4 h-4" />
              Voltar ao login
            </a>
          </Button>
        </div>
      </CardContent>
    </>
  );
}
