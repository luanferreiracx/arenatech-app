"use client";

import { useMemo, useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/domain/status-badge";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { toast } from "@/lib/toast";
import {
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_VARIANT,
  BILLING_CYCLE_LABELS,
  type BillingCycle,
} from "@/lib/validators/subscription";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR");
}

/** Dias de atraso (>=1) se o vencimento já passou; caso contrário, null. */
function daysOverdue(periodEnd: string | Date | null | undefined): number | null {
  if (!periodEnd) return null;
  const diffMs = Date.now() - new Date(periodEnd).getTime();
  if (diffMs <= 0) return null;
  return Math.floor(diffMs / 86_400_000);
}

const BILLING_CYCLES: BillingCycle[] = ["MONTHLY", "YEARLY"];

export function SubscriptionPanel({ tenantId }: { tenantId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const subscriptionQuery = useQuery(trpc.admin.getSubscription.queryOptions({ tenantId }));
  const plansQuery = useQuery(trpc.admin.listPlans.queryOptions({ status: "ACTIVE" }));
  const activateMutation = useMutation(trpc.admin.activateSubscription.mutationOptions());
  const markPaidMutation = useMutation(trpc.admin.markSubscriptionPaid.mutationOptions());
  const suspendMutation = useMutation(trpc.admin.suspendSubscription.mutationOptions());

  const subscription = subscriptionQuery.data;
  const plans = useMemo(() => plansQuery.data ?? [], [plansQuery.data]);
  const isLoading = subscriptionQuery.isLoading || plansQuery.isLoading;

  const [planId, setPlanId] = useState<string | null>(null);
  const [cycle, setCycle] = useState<BillingCycle>("MONTHLY");
  const [amountReais, setAmountReais] = useState<string>("");
  const [confirm, setConfirm] = useState<null | "suspend" | "cancel">(null);
  const [asTrial, setAsTrial] = useState(false);
  // Vazio = usa o padrão global da plataforma. Preenchido = só este tenant.
  const [trialDaysInput, setTrialDaysInput] = useState<string>("");
  const [extendDaysInput, setExtendDaysInput] = useState<string>("7");

  const platformQuery = useQuery(trpc.admin.platformSettings.queryOptions());
  const extendTrialMutation = useMutation(trpc.admin.extendTrial.mutationOptions());
  const isTrialing = subscription?.status === "TRIALING";

  // Valor sugerido do plano no ciclo (preenche o placeholder do input).
  const selectedPlan = plans.find((plan) => plan.id === planId);
  const suggestedCents = selectedPlan
    ? cycle === "YEARLY"
      ? selectedPlan.yearlyPrice ?? selectedPlan.monthlyPrice * 12
      : selectedPlan.monthlyPrice
    : null;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.admin.getSubscription.queryKey({ tenantId }) });
    void queryClient.invalidateQueries({ queryKey: trpc.admin.getTenant.queryKey({ id: tenantId }) });
  };

  const onActivate = () => {
    if (!planId) {
      toast.error("Selecione um plano");
      return;
    }
    const parsed = amountReais.trim() === "" ? undefined : Math.round(Number(amountReais.replace(",", ".")) * 100);
    if (parsed !== undefined && (Number.isNaN(parsed) || parsed < 0)) {
      toast.error("Valor invalido");
      return;
    }
    const trialDays = trialDaysInput.trim() === "" ? undefined : Number(trialDaysInput);
    if (asTrial && trialDays !== undefined && (!Number.isInteger(trialDays) || trialDays < 1)) {
      toast.error("Dias de teste inválidos");
      return;
    }
    activateMutation.mutate(
      { tenantId, planId, billingCycle: cycle, amountCents: parsed, asTrial, trialDays },
      {
        onSuccess: (result) => {
          toast.success(
            result.status === "TRIALING"
              ? `Teste iniciado — termina em ${formatDate(result.currentPeriodEnd)}`
              : subscription
                ? "Assinatura atualizada"
                : "Tenant ativado",
          );
          setAmountReais("");
          invalidate();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const onExtendTrial = () => {
    const days = Number(extendDaysInput);
    if (!Number.isInteger(days) || days < 1) {
      toast.error("Informe quantos dias de teste a contar de hoje");
      return;
    }
    extendTrialMutation.mutate(
      { tenantId, daysFromNow: days },
      {
        onSuccess: (result) => {
          toast.success(`Teste vai até ${formatDate(result.trialEndsAt)}`);
          invalidate();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const onMarkPaid = () => {
    markPaidMutation.mutate(
      { tenantId },
      {
        onSuccess: (result) => {
          toast.success(`Pagamento registrado — vence em ${formatDate(result.currentPeriodEnd)}`);
          invalidate();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const onSuspendConfirm = () => {
    const cancel = confirm === "cancel";
    suspendMutation.mutate(
      { tenantId, cancel },
      {
        onSuccess: () => {
          toast.success(cancel ? "Assinatura cancelada" : "Assinatura suspensa");
          setConfirm(null);
          invalidate();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assinatura</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando assinatura…
          </p>
        )}
        {/* Estado atual */}
        {!isLoading && (subscription ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Situação</dt>
              <dd className="mt-1">
                <StatusBadge variant={SUBSCRIPTION_STATUS_VARIANT[subscription.status]}>
                  {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
                </StatusBadge>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Ciclo</dt>
              <dd className="mt-1 font-medium">{BILLING_CYCLE_LABELS[subscription.billingCycle]}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Valor</dt>
              <dd className="mt-1 font-medium">{formatCents(subscription.amountCents)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {subscription.status === "TRIALING" ? "Teste termina em" : "Vencimento"}
              </dt>
              <dd className="mt-1 font-medium">
                {formatDate(subscription.currentPeriodEnd)}
                {(() => {
                  const overdue = daysOverdue(subscription.currentPeriodEnd);
                  if (overdue === null || subscription.status === "CANCELLED") return null;
                  if (subscription.status === "TRIALING") return null;
                  return (
                    <span className="ml-1.5 text-xs font-normal text-warning">
                      (vencida há {overdue} {overdue === 1 ? "dia" : "dias"})
                    </span>
                  );
                })()}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            Tenant sem assinatura — sem plano, o acesso fica restrito à Carteira DePix. Escolha um plano
            abaixo para ativar e liberar os módulos.
          </p>
        ))}

        {/* Ativar / trocar plano */}
        <div className="space-y-4 rounded-md border p-4">
          <p className="text-sm font-medium">{subscription ? "Trocar plano / renovar" : "Ativar tenant"}</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="plano">Plano</Label>
              <Select value={planId ?? ""} onValueChange={setPlanId}>
                <SelectTrigger id="plano"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {plans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ciclo">Ciclo</Label>
              <Select value={cycle} onValueChange={(v) => setCycle(v as BillingCycle)}>
                <SelectTrigger id="ciclo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BILLING_CYCLES.map((value) => (
                    <SelectItem key={value} value={value}>{BILLING_CYCLE_LABELS[value]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="valor-r">Valor (R$)</Label>
              <Input id="valor-r"
                inputMode="decimal"
                placeholder={suggestedCents != null ? formatCents(suggestedCents) : "do plano"}
                value={amountReais}
                onChange={(e) => setAmountReais(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-3 rounded-md border border-dashed p-3">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={asTrial}
                onCheckedChange={(checked) => setAsTrial(checked === true)}
                className="mt-0.5"
                aria-label="Começar como teste grátis"
              />
              <span className="min-w-0">
                <span className="font-medium">Começar como teste grátis</span>
                <span className="block break-words text-xs text-muted-foreground">
                  Libera os módulos do plano sem cobrar. Não entra no MRR. Quando o teste acaba,
                  segue o caminho normal de vencimento.
                </span>
              </span>
            </label>
            {asTrial && (
              <div className="space-y-1.5 sm:max-w-56">
                <Label htmlFor="trial-days">Dias de teste</Label>
                <Input
                  id="trial-days"
                  inputMode="numeric"
                  placeholder={`padrão: ${platformQuery.data?.trialDays ?? 7}`}
                  value={trialDaysInput}
                  onChange={(e) => setTrialDaysInput(e.target.value)}
                />
                <p className="break-words text-xs text-muted-foreground">
                  Em branco usa o padrão global. Preenchido vale só para este tenant.
                </p>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Valor em branco usa o preço do plano no ciclo. Ativar aponta o tenant para o plano e libera
            os módulos correspondentes.
          </p>
          <Button type="button" onClick={onActivate} disabled={activateMutation.isPending}>
            {activateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {asTrial ? "Iniciar teste" : subscription ? "Salvar plano" : "Ativar tenant"}
          </Button>
        </div>

        {/* Estender o teste deste tenant — o controle "por tenant" do ADR 0061. */}
        {isTrialing && (
          <div className="flex flex-wrap items-end gap-3 rounded-md border border-info/40 bg-info/5 p-4">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="extend-days">Estender teste (dias a partir de hoje)</Label>
              <Input
                id="extend-days"
                inputMode="numeric"
                className="sm:w-40"
                value={extendDaysInput}
                onChange={(e) => setExtendDaysInput(e.target.value)}
              />
            </div>
            <Button type="button" variant="outline" onClick={onExtendTrial} disabled={extendTrialMutation.isPending}>
              {extendTrialMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Estender
            </Button>
            <p className="min-w-0 flex-1 break-words text-xs text-muted-foreground">
              Redefine o fim do teste para hoje + N dias. Não acumula com o prazo restante.
            </p>
          </div>
        )}

        {/* Ações de cobrança */}
        {subscription && subscription.status !== "CANCELLED" && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onMarkPaid} disabled={markPaidMutation.isPending}>
              {markPaidMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Marcar como pago
            </Button>
            <Button
              type="button"
              variant="outline"
              className="text-warning hover:text-warning"
              onClick={() => setConfirm("suspend")}
            >
              Suspender
            </Button>
            <Button
              type="button"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirm("cancel")}
            >
              Cancelar assinatura
            </Button>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => { if (!open && !suspendMutation.isPending) setConfirm(null); }}
        title={confirm === "cancel" ? "Cancelar assinatura" : "Suspender assinatura"}
        description={
          // Texto corrigido no ADR 0061: suspender deixou de derrubar o login.
          // O anterior ("login bloqueado") descrevia o comportamento antigo e
          // faria o superadmin evitar uma ação menos drástica do que ele pensa.
          confirm === "cancel"
            ? "O tenant sai: perde o login e a assinatura é cancelada. As API-keys de parceiro são revogadas. Para religar, ative um plano de novo."
            : "O tenant continua entrando, mas perde os módulos do plano e cai na tela de pagamento. Carteira DePix e API de parceiros seguem liberadas. Use para inadimplência."
        }
        confirmLabel={confirm === "cancel" ? "Cancelar assinatura" : "Suspender"}
        variant="destructive"
        onConfirm={onSuspendConfirm}
        isLoading={suspendMutation.isPending}
      />
    </Card>
  );
}
