"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { signOut } from "next-auth/react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { useTRPC } from "@/trpc/react";

export default function ChangePasswordPage() {
  const trpc = useTRPC();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [done, setDone] = useState(false);

  const mutation = useMutation(
    trpc.auth.changePassword.mutationOptions({
      onSuccess: () => {
        setDone(true);
      },
      onError: (err) => {
        toast.error(err.message);
      },
    }),
  );

  const passwordsMatch = newPassword === confirmPassword;
  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 6 &&
    confirmPassword.length >= 6 &&
    passwordsMatch &&
    !mutation.isPending;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    mutation.mutate({ currentPassword, newPassword });
  };

  if (done) {
    return (
      <>
        <CardHeader className="text-center pb-4 pt-6">
          <div className="flex justify-center mb-3">
            <CheckCircle2 className="h-12 w-12 text-success" />
          </div>
          <CardTitle className="text-xl font-semibold">Senha alterada</CardTitle>
          <CardDescription>
            Entre novamente usando sua nova senha.
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-6">
          <Button
            className="w-full"
            onClick={() => void signOut({ callbackUrl: "/login" })}
          >
            Ir para o login
          </Button>
        </CardContent>
      </>
    );
  }

  return (
    <>
      <CardHeader className="text-center pb-4 pt-6">
        <CardTitle className="text-xl font-semibold">Altere sua senha</CardTitle>
        <CardDescription>
          A senha temporaria precisa ser substituida antes de acessar o sistema.
          Se preferir trocar depois, volte ao login.
        </CardDescription>
      </CardHeader>

      <CardContent className="pb-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Alert className="py-3">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Use uma senha nova com pelo menos 6 caracteres.
            </AlertDescription>
          </Alert>

          <div className="space-y-1.5">
            <Label htmlFor="currentPassword">Senha temporaria</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="newPassword">Nova senha</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="text-xs text-destructive">As senhas nao coincidem</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Alterando...
              </>
            ) : (
              "Alterar senha"
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={mutation.isPending}
            onClick={() => void signOut({ callbackUrl: "/login" })}
          >
            Voltar ao login
          </Button>
        </form>
      </CardContent>
    </>
  );
}
