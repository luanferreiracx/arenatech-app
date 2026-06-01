"use client";

import { use, useEffect } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  Printer,
  RefreshCw,
  Share2,
  XCircle,
} from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatBRL(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR");
}

type StatusTone = "pending" | "processing" | "success" | "warning" | "danger" | "muted";

const STATUS_TONE: Record<string, StatusTone> = {
  PENDING: "pending",
  PROCESSING: "processing",
  PROCESSING_FEE: "processing",
  COMPLETED: "success",
  COMPLETED_FEE_PENDING: "warning",
  FAILED: "danger",
  CANCELLED: "muted",
  EXPIRED: "muted",
};

const TONE_CLASSES: Record<StatusTone, { dot: string; chip: string }> = {
  pending: {
    dot: "bg-amber-500",
    chip: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30",
  },
  processing: {
    dot: "bg-sky-500",
    chip: "text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/30",
  },
  success: {
    dot: "bg-emerald-500",
    chip: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  },
  warning: {
    dot: "bg-amber-500",
    chip: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30",
  },
  danger: {
    dot: "bg-rose-500",
    chip: "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/30",
  },
  muted: {
    dot: "bg-muted-foreground",
    chip: "text-muted-foreground bg-muted/40 border-border",
  },
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
  const isCompleted = t.status === "COMPLETED";
  const isFailed = ["FAILED", "CANCELLED", "EXPIRED"].includes(t.status);
  const tone = STATUS_TONE[t.status] ?? "muted";
  const toneCls = TONE_CLASSES[tone];

  const explorerTxid = t.kind === "DEPOSIT" ? t.depositTxId : t.withdrawTxId;
  const explorerUrl = explorerTxid
    ? `https://blockstream.info/liquid/tx/${explorerTxid}`
    : null;

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const valueLabel = formatBRL(t.netAmountCents ?? t.grossAmountCents);
    const title = `${isDeposit ? "Recebimento" : "Saque"} PIX · ${t.number}`;
    const text = `${isDeposit ? "Recebi" : "Enviei"} ${valueLabel} via PIX · ${t.statusLabel}`;
    const canShare =
      typeof navigator !== "undefined" && typeof navigator.share === "function";
    try {
      if (canShare) {
        await navigator.share({ title, text, url });
        return;
      }
      await navigator.clipboard.writeText(`${title}\n${text}\n${url}`);
      toast.success("Link copiado!");
    } catch {
      // user cancelou share — silencia
    }
  };

  return (
    <div className="animate-in fade-in duration-300">
      <PageHeader
        title={
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon">
              <Link href="/depix-wallet" aria-label="Voltar">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <span className="font-mono text-sm sm:text-base">{t.number}</span>
          </div>
        }
      />

      {/* Hero status — gradiente, valor grande, chip de status */}
      <Card
        className={cn(
          "relative overflow-hidden mt-4 p-6 sm:p-8",
          isCompleted &&
            "bg-linear-to-br from-card via-card to-primary/[0.04] border-b-2 border-b-primary/30",
          isFailed && "bg-linear-to-br from-card via-card to-rose-500/[0.04]",
          !isCompleted && !isFailed && "bg-linear-to-br from-card via-card to-sky-500/[0.04]",
        )}
      >
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full blur-3xl",
            isCompleted && "bg-primary/5",
            isFailed && "bg-rose-500/5",
            !isCompleted && !isFailed && "bg-sky-500/5",
          )}
        />

        <div className="relative flex flex-col gap-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "h-11 w-11 rounded-full grid place-items-center shrink-0",
                  isDeposit
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-primary/10 text-primary",
                )}
              >
                {isDeposit ? (
                  <ArrowDownLeft className="h-5 w-5" />
                ) : (
                  <ArrowUpRight className="h-5 w-5" />
                )}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
                  {isDeposit ? "Recebimento PIX" : "Saque PIX"}
                </p>
                <div
                  className={cn(
                    "mt-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                    toneCls.chip,
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-1.5 w-1.5 rounded-full",
                      toneCls.dot,
                      (tone === "pending" || tone === "processing") && "animate-pulse",
                    )}
                  />
                  {t.statusLabel}
                </div>
              </div>
            </div>

            {/* Chip da rede */}
            <div className="inline-flex items-center gap-1.5 self-start rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
              Liquid Network · DePix
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1.5">
              {isDeposit ? "Voce recebe" : "Destinatario recebe"}
            </p>
            <p className="text-4xl sm:text-5xl font-mono font-bold tabular-nums">
              {formatBRL(t.netAmountCents ?? t.grossAmountCents)}
            </p>
            {!isDeposit && t.recipientName && (
              <p className="text-sm text-muted-foreground mt-1.5">
                para <span className="text-foreground font-medium">{t.recipientName}</span>
              </p>
            )}
          </div>

          {/* Acoes rapidas */}
          {isCompleted && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  window.open(`/api/depix-wallet/transactions/${id}/comprovante`, "_blank")
                }
              >
                <Printer className="h-3.5 w-3.5 mr-1.5" />
                Comprovante PDF
              </Button>
              <Button variant="outline" size="sm" onClick={handleShare}>
                <Share2 className="h-3.5 w-3.5 mr-1.5" />
                Compartilhar
              </Button>
              {explorerUrl && (
                <Button asChild variant="ghost" size="sm">
                  <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    Ver na blockchain
                  </a>
                </Button>
              )}
            </div>
          )}

          {!isFinal && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => checkStatus.mutate({ id })}
                disabled={checkStatus.isPending}
              >
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5 mr-1.5",
                    checkStatus.isPending && "animate-spin",
                  )}
                />
                Verificar status agora
              </Button>
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-4">
          {/* QR (so deposito + pending) */}
          {isDeposit && t.status === "PENDING" && t.qrCodeBase64 && (
            <Card className="p-6">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-4">
                Pague este QR PIX
              </h3>
              <div className="flex flex-col items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={t.qrCodeBase64}
                  alt="QR PIX"
                  className="w-64 h-64 border rounded-md bg-white p-2"
                />
                {t.qrCode && (
                  <div className="w-full">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                      Pix copia-e-cola
                    </p>
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
                        <Copy className="h-3 w-3" /> Copiar
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

          {/* Resumo financeiro */}
          <Card className="p-6">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-4">
              Resumo financeiro
            </h3>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between items-baseline">
                <dt className="text-muted-foreground">
                  {isDeposit ? "Valor pago pelo cliente" : "Debitado do saldo"}
                </dt>
                <dd className="font-mono tabular-nums font-semibold">
                  {formatBRL(t.grossAmountCents)}
                </dd>
              </div>
              <div className="flex justify-between items-baseline">
                <dt className="text-muted-foreground">Taxa Arena Tech</dt>
                <dd className="font-mono tabular-nums text-muted-foreground">
                  − {formatBRL(t.feeArenaTechCents)}
                </dd>
              </div>
              {t.feePixPayCents != null && (
                <div className="flex justify-between items-baseline">
                  <dt className="text-muted-foreground">Taxa PixPay</dt>
                  <dd className="font-mono tabular-nums text-muted-foreground">
                    − {formatBRL(t.feePixPayCents)}
                  </dd>
                </div>
              )}
              {t.netAmountCents != null && (
                <div className="flex justify-between items-baseline border-t border-border pt-3 mt-3">
                  <dt className="font-medium">
                    {isDeposit ? "Voce recebeu" : "Destinatario recebe"}
                  </dt>
                  <dd
                    className={cn(
                      "font-mono tabular-nums text-base font-bold",
                      isDeposit
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-foreground",
                    )}
                  >
                    {formatBRL(t.netAmountCents)}
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          {/* Destinatario (saque) */}
          {!isDeposit && (
            <Card className="p-6">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-4">
                Destinatario
              </h3>
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Tipo de chave</dt>
                  <dd className="font-medium">{t.pixKeyType}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Chave PIX</dt>
                  <dd className="font-mono text-xs break-all text-right max-w-[60%]">
                    {t.pixKey}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">CPF/CNPJ</dt>
                  <dd className="font-mono">{t.recipientTaxId}</dd>
                </div>
                {t.recipientName && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Nome</dt>
                    <dd className="font-medium">{t.recipientName}</dd>
                  </div>
                )}
              </dl>
            </Card>
          )}

          {/* Erro / Aviso */}
          {t.errorMessage && (
            <Card
              className={cn(
                "p-4 border",
                isFailed
                  ? "border-rose-500/30 bg-rose-500/5"
                  : "border-amber-500/30 bg-amber-500/5",
              )}
            >
              <div className="flex items-start gap-3">
                {isFailed ? (
                  <XCircle className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                )}
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
                    Aviso
                  </p>
                  <p className="text-sm">{t.errorMessage}</p>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar — detalhes tecnicos */}
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">
              Detalhes
            </h3>
            <dl className="space-y-3 text-xs">
              <div>
                <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">
                  Criado em
                </dt>
                <dd className="font-medium mt-0.5">{formatDate(t.createdAt)}</dd>
              </div>
              {t.completedAt && (
                <div>
                  <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">
                    Concluido em
                  </dt>
                  <dd className="font-medium mt-0.5">{formatDate(t.completedAt)}</dd>
                </div>
              )}
              {t.userName && (
                <div>
                  <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">
                    Operador
                  </dt>
                  <dd className="font-medium mt-0.5">{t.userName}</dd>
                </div>
              )}
              {explorerTxid && (
                <div>
                  <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">
                    TXID Liquid
                  </dt>
                  <dd className="font-mono break-all mt-0.5">
                    {explorerTxid.slice(0, 16)}…{explorerTxid.slice(-8)}
                  </dd>
                  {explorerUrl && (
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-1"
                    >
                      <ExternalLink className="h-3 w-3" /> Abrir no Blockstream
                    </a>
                  )}
                </div>
              )}
              {t.depositAddress && (
                <div>
                  <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">
                    Endereco do deposito
                  </dt>
                  <dd className="font-mono break-all mt-0.5">{t.depositAddress}</dd>
                </div>
              )}
              {t.pixpayDepixId && (
                <div>
                  <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">
                    ID PixPay
                  </dt>
                  <dd className="font-mono mt-0.5 text-[11px]">{t.pixpayDepixId}</dd>
                </div>
              )}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
