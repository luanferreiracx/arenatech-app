"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CpfInput } from "@/components/forms/cpf-input";
import { Loader2, AlertCircle } from "lucide-react";

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
      setError("CPF ou senha inválidos. Tente novamente.");
      setLoading(false);
      return;
    }

    // Full navigation so middleware can handle auth-aware redirect
    window.location.href = "/";
  }

  return (
    <>
      <CardHeader className="text-center pb-4 pt-6">
        <CardTitle className="text-xl font-semibold">Acessar o sistema</CardTitle>
        <CardDescription className="text-sm">
          Digite seu CPF e senha para entrar
        </CardDescription>
      </CardHeader>

      <CardContent className="pb-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive" className="py-3">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
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

          <div className="space-y-1.5">
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
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Entrando...
              </>
            ) : (
              "Entrar"
            )}
          </Button>

          <div className="text-center pt-1">
            <a
              href="/forgot-password"
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              Esqueci minha senha
            </a>
          </div>
        </form>
      </CardContent>
    </>
  );
}
