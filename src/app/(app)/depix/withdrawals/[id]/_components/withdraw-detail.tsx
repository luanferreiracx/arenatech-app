"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/domain/status-badge";
import { LoadingState } from "@/components/domain/loading-state";
import { PIX_KEY_TYPE_LABELS } from "@/lib/validators/depix-withdraw";
import { RefreshCw, Plus, ArrowLeft, User, Calendar, Edit, Printer } from "lucide-react";

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

const STATUS_VARIANT: Record<string, "default" | "warning" | "success" | "destructive" | "info"> = {
  PENDING: "warning",
  PROCESSING: "info",
  SENT: "success",
  FAILED: "destructive",
  CANCELLED: "default",
};

interface WithdrawDetailProps {
  id: string;
}

export function WithdrawDetail({ id }: WithdrawDetailProps) {
  const trpc = useTRPC();
  const query = useQuery(trpc.depixWithdraw.getById.queryOptions({ id }));

  if (query.isLoading) return <LoadingState />;
  if (!query.data) return <div className="text-center text-muted-foreground py-12">Saque nao encontrado.</div>;

  const w = query.data;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
      {/* Main */}
      <div className="space-y-6">
        {/* Status */}
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold">Saque #{w.number}</h2>
          <StatusBadge variant={STATUS_VARIANT[w.status] ?? "default"}>
            {w.statusLabel}
          </StatusBadge>
        </div>

        {/* PIX Key Details */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-4">Chave PIX Destino</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase">Tipo de Chave</p>
              <span className="text-sm font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded">
                {PIX_KEY_TYPE_LABELS[w.pixKeyType] ?? w.pixKeyType}
              </span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Chave PIX</p>
              <p className="font-mono text-sm break-all">{w.pixKey}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase">Destinatario</p>
              <p className="text-sm font-medium">{w.recipientName ?? "-"}</p>
            </div>
            {w.recipientTaxId && (
              <div>
                <p className="text-xs text-muted-foreground uppercase">CPF/CNPJ Destinatario</p>
                <p className="font-mono text-sm">{w.recipientTaxId}</p>
              </div>
            )}
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground uppercase">Observacao</p>
              <p className="text-sm whitespace-pre-line">{w.notes ?? "-"}</p>
            </div>
          </div>
        </Card>

        {/* Transaction Data */}
        {w.depixId && (
          <Card className="p-6">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-4">Dados da Transacao</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground uppercase">ID DePix</p>
                <p className="font-mono text-xs text-muted-foreground break-all">{w.depixId}</p>
              </div>
              {w.depositAddress && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Deposit Address</p>
                  <p className="font-mono text-xs text-muted-foreground break-all">{w.depositAddress}</p>
                </div>
              )}
              {w.blockchainTxId && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Blockchain TX ID</p>
                  <p className="font-mono text-xs text-success break-all">{w.blockchainTxId}</p>
                </div>
              )}
              {w.expiration && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Expiracao</p>
                  <p className="text-sm text-warning">{formatDate(w.expiration)}</p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Polling indicator */}
        {(w.status === "PENDING" || w.status === "PROCESSING") && (
          <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/15 rounded-lg text-sm text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span>Status sera atualizado automaticamente via webhook.</span>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        {/* Values */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-4">Valores</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Valor Solicitado</span>
              <span className="font-medium">{formatCurrency(w.requestedAmount)}</span>
            </div>
            {w.fee != null && w.fee > 0 && (
              <div className="flex justify-between text-sm text-destructive">
                <span>Taxa</span>
                <span className="font-medium">+ {formatCurrency(w.fee)}</span>
              </div>
            )}
            {w.depositAmount != null && (
              <div className="flex justify-between text-sm text-warning font-semibold">
                <span>Total a Enviar</span>
                <span>{formatCurrency(w.depositAmount)}</span>
              </div>
            )}
            {w.receivedAmount != null && (
              <div className="flex justify-between text-sm text-success">
                <span>Valor Recebido (PIX)</span>
                <span className="font-medium">{formatCurrency(w.receivedAmount)}</span>
              </div>
            )}
            <div className="border-t pt-3 flex justify-between items-baseline">
              <span className="font-semibold">Valor do Saque</span>
              <span className="text-2xl font-bold text-primary">{formatCurrency(w.requestedAmount)}</span>
            </div>
          </div>
        </Card>

        {/* Actions */}
        <Card className="p-4 space-y-2">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-2">Acoes</h3>
          {w.status === "SENT" && (
            <Button
              variant="outline"
              className="w-full justify-center"
              onClick={() => window.open(`/api/depix/withdrawals/${id}/comprovante`, "_blank")}
            >
              <Printer className="w-4 h-4 mr-2" />
              Comprovante
            </Button>
          )}
          <Button variant="outline" className="w-full justify-center" asChild>
            <Link href={`/depix/withdrawals/new?pixKeyType=${w.pixKeyType}&pixKey=${encodeURIComponent(w.pixKey)}&recipientName=${encodeURIComponent(w.recipientName ?? "")}`}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Repetir Saque
            </Link>
          </Button>
          <Button variant="outline" className="w-full justify-center" asChild>
            <Link href="/depix/withdrawals/new">
              <Plus className="w-4 h-4 mr-2" />
              Novo Saque
            </Link>
          </Button>
          <Button variant="secondary" className="w-full justify-center" asChild>
            <Link href="/depix/withdrawals">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar para Lista
            </Link>
          </Button>
        </Card>

        {/* Metadata */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-xs">
          <p className="uppercase font-semibold text-muted-foreground tracking-wider">Registro</p>
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="w-3 h-3" />
            <span>Por: <strong className="text-foreground">{w.userName ?? "Sistema"}</strong></span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-3 h-3" />
            <span>Em: <strong className="text-foreground">{formatDate(w.createdAt)}</strong></span>
          </div>
          {w.updatedAt !== w.createdAt && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Edit className="w-3 h-3" />
              <span>Atualizado: <strong className="text-foreground">{formatDate(w.updatedAt)}</strong></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
