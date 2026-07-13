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

export function TwoFactorCard() {
  const trpc = useTRPC();
  const statusQuery = useQuery(trpc.twoFactor.getStatus.queryOptions());

  const [enroll, setEnroll] = useState<EnrollData | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  // Regenerar códigos de backup (auditoria 2026-07-13, #8): pede TOTP e substitui
  // os códigos. Invalida os antigos.
  const [regenMode, setRegenMode] = useState(false);
  const [regenTotp, setRegenTotp] = useState("");

  // Desativação — caminho forte (senha + TOTP → email + WhatsApp) ou backup code.
  const [backupMode, setBackupMode] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableTotp, setDisableTotp] = useState("");
  const [disableSent, setDisableSent] = useState<{ emailMasked: string; phoneMasked: string } | null>(null);
  const [disableEmailCode, setDisableEmailCode] = useState("");
  const [disableWhatsappCode, setDisableWhatsappCode] = useState("");
  const [disableBackupCode, setDisableBackupCode] = useState("");

  const resetDisableState = () => {
    setBackupMode(false);
    setDisablePassword("");
    setDisableTotp("");
    setDisableSent(null);
    setDisableEmailCode("");
    setDisableWhatsappCode("");
    setDisableBackupCode("");
    setBackupCodes(null);
  };

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

  // Regenera os códigos de backup (exige TOTP). Mostra os novos via BackupCodes.
  const regenMutation = useMutation(
    trpc.twoFactor.regenerateBackupCodes.mutationOptions({
      onSuccess: (data) => {
        setBackupCodes(data.backupCodes);
        setRegenMode(false);
        setRegenTotp("");
        void statusQuery.refetch();
        toast.success("Novos códigos de backup gerados. Os anteriores foram invalidados.");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  // Passo 1 do caminho forte: valida senha + TOTP e envia email + WhatsApp.
  const startDisableMutation = useMutation(
    trpc.twoFactor.startDisable.mutationOptions({
      onSuccess: (data) => {
        setDisableSent({ emailMasked: data.emailMasked, phoneMasked: data.phoneMasked });
        toast.success("Códigos enviados por email e WhatsApp.");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  // Passo 2 do caminho forte: senha + TOTP + email + WhatsApp.
  const confirmDisableMutation = useMutation(
    trpc.twoFactor.confirmDisable.mutationOptions({
      onSuccess: () => {
        resetDisableState();
        void statusQuery.refetch();
        toast.success("2FA desativado.");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  // Caminho alternativo: senha + backup code.
  const disableBackupMutation = useMutation(
    trpc.twoFactor.disableWithBackupCode.mutationOptions({
      onSuccess: () => {
        resetDisableState();
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

  // Já ativo: status + desativar (2 caminhos).
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
          {/* Regenerar códigos de backup (exige TOTP) */}
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">Códigos de backup</p>
            {!regenMode ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setRegenMode(true)}>
                Regenerar códigos de backup
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Gerar novos códigos invalida os atuais. Informe o código do app para confirmar.
                </p>
                <div className="flex gap-2">
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="Código do app (6 dígitos)"
                    value={regenTotp}
                    onChange={(e) => setRegenTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="max-w-[220px]"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => regenMutation.mutate({ code: regenTotp })}
                    disabled={regenTotp.length !== 6 || regenMutation.isPending}
                  >
                    {regenMutation.isPending ? "Gerando..." : "Confirmar"}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setRegenMode(false); setRegenTotp(""); }}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>

          <p className="text-sm font-medium">Desativar 2FA</p>

          {!backupMode ? (
            <>
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
                <Label htmlFor="disable-totp">Código do app (TOTP)</Label>
                <Input
                  id="disable-totp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={disableTotp}
                  onChange={(e) => setDisableTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </div>

              {!disableSent ? (
                <Button
                  type="button"
                  disabled={startDisableMutation.isPending || !disablePassword || disableTotp.length < 6}
                  onClick={() =>
                    startDisableMutation.mutate({ password: disablePassword, totpCode: disableTotp })
                  }
                >
                  {startDisableMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enviar códigos por email e WhatsApp
                </Button>
              ) : (
                <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">
                    Código enviado para {disableSent.emailMasked} e WhatsApp •••{disableSent.phoneMasked}.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="disable-email-code">Código do email</Label>
                    <Input
                      id="disable-email-code"
                      inputMode="numeric"
                      maxLength={6}
                      value={disableEmailCode}
                      onChange={(e) => setDisableEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="disable-wa-code">Código do WhatsApp</Label>
                    <Input
                      id="disable-wa-code"
                      inputMode="numeric"
                      maxLength={6}
                      value={disableWhatsappCode}
                      onChange={(e) => setDisableWhatsappCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={
                      confirmDisableMutation.isPending ||
                      !disablePassword ||
                      disableTotp.length < 6 ||
                      disableEmailCode.length < 6 ||
                      disableWhatsappCode.length < 6
                    }
                    onClick={() =>
                      confirmDisableMutation.mutate({
                        password: disablePassword,
                        totpCode: disableTotp,
                        emailCode: disableEmailCode,
                        whatsappCode: disableWhatsappCode,
                      })
                    }
                  >
                    {confirmDisableMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Desativar 2FA
                  </Button>
                </div>
              )}

              <div className="border-t pt-3">
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs"
                  onClick={() => {
                    setBackupMode(true);
                    setDisableSent(null);
                  }}
                >
                  Não tem o app? Usar um backup code
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="backup-password">Senha atual</Label>
                <Input
                  id="backup-password"
                  type="password"
                  autoComplete="current-password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="backup-code">Backup code</Label>
                <Input
                  id="backup-code"
                  autoComplete="one-time-code"
                  maxLength={11}
                  placeholder="XXXXX-XXXXX"
                  value={disableBackupCode}
                  onChange={(e) => setDisableBackupCode(e.target.value.toUpperCase().slice(0, 11))}
                />
              </div>
              <Button
                type="button"
                variant="destructive"
                disabled={disableBackupMutation.isPending || !disablePassword || !disableBackupCode.trim()}
                onClick={() =>
                  disableBackupMutation.mutate({
                    password: disablePassword,
                    backupCode: disableBackupCode.trim(),
                  })
                }
              >
                {disableBackupMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Desativar 2FA
              </Button>

              <div className="border-t pt-3">
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs"
                  onClick={() => setBackupMode(false)}
                >
                  Voltar (usar o app)
                </Button>
              </div>
            </>
          )}
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
          <BackupCodes codes={backupCodes} />
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
