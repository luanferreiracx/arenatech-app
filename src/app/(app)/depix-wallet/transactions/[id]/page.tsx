"use client";

import { use } from "react";
import Link from "next/link";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, Copy, ExternalLink, Printer, RefreshCw } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/domain/status-badge";

function formatBRL(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR");
}

const STATUS_VARIANT: Record<string, "default" | "warning" | "success" | "destructive" | "info"> = {
  PENDING: "warning",
  PROCESSING: "info",
  PROCESSING_FEE: "info",
  COMPLETED: "success",
  COMPLETED_FEE_PENDING: "warning",
  FAILED: "destructive",
  CANCELLED: "default",
  EXPIRED: "default",
};

export default function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const txQuery = useQuery({
    ...trpc.depixTransaction.getById.queryOptions({ id }),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      if (!s || ["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"].includes(s)) return false;
      return 5000;
    },
  });

  const checkStatus = useMutation(
    trpc.depixTransaction.checkStatus.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: [["depixTransaction"]] });
      },
    }),
  );

  // Polling adicional via checkStatus enquanto nao-terminal (busca PixPay/LWK).
  useEffect(() => {
    const s = txQuery.data?.status;
    if (!s || ["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"].includes(s)) return;
    const t = setInterval(() => {
      if (checkStatus.isPending) return;
      checkStatus.mutate({ id });
    }, 15000);
    return () => clearInterval(t);
  }, [txQuery.data?.status, id, checkStatus]);

  if (txQuery.isLoading) return <LoadingState />;
  const t = txQuery.data;
  if (!t) return <div className="text-center py-12 text-muted-foreground">Transacao nao encontrada</div>;

  const isDeposit = t.kind === "DEPOSIT";
  const isFinal = ["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"].includes(t.status);
  const explorerUrl = t.kind === "DEPOSIT" && t.depositTxId
    ? `https://blockstream.info/liquid/tx/${t.depositTxId}`
    : t.withdrawTxId
      ? `https://blockstream.info/liquid/tx/${t.withdrawTxId}`
      : null;

  return (
    <div>
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon">
              <Link href="/depix-wallet">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            {isDeposit ? <ArrowDownLeft className="h-5 w-5 text-success" /> : <ArrowUpRight className="h-5 w-5 text-destructive" />}
            <span className="font-mono">{t.number}</span>
            <StatusBadge variant={STATUS_VARIANT[t.status] ?? "default"}>{t.statusLabel}</StatusBadge>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-4">
          {/* QR (so deposito + pending) */}
          {isDeposit && t.status === "PENDING" && t.qrCodeBase64 && (
            <Card className="p-6">
              <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-4">
                Pague este QR PIX
              </h3>
              <div className="flex flex-col items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.qrCodeBase64} alt="QR PIX" className="w-64 h-64 border rounded-md bg-white p-2" />
                {t.qrCode && (
                  <div className="w-full">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Pix copia-e-cola</p>
                    <div className="flex items-start gap-2 p-2 bg-muted/30 rounded border">
                      <p className="font-mono text-xs break-all flex-1 select-all">{t.qrCode}</p>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(t.qrCode!);
                          toast.success("Codigo copiado!");
                        }}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                      >
                        <Copy className="w-3 h-3" /> Copiar
                      </button>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {t.expiresAt ? `Expira em ${formatDate(t.expiresAt)}` : ""}
                </p>
              </div>
            </Card>
          )}

          {/* Resumo */}
          <Card className="p-6">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-4">Resumo</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{isDeposit ? "Valor pago pelo cliente" : "Debitado do saldo"}</dt>
                <dd className="font-semibold tabular-nums">{formatBRL(t.grossAmountCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Taxa Arena Tech</dt>
                <dd className="tabular-nums">− {formatBRL(t.feeArenaTechCents)}</dd>
              </div>
              {t.feePixPayCents != null && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Taxa PixPay</dt>
                  <dd className="tabular-nums">− {formatBRL(t.feePixPayCents)}</dd>
                </div>
              )}
              {t.netAmountCents != null && (
                <div className="flex justify-between border-t pt-2 mt-2 font-semibold">
                  <dt>{isDeposit ? "Voce recebeu" : "Destinatario recebe"}</dt>
                  <dd className="tabular-nums">{formatBRL(t.netAmountCents)}</dd>
                </div>
              )}
            </dl>
          </Card>

          {/* Destinatario (saque) */}
          {!isDeposit && (
            <Card className="p-6">
              <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-4">Destinatario</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Tipo de chave</dt>
                  <dd>{t.pixKeyType}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Chave PIX</dt>
                  <dd className="font-mono text-xs break-all text-right">{t.pixKey}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">CPF/CNPJ</dt>
                  <dd className="font-mono">{t.recipientTaxId}</dd>
                </div>
                {t.recipientName && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Nome</dt>
                    <dd>{t.recipientName}</dd>
                  </div>
                )}
              </dl>
            </Card>
          )}

          {/* Erro */}
          {t.errorMessage && (
            <Card className="p-4 border-destructive/30 bg-destructive/5">
              <p className="text-xs uppercase tracking-wider text-destructive mb-1">Aviso</p>
              <p className="text-sm">{t.errorMessage}</p>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card className="p-4 space-y-2">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-2">Acoes</h3>
            {!isFinal && (
              <Button
                variant="outline"
                className="w-full justify-center"
                onClick={() => checkStatus.mutate({ id })}
                disabled={checkStatus.isPending}
              >
                <RefreshCw className={checkStatus.isPending ? "w-4 h-4 mr-2 animate-spin" : "w-4 h-4 mr-2"} />
                Verificar status
              </Button>
            )}
            {t.status === "COMPLETED" && (
              <Button
                variant="outline"
                className="w-full justify-center"
                onClick={() =>
                  window.open(`/api/depix-wallet/transactions/${id}/comprovante`, "_blank")
                }
              >
                <Printer className="w-4 h-4 mr-2" />
                Comprovante
              </Button>
            )}
            {explorerUrl && (
              <Button asChild variant="outline" className="w-full justify-center">
                <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Ver na blockchain
                </a>
              </Button>
            )}
          </Card>

          {/* Metadata */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-3">Detalhes</h3>
            <dl className="space-y-2 text-xs">
              <div>
                <dt className="text-muted-foreground uppercase tracking-wider">Criado em</dt>
                <dd>{formatDate(t.createdAt)}</dd>
              </div>
              {t.completedAt && (
                <div>
                  <dt className="text-muted-foreground uppercase tracking-wider">Concluido em</dt>
                  <dd>{formatDate(t.completedAt)}</dd>
                </div>
              )}
              {t.userName && (
                <div>
                  <dt className="text-muted-foreground uppercase tracking-wider">Operador</dt>
                  <dd>{t.userName}</dd>
                </div>
              )}
              {(t.depositTxId || t.withdrawTxId) && (
                <div>
                  <dt className="text-muted-foreground uppercase tracking-wider">TXID Liquid</dt>
                  <dd className="font-mono break-all">{t.depositTxId ?? t.withdrawTxId}</dd>
                </div>
              )}
              {t.depositAddress && (
                <div>
                  <dt className="text-muted-foreground uppercase tracking-wider">Endereco do deposito</dt>
                  <dd className="font-mono break-all">{t.depositAddress}</dd>
                </div>
              )}
              {t.pixpayDepixId && (
                <div>
                  <dt className="text-muted-foreground uppercase tracking-wider">ID PixPay</dt>
                  <dd className="font-mono">{t.pixpayDepixId}</dd>
                </div>
              )}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
