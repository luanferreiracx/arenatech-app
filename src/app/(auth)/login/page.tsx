"use client";

import { useActionState, useEffect, useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle } from "lucide-react";
import { loginAction, type LoginState } from "@/app/actions/auth";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function LoginPage() {
  const [cpf, setCpf] = useState("");
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [totp, setTotp] = useState("");

  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  );

  // Login concluído → navegação COMPLETA (não client-router): o proxy roteia
  // para painel/select-tenant/admin/no-access conforme a sessão. Evita o
  // encadeamento action-redirect → middleware-redirect que quebrava em produção.
  useEffect(() => {
    if (state.success) window.location.href = "/painel";
  }, [state.success]);

  // Token do Turnstile é de uso único — o servidor o consome no siteverify. A
  // cada nova resposta do servidor, remontamos o widget (key) e limpamos o token
  // para o usuário resolver de novo. Padrão "ajustar estado ao mudar prop" do
  // React (set durante render, guardado), sem useEffect.
  const [handledState, setHandledState] = useState(state);
  const [captchaKey, setCaptchaKey] = useState(0);
  if (state !== handledState) {
    setHandledState(state);
    if (state.error) {
      setTurnstileToken("");
      setCaptchaKey((k) => k + 1);
      setTotp("");
    }
  }

  // O desafio só aparece quando o servidor o exige (após N falhas) E há site key.
  const showCaptcha = Boolean(state.captchaRequired && TURNSTILE_SITE_KEY);
  // Segunda etapa: senha OK, falta o código 2FA.
  const showTwoFactor = Boolean(state.twoFactorRequired);
  const navigating = Boolean(state.success);
  const submitDisabled =
    pending || navigating || (showCaptcha && !turnstileToken) || (showTwoFactor && totp.length < 6);

  return (
    <>
      <CardHeader className="text-center pb-4 pt-6">
        <CardTitle className="text-xl font-semibold">
          {showTwoFactor ? "Verificação em duas etapas" : "Acessar o sistema"}
        </CardTitle>
        <CardDescription className="text-sm">
          {showTwoFactor
            ? "Digite o código de 6 dígitos do seu app autenticador"
            : "Digite seu CPF ou e-mail e a senha para entrar"}
        </CardDescription>
      </CardHeader>

      <CardContent className="pb-6">
        <form action={formAction} className="space-y-4">
          {state.error && (
            <Alert variant="destructive" className="py-3">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          {/* Na etapa do 2FA o CPF e a senha viram inputs HIDDEN explícitos — o
              servidor é stateless entre as etapas e precisa deles no reenvio.
              Campos visíveis com display:none + password manager às vezes não
              reenviavam o valor; o hidden garante. */}
          {showTwoFactor ? (
            <>
              <input type="hidden" name="cpf" value={cpf} />
              <input type="hidden" name="password" value={password} />
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="cpf">CPF ou e-mail</Label>
                {/* Campo único: CPF (tenant KYC) ou e-mail (NO-KYC) — ADR 0050.
                    Input livre (sem máscara de CPF) p/ aceitar ambos; a key do
                    form segue "cpf" por compatibilidade com o loginAction. */}
                <Input
                  id="cpf"
                  name="cpf"
                  type="text"
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  autoComplete="username"
                  placeholder="CPF ou e-mail"
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
            </>
          )}

          {showTwoFactor && (
            <div className="space-y-1.5">
              <Label htmlFor="totp">Código de verificação</Label>
              <Input
                id="totp"
                name="totp"
                autoComplete="one-time-code"
                autoFocus
                maxLength={11}
                placeholder="000000 ou código de backup"
                value={totp}
                // Aceita 6 dígitos (TOTP) ou backup code (XXXXX-XXXXX).
                onChange={(e) =>
                  setTotp(e.target.value.toUpperCase().replace(/[^0-9A-Z-]/g, "").slice(0, 11))
                }
                className="text-center text-lg tracking-widest"
              />
              <p className="text-xs text-muted-foreground">
                Sem acesso ao app? Use um dos seus códigos de backup.
              </p>
            </div>
          )}

          {showCaptcha && TURNSTILE_SITE_KEY && (
            <div className="flex justify-center">
              <Turnstile
                key={captchaKey}
                siteKey={TURNSTILE_SITE_KEY}
                onSuccess={(token) => setTurnstileToken(token)}
                onExpire={() => setTurnstileToken("")}
                onError={() => setTurnstileToken("")}
                options={{ theme: "auto" }}
              />
            </div>
          )}
          <input type="hidden" name="turnstileToken" value={turnstileToken} />

          <Button type="submit" className="w-full" disabled={submitDisabled}>
            {pending || navigating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {navigating ? "Entrando..." : showTwoFactor ? "Verificando..." : "Entrando..."}
              </>
            ) : showTwoFactor ? (
              "Verificar"
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
