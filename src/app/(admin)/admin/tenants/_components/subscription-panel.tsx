"use client";

import { useMemo, useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    activateMutation.mutate(
      { tenantId, planId, billingCycle: cycle, amountCents: parsed },
      {
        onSuccess: () => {
          toast.success(subscription ? "Assinatura atualizada" : "Tenant ativado");
          setAmountReais("");
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
              <dt className="text-muted-foreground">Vencimento</dt>
              <dd className="mt-1 font-medium">{formatDate(subscription.currentPeriodEnd)}</dd>
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
              <Label>Plano</Label>
              <Select value={planId ?? ""} onValueChange={setPlanId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {plans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ciclo</Label>
              <Select value={cycle} onValueChange={(v) => setCycle(v as BillingCycle)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BILLING_CYCLES.map((value) => (
                    <SelectItem key={value} value={value}>{BILLING_CYCLE_LABELS[value]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor (R$)</Label>
              <Input
                inputMode="decimal"
                placeholder={suggestedCents != null ? formatCents(suggestedCents) : "do plano"}
                value={amountReais}
                onChange={(e) => setAmountReais(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Valor em branco usa o preço do plano no ciclo. Ativar aponta o tenant para o plano e libera
            os módulos correspondentes.
          </p>
          <Button type="button" onClick={onActivate} disabled={activateMutation.isPending}>
            {activateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {subscription ? "Salvar plano" : "Ativar tenant"}
          </Button>
        </div>

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
          confirm === "cancel"
            ? "O tenant perde acesso (login bloqueado) e a assinatura é cancelada. Para religar, ative um plano de novo."
            : "O tenant perde acesso (login bloqueado) até você marcar como pago ou reativar. Use para inadimplência."
        }
        confirmLabel={confirm === "cancel" ? "Cancelar assinatura" : "Suspender"}
        variant="destructive"
        onConfirm={onSuspendConfirm}
        isLoading={suspendMutation.isPending}
      />
    </Card>
  );
}
