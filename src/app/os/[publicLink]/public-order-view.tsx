"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/domain/status-badge";
import { LoadingState } from "@/components/domain/loading-state";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import {
  STATUS_LABELS,
  STATUS_VARIANTS,
  type ServiceOrderStatusValue,
} from "@/lib/validators/service-order";

interface Props {
  publicLink: string;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("pt-BR");
}

export function PublicOrderView({ publicLink }: Props) {
  const trpc = useTRPC();

  const { data: order, isLoading } = useQuery(
    trpc.serviceOrders.byPublicLink.queryOptions({ publicLink }),
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingState variant="card" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-lg font-semibold text-muted-foreground">
              Ordem de Serviço não encontrada
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              O link pode estar incorreto ou a OS pode ter sido removida.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const status = order.status as ServiceOrderStatusValue;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3">
            <span className="text-2xl font-bold tracking-wider text-primary">
              ARENA·TECH
            </span>
          </div>
          <CardTitle className="text-xl font-mono">{order.number}</CardTitle>
          <div className="flex justify-center mt-2">
            <StatusBadge variant={STATUS_VARIANTS[status]}>
              {STATUS_LABELS[status]}
            </StatusBadge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Device */}
          {(order.deviceType || order.deviceBrand || order.deviceModel) && (
            <div className="rounded-md border p-3 text-sm space-y-1">
              <p className="font-medium">Equipamento</p>
              <p className="text-muted-foreground">
                {[order.deviceType, order.deviceBrand, order.deviceModel]
                  .filter(Boolean)
                  .join(" — ")}
              </p>
            </div>
          )}

          {/* Dates */}
          <div className="grid gap-2 grid-cols-2 text-sm">
            <div className="rounded-md border p-3">
              <p className="text-muted-foreground text-xs">Data de entrada</p>
              <p className="font-medium">{formatDate(order.entryDate)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-muted-foreground text-xs">Previsão</p>
              <p className="font-medium">
                {formatDate(order.estimatedDate)}
              </p>
            </div>
            {order.completedDate && (
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground text-xs">Concluído em</p>
                <p className="font-medium">
                  {formatDate(order.completedDate)}
                </p>
              </div>
            )}
            {order.deliveredDate && (
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground text-xs">Entregue em</p>
                <p className="font-medium">
                  {formatDate(order.deliveredDate)}
                </p>
              </div>
            )}
          </div>

          {/* Customer notes */}
          {order.customerNotes && (
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium mb-1">Observações</p>
              <p className="text-muted-foreground whitespace-pre-line">
                {order.customerNotes}
              </p>
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground pt-2">
            Arena Tech — Assistência Técnica
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
