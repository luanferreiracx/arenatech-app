"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "@/lib/toast";

export default function ResetPasswordPage() {
  const trpc = useTRPC();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [done, setDone] = useState(false);

  const mutation = useMutation(
    trpc.auth.resetPassword.mutationOptions({
      onSuccess: () => {
        setDone(true);
      },
      onError: (err) => {
        toast.error(err.message);
      },
    }),
  );

  if (!token) {
    return (
      <>
        <CardHeader className="text-center pb-4 pt-6">
          <div className="flex justify-center mb-3">
            <AlertTriangle className="h-12 w-12 text-destructive" />
          </div>
          <CardTitle className="text-xl font-semibold">Link invalido</CardTitle>
          <CardDescription>
            Este link de redefinicao de senha e invalido. Solicite um novo.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center pb-6">
          <Button variant="outline" asChild>
            <a href="/forgot-password" className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              Solicitar novo link
            </a>
          </Button>
        </CardContent>
      </>
    );
  }

  if (done) {
    return (
      <>
        <CardHeader className="text-center pb-4 pt-6">
          <div className="flex justify-center mb-3">
            <CheckCircle2 className="h-12 w-12 text-success" />
          </div>
          <CardTitle className="text-xl font-semibold">Senha redefinida!</CardTitle>
          <CardDescription>
            Sua senha foi alterada com sucesso. Agora voce pode fazer login.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center pb-6">
          <Button asChild>
            <a href="/login">Ir para o login</a>
          </Button>
        </CardContent>
      </>
    );
  }

  const passwordsMatch = newPassword === confirmPassword;
  const canSubmit =
    newPassword.length >= 6 &&
    confirmPassword.length >= 6 &&
    passwordsMatch &&
    !mutation.isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    mutation.mutate({ token, newPassword });
  };

  return (
    <>
      <CardHeader className="text-center pb-4 pt-6">
        <CardTitle className="text-xl font-semibold">Redefinir senha</CardTitle>
        <CardDescription>
          Escolha uma nova senha com pelo menos 6 caracteres.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pb-6">
        <div className="space-y-2">
          <Label htmlFor="newPassword">Nova senha</Label>
          <Input
            id="newPassword"
            type="password"
            placeholder="Minimo 6 caracteres"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="Repita a nova senha"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
          />
          {confirmPassword.length > 0 && !passwordsMatch && (
            <p className="text-xs text-destructive">As senhas nao coincidem</p>
          )}
        </div>

        <Button
          className="w-full"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Redefinir senha
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
