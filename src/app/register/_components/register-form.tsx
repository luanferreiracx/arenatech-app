"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2, Mail, MessageCircle } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  startNoKycRegistrationSchema,
  type StartNoKycRegistrationInput,
} from "@/lib/validators/no-kyc";

type Step = "form" | "email" | "phone";

/**
 * Auto-cadastro NO-KYC (ADR 0050): dados → verificação de e-mail por código →
 * verificação de telefone por código → /register/pending (aguardando aprovação).
 */
export function RegisterForm() {
  const trpc = useTRPC();
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");
  const [preRegistrationId, setPreRegistrationId] = useState<string | null>(null);
  const [emailMasked, setEmailMasked] = useState("");
  const [phoneMasked, setPhoneMasked] = useState("");
  const [code, setCode] = useState("");
  // Aceite dos termos: obrigatório antes de criar a conta (compliance).
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const form = useForm<StartNoKycRegistrationInput>({
    resolver: zodResolver(startNoKycRegistrationSchema),
    defaultValues: {
      ownerName: "",
      tradeName: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
    },
  });

  const startMutation = useMutation(
    trpc.noKyc.startRegistration.mutationOptions({
      onSuccess: (res) => {
        setPreRegistrationId(res.preRegistrationId);
        setEmailMasked(res.emailMasked);
        setCode("");
        setStep("email");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const verifyEmailMutation = useMutation(
    trpc.noKyc.verifyEmail.mutationOptions({
      onSuccess: (res) => {
        setPhoneMasked(res.phoneMasked);
        setCode("");
        setStep("phone");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const verifyPhoneMutation = useMutation(
    trpc.noKyc.verifyPhone.mutationOptions({
      onSuccess: () => router.push("/register/pending"),
      onError: (err) => toast.error(err.message),
    }),
  );

  const resendMutation = useMutation(
    trpc.noKyc.resendCode.mutationOptions({
      onSuccess: () => toast.success("Novo código enviado."),
      onError: (err) => toast.error(err.message),
    }),
  );

  if (step === "email" && preRegistrationId) {
    return (
      <CodeStep
        icon={<Mail className="h-6 w-6" />}
        title="Confirme seu e-mail"
        description={`Enviamos um código para ${emailMasked}.`}
        code={code}
        onCodeChange={setCode}
        pending={verifyEmailMutation.isPending}
        onSubmit={() => verifyEmailMutation.mutate({ preRegistrationId, code })}
        onResend={() => resendMutation.mutate({ preRegistrationId, channel: "EMAIL" })}
        resending={resendMutation.isPending}
      />
    );
  }

  if (step === "phone" && preRegistrationId) {
    return (
      <CodeStep
        icon={<MessageCircle className="h-6 w-6" />}
        title="Confirme seu WhatsApp"
        description={`Enviamos um código por WhatsApp para ${phoneMasked}.`}
        code={code}
        onCodeChange={setCode}
        pending={verifyPhoneMutation.isPending}
        onSubmit={() => verifyPhoneMutation.mutate({ preRegistrationId, code })}
        onResend={() => resendMutation.mutate({ preRegistrationId, channel: "WHATSAPP" })}
        resending={resendMutation.isPending}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar conta</CardTitle>
        <CardDescription>Cadastre-se com e-mail e senha. Sem documentos.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={form.handleSubmit((data) => startMutation.mutate(data))}
          className="space-y-4"
          noValidate
        >
          <Field label="Seu nome *" error={form.formState.errors.ownerName?.message}>
            <Input {...form.register("ownerName")} placeholder="Nome completo" />
          </Field>
          <Field label="Nome da loja (opcional)" error={form.formState.errors.tradeName?.message}>
            <Input {...form.register("tradeName")} placeholder="Como sua loja se chama" />
          </Field>
          <Field label="E-mail *" error={form.formState.errors.email?.message}>
            <Input {...form.register("email")} type="email" autoComplete="email" placeholder="voce@exemplo.com" />
          </Field>
          <Field label="WhatsApp *" error={form.formState.errors.phone?.message}>
            <Input {...form.register("phone")} type="tel" autoComplete="tel" placeholder="(00) 00000-0000" />
          </Field>
          <Field label="Senha *" error={form.formState.errors.password?.message}>
            <Input {...form.register("password")} type="password" autoComplete="new-password" placeholder="Mínimo 8 caracteres" />
          </Field>
          <Field label="Confirmar senha *" error={form.formState.errors.confirmPassword?.message}>
            <Input {...form.register("confirmPassword")} type="password" autoComplete="new-password" />
          </Field>

          <Alert className="py-3">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Após verificar e-mail e WhatsApp, seu cadastro vai para aprovação.
            </AlertDescription>
          </Alert>

          <label className="flex items-start gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={acceptedTerms}
              onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
              className="mt-0.5"
              aria-label="Aceito os termos"
            />
            <span>
              Li e concordo com os{" "}
              <a href="/legal/termos" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                Termos de Uso
              </a>{" "}
              e a{" "}
              <a href="/legal/privacidade" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                Política de Privacidade
              </a>
              .
            </span>
          </label>

          <Button type="submit" className="w-full" disabled={startMutation.isPending || !acceptedTerms}>
            {startMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              "Continuar"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function CodeStep({
  icon,
  title,
  description,
  code,
  onCodeChange,
  pending,
  onSubmit,
  onResend,
  resending,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  code: string;
  onCodeChange: (v: string) => void;
  pending: boolean;
  onSubmit: () => void;
  onResend: () => void;
  resending: boolean;
}) {
  const canSubmit = code.replace(/\D/g, "").length >= 4 && !pending;
  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) onSubmit();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="code">Código de verificação</Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="text-center text-lg tracking-[0.4em]"
            />
          </div>
          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verificando...
              </>
            ) : (
              "Verificar"
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={resending}
            onClick={onResend}
          >
            {resending ? "Reenviando..." : "Reenviar código"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
