"use client";

import { useState } from "react";
import Image from "next/image";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ShieldCheck, ShieldAlert, Loader2, Copy, Check } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { toast } from "@/lib/toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

type EnrollData = { otpauthUrl: string; qrDataUrl: string; secret: string };

function BackupCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(codes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Alert>
      <ShieldCheck className="h-4 w-4" />
      <AlertDescription>
        <p className="font-medium">Guarde seus códigos de backup</p>
        <p className="text-xs text-muted-foreground">
          Cada código funciona uma vez, caso você perca o acesso ao app. Eles não serão exibidos novamente.
        </p>
        <div className="my-3 grid grid-cols-2 gap-2 font-mono text-sm">
          {codes.map((c) => (
            <span key={c} className="rounded bg-muted px-2 py-1 text-center">{c}</span>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
          {copied ? "Copiado" : "Copiar códigos"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function TwoFactorCard({ onDone }: { onDone?: () => void }) {
  const trpc = useTRPC();
  const statusQuery = useQuery(trpc.twoFactor.getStatus.queryOptions());

  const [enroll, setEnroll] = useState<EnrollData | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  // Desativação
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");

  const startMutation = useMutation(
    trpc.twoFactor.startEnrollment.mutationOptions({
      onSuccess: (data) => setEnroll(data),
      onError: (e) => toast.error(e.message),
    }),
  );

  const confirmMutation = useMutation(
    trpc.twoFactor.confirm.mutationOptions({
      onSuccess: (data) => {
        setBackupCodes(data.backupCodes);
        setEnroll(null);
        setCode("");
        void statusQuery.refetch();
        toast.success("2FA ativado com sucesso!");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const disableMutation = useMutation(
    trpc.twoFactor.disable.mutationOptions({
      onSuccess: () => {
        setDisablePassword("");
        setDisableCode("");
        setBackupCodes(null);
        void statusQuery.refetch();
        toast.success("2FA desativado.");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  if (statusQuery.isLoading) {
    return (
      <Card className="max-w-lg">
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </CardContent>
      </Card>
    );
  }

  const status = statusQuery.data;

  if (status && !status.configured) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">Verificação em duas etapas (2FA)</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>2FA não está disponível neste ambiente.</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Já ativo: status + desativar.
  if (status?.enabled && !backupCodes) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-emerald-600" /> 2FA ativo
          </CardTitle>
          <CardDescription>
            Seu login exige um código do app autenticador. {status.remainingBackupCodes} código(s) de backup
            restante(s).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium">Desativar 2FA</p>
          <div className="space-y-1.5">
            <Label htmlFor="disable-password">Senha atual</Label>
            <Input
              id="disable-password"
              type="password"
              autoComplete="current-password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="disable-code">Código do app</Label>
            <Input
              id="disable-code"
              inputMode="numeric"
              maxLength={6}
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </div>
          <Button
            type="button"
            variant="destructive"
            disabled={disableMutation.isPending || !disablePassword || disableCode.length < 6}
            onClick={() => disableMutation.mutate({ password: disablePassword, code: disableCode })}
          >
            {disableMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Desativar 2FA
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle className="text-base">Verificação em duas etapas (2FA)</CardTitle>
        <CardDescription>
          Proteja sua conta exigindo um código de um app autenticador (Google Authenticator, Authy, 1Password) a
          cada login.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {backupCodes ? (
          <div className="space-y-4">
            <BackupCodes codes={backupCodes} />
            {onDone && (
              <Button type="button" className="w-full" onClick={onDone}>
                Já guardei meus códigos — continuar
              </Button>
            )}
          </div>
        ) : !enroll ? (
          <Button
            type="button"
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
          >
            {startMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Ativar 2FA
          </Button>
        ) : (
          <div className="space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Abra seu app autenticador e escaneie o QR code.</li>
              <li>Digite o código de 6 dígitos gerado para confirmar.</li>
            </ol>
            <div className="flex justify-center">
              <Image
                src={enroll.qrDataUrl}
                alt="QR code para configurar o 2FA"
                width={200}
                height={200}
                unoptimized
                className="rounded border bg-white p-2"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Ou insira a chave manualmente</Label>
              <code className="block break-all rounded bg-muted px-2 py-1 text-xs">{enroll.secret}</code>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-code">Código de confirmação</Label>
              <Input
                id="confirm-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center text-lg tracking-[0.4em]"
              />
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={confirmMutation.isPending || code.length < 6}
              onClick={() => confirmMutation.mutate({ code })}
            >
              {confirmMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar e ativar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
