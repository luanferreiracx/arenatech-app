"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, CheckCircle2 } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "@/lib/toast";

export function ChangePasswordForm() {
  const trpc = useTRPC();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const mutation = useMutation(
    trpc.auth.changePassword.mutationOptions({
      onSuccess: () => {
        toast.success("Senha alterada com sucesso!");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    mutation.mutate({ currentPassword, newPassword });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Alterar Senha</CardTitle>
        <CardDescription>
          Informe sua senha atual e escolha uma nova senha com pelo menos 6 caracteres.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Senha atual</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Sua senha atual"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newPassword">Nova senha</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimo 6 caracteres"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repita a nova senha"
            />
            {confirmPassword.length > 0 && !passwordsMatch && (
              <p className="text-xs text-destructive">As senhas nao coincidem</p>
            )}
          </div>

          <Button type="submit" disabled={!canSubmit}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Alterar senha
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
