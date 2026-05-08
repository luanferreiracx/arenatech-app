"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CpfInput } from "@/components/forms/cpf-input";

export default function LoginPage() {
  const [cpf, setCpf] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      cpf,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Credenciais inválidas");
      setLoading(false);
      return;
    }

    // Full navigation so middleware can handle auth-aware redirect
    window.location.href = "/";
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Arena Tech</CardTitle>
        <CardDescription>Entre com seu CPF e senha</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="cpf">CPF</Label>
            <CpfInput
              id="cpf"
              name="cpf"
              value={cpf}
              onValueChange={setCpf}
              autoComplete="username"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>

          <div className="text-center">
            <a href="/forgot-password" className="text-sm text-muted-foreground hover:underline">
              Esqueci minha senha
            </a>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
