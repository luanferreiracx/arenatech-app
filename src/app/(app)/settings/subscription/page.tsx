"use client";

import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { StatusBadge } from "@/components/domain/status-badge";
import {
  TENANT_STATUS_LABELS,
  TENANT_STATUS_VARIANT,
} from "@/lib/validators/admin";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export default function SubscriptionPage() {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.settings.getSubscription.queryOptions());

  if (isLoading) return <LoadingState />;
  if (!data) return <p className="text-muted-foreground">Dados nao encontrados</p>;

  return (
    <div>
      <PageHeader title="Assinatura" subtitle="Status do plano e assinatura da loja" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        {/* Plano Atual */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Plano Atual</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="text-2xl font-bold text-primary">{data.planName}</div>
            <div className="text-3xl font-bold">
              {formatCents(data.planPrice)}
              <span className="text-sm text-muted-foreground font-normal">/mes</span>
            </div>
            <StatusBadge
              variant={TENANT_STATUS_VARIANT[data.status] ?? "default"}
            >{TENANT_STATUS_LABELS[data.status] ?? data.status}</StatusBadge>
            <div className="border-t pt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Limite de usuarios:</span>
                <strong>{data.maxUsers}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Consultas IMEI/mes:</span>
                <strong>{data.maxImeiQueries}</strong>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Info da Loja */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Informacoes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Loja:</span>
                <strong>{data.tenantName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <StatusBadge
                  variant={TENANT_STATUS_VARIANT[data.status] ?? "default"}
                >{TENANT_STATUS_LABELS[data.status] ?? data.status}</StatusBadge>
              </div>
            </div>
            <div className="border-t pt-4">
              <p className="text-sm text-muted-foreground">
                Para alterar o plano ou gerenciar a assinatura, entre em contato com o suporte Arena Tech.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
