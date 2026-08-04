"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, Loader2, ExternalLink } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoadingState } from "@/components/domain/loading-state";
import { useIsTenantAdmin } from "@/lib/auth/use-tenant-admin";
import {
  saveWhatsappCloudSchema,
  type SaveWhatsappCloudInput,
} from "@/lib/validators/settings";

/** Resultado do "Testar conexão", exibido sem gravar nada. */
type TestResult =
  | { ok: true; verifiedName: string | null; displayPhoneNumber: string | null }
  | { ok: false; message: string };

export function WhatsappCloudForm() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // RBAC: espelha `tenantAdminProcedure` no servidor. Credencial de integração
  // não é coisa de operador de caixa.
  const isAdmin = useIsTenantAdmin();

  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const statusQuery = useQuery(trpc.settings.getWhatsappCloud.queryOptions());

  const form = useForm<SaveWhatsappCloudInput>({
    resolver: zodResolver(saveWhatsappCloudSchema),
    defaultValues: { token: "", phoneNumberId: "", wabaId: "" },
  });

  const testMutation = useMutation(
    trpc.settings.testWhatsappCloud.mutationOptions({
      onSuccess: (r) =>
        setTestResult(
          r.ok
            ? { ok: true, verifiedName: r.verifiedName, displayPhoneNumber: r.displayPhoneNumber }
            : { ok: false, message: r.message },
        ),
      onError: (err) => setTestResult({ ok: false, message: err.message }),
    }),
  );

  const saveMutation = useMutation(
    trpc.settings.saveWhatsappCloud.mutationOptions({
      onSuccess: (r) => {
        toast.success(
          r.verifiedName
            ? `WhatsApp conectado: ${r.verifiedName} (${r.displayPhoneNumber ?? ""})`
            : "WhatsApp conectado.",
        );
        setTestResult(null);
        // O token some do formulário depois de salvo — a tela nunca o mostra
        // de volta, nem para quem acabou de digitá-lo.
        form.setValue("token", "");
        queryClient.invalidateQueries({ queryKey: trpc.settings.getWhatsappCloud.queryKey() });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const toggleMutation = useMutation(
    trpc.settings.setWhatsappCloudEnabled.mutationOptions({
      onSuccess: (r) => {
        toast.success(r.enabled ? "WhatsApp ativado." : "WhatsApp desativado.");
        queryClient.invalidateQueries({ queryKey: trpc.settings.getWhatsappCloud.queryKey() });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  if (statusQuery.isPending) return <LoadingState />;

  if (!isAdmin) {
    return (
      <Alert>
        <AlertTriangle className="size-4" aria-hidden />
        <AlertDescription className="min-w-0 break-words">
          A conexão do WhatsApp é da administração da loja. Peça a quem administra
          para configurar.
        </AlertDescription>
      </Alert>
    );
  }

  const status = statusQuery.data;
  const configured = status?.configured === true;
  const tokenDigitado = form.watch("token")?.trim() ?? "";
  const numeroDigitado = form.watch("phoneNumberId")?.trim() ?? "";

  return (
    <div className="space-y-6">
      {configured && <ConnectionStatus status={status} onToggle={(v) => toggleMutation.mutate({ enabled: v })} pending={toggleMutation.isPending} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {configured ? "Trocar credenciais" : "Conectar o WhatsApp da sua loja"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))}
            className="space-y-4"
            noValidate
          >
            <div className="space-y-1.5">
              <Label htmlFor="phoneNumberId">ID do número de telefone *</Label>
              <Input
                id="phoneNumberId"
                {...form.register("phoneNumberId")}
                inputMode="numeric"
                placeholder="105954558954427"
                aria-invalid={!!form.formState.errors.phoneNumberId}
                aria-describedby="phoneNumberId-hint"
              />
              {/* O erro mais comum é digitar o telefone aqui. Dizer isso ANTES
                  evita a ida e volta com a Meta recusando. */}
              <p id="phoneNumberId-hint" className="min-w-0 break-words text-xs text-muted-foreground">
                No painel da Meta, em WhatsApp › Configuração da API. É um número
                longo ao lado do telefone — não é o telefone com DDD.
              </p>
              {form.formState.errors.phoneNumberId && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.phoneNumberId.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="token">
                Token de acesso {configured ? "(deixe em branco para manter o atual)" : "*"}
              </Label>
              <Input
                id="token"
                {...form.register("token")}
                type="password"
                autoComplete="off"
                placeholder={configured ? "••••••••••••" : "EAAG..."}
                aria-invalid={!!form.formState.errors.token}
                aria-describedby="token-hint"
              />
              <p id="token-hint" className="min-w-0 break-words text-xs text-muted-foreground">
                Use um token <strong>permanente</strong>, de usuário do sistema. O token
                temporário do painel expira em 24 horas e o envio para de funcionar.
              </p>
              {form.formState.errors.token && (
                <p className="text-xs text-destructive">{form.formState.errors.token.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wabaId">ID da conta do WhatsApp Business (opcional)</Label>
              <Input
                id="wabaId"
                {...form.register("wabaId")}
                inputMode="numeric"
                placeholder="123456789012345"
              />
            </div>

            {testResult && <TestFeedback result={testResult} />}

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                // Testar exige token digitado: o servidor recusa testar com o
                // token salvo, que a tela não conhece.
                disabled={testMutation.isPending || tokenDigitado.length < 20 || !numeroDigitado}
                onClick={() =>
                  testMutation.mutate({
                    token: tokenDigitado,
                    phoneNumberId: numeroDigitado,
                    ...(form.getValues("wabaId") ? { wabaId: form.getValues("wabaId") } : {}),
                  })
                }
              >
                {testMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                    Testando...
                  </>
                ) : (
                  "Testar conexão"
                )}
              </Button>

              <Button type="submit" disabled={saveMutation.isPending || !numeroDigitado}>
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                    Salvando...
                  </>
                ) : (
                  "Salvar e conectar"
                )}
              </Button>
            </div>

            <p className="min-w-0 break-words text-xs text-muted-foreground">
              Ao salvar, verificamos a credencial na Meta. Se ela não funcionar, nada é
              gravado — sua conexão atual continua como está.
            </p>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Onde encontrar esses dados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p className="min-w-0 break-words">
            Você precisa de uma conta do WhatsApp Business verificada na Meta, com um
            número já registrado para a API.
          </p>
          <a
            href="https://business.facebook.com/wa/manage/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-w-0 items-center gap-1.5 text-primary hover:underline"
          >
            <span className="min-w-0 break-words">Abrir o Gerenciador do WhatsApp Business</span>
            <ExternalLink className="size-3.5 shrink-0" aria-hidden />
          </a>
        </CardContent>
      </Card>
    </div>
  );
}

/** O que a tela precisa do estado da conexão. */
type StatusData = {
  enabled: boolean;
  phoneNumberId: string | null;
  healthOk: boolean | null;
  healthReason: string | null;
  healthCheckedAt: Date | string | null;
};

/** Estado da conexão: qual número, saúde da última verificação, liga/desliga. */
function ConnectionStatus({
  status,
  onToggle,
  pending,
}: {
  status: StatusData;
  onToggle: (enabled: boolean) => void;
  pending: boolean;
}) {
  const quebrada = status.healthOk === false;

  return (
    <Card className={quebrada ? "border-destructive/50" : undefined}>
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-2 text-base">
          {quebrada ? (
            <AlertTriangle className="size-5 shrink-0 text-destructive" aria-hidden />
          ) : (
            <CheckCircle2 className="size-5 shrink-0 text-primary" aria-hidden />
          )}
          <span className="min-w-0 break-words">
            {quebrada ? "A conexão parou de funcionar" : "WhatsApp conectado"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-muted-foreground">ID do número</dt>
            <dd className="min-w-0 break-words font-medium tabular-nums">
              {status.phoneNumberId ?? "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Última verificação</dt>
            <dd className="min-w-0 break-words font-medium">
              {status.healthCheckedAt
                ? new Date(status.healthCheckedAt).toLocaleString("pt-BR")
                : "ainda não verificada"}
            </dd>
          </div>
        </dl>

        {quebrada && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" aria-hidden />
            <AlertDescription className="min-w-0 break-words">
              {healthReasonMessage(status.healthReason)}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex min-w-0 items-center justify-between gap-4 border-t border-border pt-4">
          <div className="min-w-0">
            <Label htmlFor="wa-enabled" className="font-medium">
              Enviar mensagens por esta conta
            </Label>
            <p className="mt-0.5 min-w-0 break-words text-xs text-muted-foreground">
              Desligado, as mensagens da loja voltam a sair pela conta da Arena Tech.
            </p>
          </div>
          <Switch
            id="wa-enabled"
            checked={status.enabled}
            disabled={pending}
            onCheckedChange={onToggle}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Traduz o motivo técnico gravado pela verificação periódica. A tela não pode
 * mostrar `invalid_token` — o dono da loja não sabe o que fazer com isso.
 */
function healthReasonMessage(reason: string | null): string {
  const mensagens: Record<string, string> = {
    invalid_token:
      "O token não é mais aceito pela Meta. Ele pode ter expirado ou sido revogado — gere um token permanente novo e salve aqui.",
    phone_number_not_found:
      "A Meta não encontra mais esse ID de número. Confira o ID no painel da Meta.",
    phone_not_verified:
      "O número perdeu a verificação na Meta. Conclua a verificação no painel da Meta.",
  };
  return (
    mensagens[reason ?? ""] ??
    "A Meta recusou a última verificação. Confira o token e o ID do número."
  );
}

function TestFeedback({ result }: { result: TestResult }) {
  if (result.ok) {
    return (
      <Alert>
        <CheckCircle2 className="size-4" aria-hidden />
        <AlertDescription className="min-w-0 break-words">
          Conexão funcionando
          {result.verifiedName ? ` — ${result.verifiedName}` : ""}
          {result.displayPhoneNumber ? ` (${result.displayPhoneNumber})` : ""}.
          {" "}Confira se é o número certo antes de salvar.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="destructive">
      <AlertTriangle className="size-4" aria-hidden />
      <AlertDescription className="min-w-0 break-words">{result.message}</AlertDescription>
    </Alert>
  );
}
