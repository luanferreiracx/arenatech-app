"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { StatusBadge } from "@/components/domain/status-badge";
import {
  TENANT_STATUS_LABELS,
  TENANT_STATUS_VARIANT,
} from "@/lib/validators/admin";
import {
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_VARIANT,
  type SubscriptionStatus,
} from "@/lib/validators/subscription";
import { SubscriptionPayDialog } from "./_components/subscription-pay-dialog";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR");
}

/** Dias de atraso (>=1) se o vencimento já passou; senão null. */
function daysOverdue(periodEnd: string | Date | null | undefined): number | null {
  if (!periodEnd) return null;
  const diffMs = Date.now() - new Date(periodEnd).getTime();
  if (diffMs <= 0) return null;
  return Math.floor(diffMs / 86_400_000);
}

export default function SubscriptionPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // `payKey` remonta o dialog a cada abertura → estado limpo sem effect de reset.
  const [payKey, setPayKey] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const { data, isLoading } = useQuery(trpc.settings.getSubscription.queryOptions());

  if (isLoading) return <LoadingState />;
  if (!data) return <p className="text-muted-foreground">Dados não encontrados</p>;

  const subscription = data.subscription;
  const overdue = daysOverdue(subscription?.currentPeriodEnd);
  const canPay = Boolean(subscription) && subscription!.status !== "CANCELLED" && subscription!.amountCents > 0;

  const onPaid = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.settings.getSubscription.queryKey() });
  };

  return (
    <div>
      <PageHeader title="Assinatura" subtitle="Plano, cobrança e status da sua loja" />

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Plano Atual */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Plano atual</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <div className="text-2xl font-bold text-primary">{data.planName}</div>
            <div className="text-3xl font-bold tabular-nums">
              {formatCents(data.planPrice)}
              <span className="text-sm font-normal text-muted-foreground">/mês</span>
            </div>
            <StatusBadge variant={TENANT_STATUS_VARIANT[data.status] ?? "default"}>
              {TENANT_STATUS_LABELS[data.status] ?? data.status}
            </StatusBadge>
            <div className="space-y-2 border-t pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Limite de usuários:</span>
                <strong>{data.maxUsers}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Consultas IMEI/mês:</span>
                <strong>{data.maxImeiQueries}</strong>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cobrança */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cobrança</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {subscription ? (
              <>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Situação:</span>
                    <StatusBadge variant={SUBSCRIPTION_STATUS_VARIANT[subscription.status as SubscriptionStatus] ?? "default"}>
                      {SUBSCRIPTION_STATUS_LABELS[subscription.status as SubscriptionStatus] ?? subscription.status}
                    </StatusBadge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valor:</span>
                    <strong className="tabular-nums">{formatCents(subscription.amountCents)}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Vencimento:</span>
                    <span className="text-right">
                      <strong>{formatDate(subscription.currentPeriodEnd)}</strong>
                      {overdue !== null && subscription.status !== "CANCELLED" && (
                        <span className="ml-1.5 text-xs font-normal text-warning">
                          (vencida há {overdue} {overdue === 1 ? "dia" : "dias"})
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {canPay && (
                  <Button
                    className="w-full"
                    onClick={() => {
                      setPayKey((k) => k + 1);
                      setPayOpen(true);
                    }}
                  >
                    Pagar assinatura
                  </Button>
                )}
                <p className="break-words text-xs text-muted-foreground">
                  O pagamento é via DePix (PIX). O QR é válido por 30 minutos; ao confirmar, sua
                  assinatura é renovada automaticamente.
                </p>
              </>
            ) : (
              <p className="break-words text-sm text-muted-foreground">
                Sua loja ainda não tem uma assinatura ativa. Para ativar um plano, entre em contato
                com o suporte Arena Tech.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {subscription && (
        <SubscriptionPayDialog
          key={payKey}
          open={payOpen}
          amountCents={subscription.amountCents}
          onClose={() => setPayOpen(false)}
          onPaid={onPaid}
        />
      )}
    </div>
  );
}
