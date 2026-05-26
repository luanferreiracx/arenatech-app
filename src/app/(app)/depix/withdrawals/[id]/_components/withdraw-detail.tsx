"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/domain/status-badge";
import { LoadingState } from "@/components/domain/loading-state";
import { PIX_KEY_TYPE_LABELS } from "@/lib/validators/depix-withdraw";
import { RefreshCw, Plus, ArrowLeft, User, Calendar, Edit, Printer, Copy } from "lucide-react";
import { toast } from "@/lib/toast";

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
  const queryClient = useQueryClient();

  // Polling enquanto status nao for terminal. Paridade Laravel
  // show.blade.php que pollava /saques-depix/{id}/status via AJAX.
  // Webhook tambem atualiza, mas o polling cobre o caso de retry/atraso.
  const query = useQuery({
    ...trpc.depixWithdraw.getById.queryOptions({ id }),
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (!status || status === "PENDING" || status === "PROCESSING") {
        return 5000; // 5s
      }
      return false;
    },
    refetchIntervalInBackground: false,
  });

  // checkStatus consulta a API DePix diretamente. Roda a cada 15s enquanto
  // saque nao chega em estado final — backup pro webhook caso ele atrase.
  const checkStatusMutation = useMutation(
    trpc.depixWithdraw.checkStatus.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [["depixWithdraw"]] });
      },
    }),
  );

  useEffect(() => {
    const status = query.data?.status;
    if (status !== "PENDING" && status !== "PROCESSING") return;
    const t = setInterval(() => {
      if (checkStatusMutation.isPending) return;
      checkStatusMutation.mutate({ id });
    }, 15000);
    return () => clearInterval(t);
  }, [query.data?.status, id, checkStatusMutation]);

  if (query.isLoading) return <LoadingState />;
  if (!query.data) return <div className="text-center text-muted-foreground py-12">Saque nao encontrado.</div>;

  const w = query.data;
  const isPolling = w.status === "PENDING" || w.status === "PROCESSING";

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
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground uppercase">
                    Endereco Liquid para Deposito
                  </p>
                  {w.depositAddressQr && (
                    <div className="flex flex-col items-center gap-2 py-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={w.depositAddressQr}
                        alt="QR Code do endereco de deposito Liquid"
                        className="w-48 h-48 rounded-md border border-border bg-white p-2"
                      />
                      <p className="text-xs text-muted-foreground text-center max-w-xs">
                        Escaneie o QR ou copie o endereco abaixo para enviar o DePix
                      </p>
                    </div>
                  )}
                  <div className="flex items-start gap-2 p-2 bg-muted/30 rounded border border-border">
                    <p className="font-mono text-xs break-all flex-1 select-all">
                      {w.depositAddress}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(w.depositAddress ?? "");
                        toast.success("Endereco copiado!");
                      }}
                      className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                    >
                      Copiar
                    </button>
                  </div>
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
        {isPolling && (
          <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/15 rounded-lg text-sm text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span>
              Verificando status automaticamente
              {checkStatusMutation.isPending ? " (consultando DePix...)" : ""}
              ...
            </span>
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        {/* Total a Enviar — destaque maximo enquanto saque nao foi enviado.
            Eh o valor que o operador precisa enviar pra carteira DePix. */}
        {w.depositAmount != null && isPolling && (
          <Card className="p-6 border-2 border-warning bg-warning/5">
            <p className="text-xs uppercase font-semibold text-warning-foreground/80 tracking-wider mb-2">
              Enviar para a carteira DePix
            </p>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-3xl font-bold text-warning-foreground">
                {formatCurrency(w.depositAmount)}
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(
                    String((w.depositAmount ?? 0).toFixed(2)).replace(".", ","),
                  );
                  toast.success("Valor copiado!");
                }}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-warning text-warning-foreground hover:opacity-90"
              >
                <Copy className="w-3 h-3" /> Copiar
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Use exatamente este valor — taxa do gateway ja inclusa
            </p>
          </Card>
        )}

        {/* Resumo */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-4">Resumo</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Valor do Saque</span>
              <span className="font-medium">{formatCurrency(w.requestedAmount)}</span>
            </div>
            {w.fee != null && w.fee > 0 && (
              <div className="flex justify-between text-sm text-destructive">
                <span>Taxa</span>
                <span className="font-medium">+ {formatCurrency(w.fee)}</span>
              </div>
            )}
            {w.depositAmount != null && (
              <div className="flex justify-between text-sm text-warning font-semibold border-t pt-2 mt-2">
                <span>Total a Enviar</span>
                <span>{formatCurrency(w.depositAmount)}</span>
              </div>
            )}
            {w.receivedAmount != null && (
              <div className="flex justify-between text-sm text-success border-t pt-2 mt-2">
                <span>Recebido (PIX)</span>
                <span className="font-medium">{formatCurrency(w.receivedAmount)}</span>
              </div>
            )}
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
