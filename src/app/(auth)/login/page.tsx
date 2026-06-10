"use client";

import { useActionState, useState } from "react";
import ReCAPTCHA from "react-google-recaptcha";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CpfInput } from "@/components/forms/cpf-input";
import { Loader2, AlertCircle } from "lucide-react";
import { loginAction, type LoginState } from "@/app/actions/auth";

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

export default function LoginPage() {
  const [cpf, setCpf] = useState("");
  const [password, setPassword] = useState("");
  const [recaptchaToken, setRecaptchaToken] = useState("");

  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  );

  // Token do reCAPTCHA é de uso único — o servidor o consome no siteverify. A
  // cada nova resposta do servidor, remontamos o widget (key) e limpamos o token
  // para o usuário resolver de novo. Padrão "ajustar estado ao mudar prop" do
  // React (set durante render, guardado), sem useEffect.
  const [handledState, setHandledState] = useState(state);
  const [captchaKey, setCaptchaKey] = useState(0);
  if (state !== handledState) {
    setHandledState(state);
    if (state.error) {
      setRecaptchaToken("");
      setCaptchaKey((k) => k + 1);
    }
  }

  // O desafio só aparece quando o servidor o exige (após N falhas) E há site key.
  const showCaptcha = Boolean(state.captchaRequired && RECAPTCHA_SITE_KEY);
  const submitDisabled = pending || (showCaptcha && !recaptchaToken);

  return (
    <>
      <CardHeader className="text-center pb-4 pt-6">
        <CardTitle className="text-xl font-semibold">Acessar o sistema</CardTitle>
        <CardDescription className="text-sm">
          Digite seu CPF e senha para entrar
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

          {showCaptcha && RECAPTCHA_SITE_KEY && (
            <div className="flex justify-center">
              <ReCAPTCHA
                key={captchaKey}
                sitekey={RECAPTCHA_SITE_KEY}
                onChange={(token) => setRecaptchaToken(token ?? "")}
                onExpired={() => setRecaptchaToken("")}
              />
            </div>
          )}
          <input type="hidden" name="recaptchaToken" value={recaptchaToken} />

          <Button type="submit" className="w-full" disabled={submitDisabled}>
            {pending ? (
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
