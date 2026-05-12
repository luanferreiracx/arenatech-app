"use client";

import { use } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, Clock, FileText, Wrench } from "lucide-react";
import { StatusBadge } from "@/components/domain/status-badge";
import {
  SERVICE_ORDER_STATUS_LABELS,
  SERVICE_ORDER_STATUS_VARIANT,
  STATUS_FLOW,
  type ServiceOrderStatus,
} from "@/lib/validators/service-order";

function formatMoney(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function PublicOrderPage({
  params,
}: {
  params: Promise<{ publicLink: string }>;
}) {
  const { publicLink } = use(params);
  const trpc = useTRPC();

  const orderQuery = useQuery(
    trpc.serviceOrder.byPublicLink.queryOptions({ link: publicLink })
  );
  const isLoading = orderQuery.isLoading;
  const error = orderQuery.error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const order = orderQuery.data as any;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">OS nao encontrada</h1>
          <p className="text-muted-foreground">O link pode estar incorreto ou a OS foi removida.</p>
        </div>
      </div>
    );
  }

  const status = order.status as ServiceOrderStatus;
  const currentIndex = STATUS_FLOW.indexOf(status);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary mb-1">{order.tenantName}</h1>
          <p className="text-muted-foreground">Acompanhamento de Ordem de Servico</p>
        </div>

        {/* OS Info Card */}
        <div className="rounded-lg border border-border bg-card p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold font-mono">{order.number}</h2>
            <StatusBadge variant={SERVICE_ORDER_STATUS_VARIANT[status]} className="text-sm">
              {SERVICE_ORDER_STATUS_LABELS[status]}
            </StatusBadge>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Cliente</p>
              <p className="font-medium">{order.customerName}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Equipamento</p>
              <p className="font-medium">{[order.deviceType, order.deviceModel].filter(Boolean).join(" ") || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Data de Entrada</p>
              <p>{format(new Date(order.entryDate), "dd/MM/yyyy")}</p>
            </div>
            {order.estimatedDate && (
              <div>
                <p className="text-muted-foreground">Previsao de Entrega</p>
                <p>{format(new Date(order.estimatedDate), "dd/MM/yyyy")}</p>
              </div>
            )}
          </div>
        </div>

        {/* Progress Stepper */}
        <div className="rounded-lg border border-border bg-card p-6 mb-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" />
            Progresso
          </h3>
          <div className="space-y-3">
            {STATUS_FLOW.map((s, i) => {
              const isCompleted = currentIndex >= 0 && i <= currentIndex;
              const isCurrent = i === currentIndex;
              return (
                <div key={s} className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      isCompleted
                        ? "bg-success text-white"
                        : "bg-muted text-muted-foreground"
                    } ${isCurrent ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
                  >
                    {isCompleted ? <Check className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className={`text-sm ${isCurrent ? "font-semibold text-primary" : isCompleted ? "text-foreground" : "text-muted-foreground"}`}>
                    {SERVICE_ORDER_STATUS_LABELS[s]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Problem */}
        {order.reportedProblem && (
          <div className="rounded-lg border border-border bg-card p-6 mb-6">
            <h3 className="font-semibold mb-2">Problema Relatado</h3>
            <p className="text-sm text-muted-foreground">{order.reportedProblem}</p>
            {order.diagnosedProblem && (
              <div className="mt-3">
                <h4 className="font-medium text-sm">Diagnostico</h4>
                <p className="text-sm text-muted-foreground">{order.diagnosedProblem}</p>
              </div>
            )}
          </div>
        )}

        {/* Items */}
        {order.items.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-6 mb-6">
            <h3 className="font-semibold mb-3">Servicos e Pecas</h3>
            <div className="space-y-2">
              {order.items.map((item: { description: string; quantity: number; total: number }, i: number) => (
                <div key={i} className="flex justify-between text-sm py-1 border-b border-border last:border-b-0">
                  <span>{item.description} (x{item.quantity})</span>
                  <span className="font-mono">{formatMoney(item.total)}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold pt-2 border-t-2 border-primary">
                <span>Total</span>
                <span className="font-mono text-primary">{formatMoney(order.totalAmount)}</span>
              </div>
            </div>
          </div>
        )}

        {/* History */}
        {order.history.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Historico
            </h3>
            <div className="space-y-3">
              {order.history.map((h: { newStatus: string; notes: string | null; createdAt: Date }, i: number) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                  <div>
                    <span className="font-medium">
                      {SERVICE_ORDER_STATUS_LABELS[h.newStatus as ServiceOrderStatus] ?? h.newStatus}
                    </span>
                    <span className="text-muted-foreground ml-2">
                      {format(new Date(h.createdAt), "dd/MM/yyyy HH:mm")}
                    </span>
                    {h.notes && <p className="text-muted-foreground text-xs mt-0.5">{h.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-8 text-xs text-muted-foreground">
          <p>{order.tenantName} &mdash; Sistema de Gestao</p>
        </div>
      </div>
    </div>
  );
}
