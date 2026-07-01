"use client";

import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { Copy, CheckCircle2, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";

interface DepixQrDialogProps {
  open: boolean;
  saleId: string;
  totalCents: number;
  /** CPF/CNPJ ja cadastrado no cliente (se houver). Quando vazio + valor >= R$ 500, pede ao operador. */
  customerTaxId?: string | null;
  onClose: () => void;
  /** Chamado quando o pagamento e confirmado pela API (status=paid). */
  onPaid: (ids: { walletTransactionId: string; transactionId: string | null }) => void;
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Modal que gera + exibe QR Code Depix para a venda. Recebe confirmacao em
 * tempo real via SSE e usa polling de 30s como fallback ate o pagamento ser
 * confirmado (ou usuario fechar).
 *
 * Paridade Laravel: `PdvController::gerarPixDepix` + tela `pdv/depix-qr.blade.php`.
 * `onPaid` significa apenas pagamento confirmado; o parent decide como concluir
 * a venda (PDV auto-finaliza via `sale.finalize`).
 */
export function DepixQrDialog({
  open,
  saleId,
  totalCents,
  customerTaxId,
  onClose,
  onPaid,
}: DepixQrDialogProps) {
  const trpc = useTRPC();
  const [walletTransactionId, setWalletTransactionId] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"pending" | "paid" | "failed">("pending");
  // Garante que onPaid seja agendado uma unica vez (SSE OU polling, nao ambos).
  const paidFiredRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    paidFiredRef.current = false;
  }, [open]);

  // Regra DePix: a Eulen exige CPF/CNPJ do pagador para qualquer valor
  // (mudanca 2026-06-30). Se o cliente nao tem cadastrado, pede ao operador.
  const requiresTaxId = true;
  const existingTaxId = (customerTaxId ?? "").replace(/\D/g, "");
  const hasValidExisting = existingTaxId.length === 11 || existingTaxId.length === 14;
  const needsTaxIdPrompt = requiresTaxId && !hasValidExisting;
  const [taxIdInput, setTaxIdInput] = useState("");
  const [taxIdConfirmed, setTaxIdConfirmed] = useState(!needsTaxIdPrompt);

  const generateMutation = useMutation(trpc.sale.generatePix.mutationOptions());
  const checkStatusMutation = useMutation(trpc.sale.checkPixStatus.mutationOptions());
  const cancelMutation = useMutation(trpc.sale.cancelPix.mutationOptions());

  // Cancela o QR: limpa a entry pendente do rascunho (server) e fecha. Fire-
  // and-forget — nao bloqueia o fechamento (cancelPixPayment expira sozinho).
  const handleCancel = () => {
    if (transactionId) {
      cancelMutation.mutate({ saleId, transactionId });
    }
    onClose();
  };

  // Gera o PIX assim que abrir (apos confirmar tax id se necessario)
  useEffect(() => {
    if (!open || transactionId || !taxIdConfirmed) return;
    const taxId = hasValidExisting ? existingTaxId : taxIdInput.replace(/\D/g, "");
    generateMutation.mutate(
      { saleId, taxId: taxId || undefined, amountCents: totalCents },
      {
        onSuccess: (res) => {
          if (!res.transactionId) {
            toast.error("Erro ao gerar PIX: sem id");
            onClose();
            return;
          }
          setWalletTransactionId(res.walletTransactionId ?? null);
          setTransactionId(res.transactionId ?? res.walletTransactionId ?? null);
          setQrCode(res.qrCode ?? null);
          setQrImageUrl(res.qrCodeBase64 ?? null);
        },
        onError: (err) => {
          toast.error(`Erro ao gerar PIX: ${err.message}`);
          onClose();
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, taxIdConfirmed]);

  const confirmTaxId = () => {
    const digits = taxIdInput.replace(/\D/g, "");
    if (digits.length !== 11 && digits.length !== 14) {
      toast.error("Informe um CPF (11 digitos) ou CNPJ (14 digitos) valido.");
      return;
    }
    setTaxIdConfirmed(true);
  };

  // SSE em tempo real (webhook PixPay -> pg_notify -> SSE -> aqui) + polling
  // fallback de 30s pra caso webhook falhe ou conexao SSE caia.
  useEffect(() => {
    if (!transactionId || status === "paid" || status === "failed") return;

    const confirmPaid = () => {
      // Idempotente: SSE e polling sao dois canais independentes de confirmacao.
      // Sem o guard, ambos disparavam onPaid e o leg DePix entrava 2x no carrinho.
      if (paidFiredRef.current) return;
      paidFiredRef.current = true;
      setStatus("paid");
      toast.success("Pagamento confirmado!");
      // Finaliza imediatamente no parent. Antes havia um setTimeout de 1.5s
      // guardado no cleanup deste effect; como setStatus("paid") reexecutava o
      // effect, o cleanup cancelava o timeout antes de chamar onPaid. Resultado:
      // a UI mostrava "Pagamento confirmado", mas a venda nao finalizava.
      onPaid({ walletTransactionId: walletTransactionId ?? transactionId, transactionId });
    };

    // 1) SSE: principal canal de confirmacao
    const es = new EventSource(`/api/sse/sale/${saleId}`);
    es.addEventListener("paid", () => {
      confirmPaid();
      es.close();
    });
    es.onerror = () => {
      // Falha silenciosa — polling abaixo cobre.
    };

    // 2) Polling fallback (30s)
    const interval = setInterval(() => {
      checkStatusMutation.mutate(
        { saleId, transactionId, walletTransactionId },
        {
          onSuccess: (res) => {
            if (res.status === "paid") {
              confirmPaid();
            } else if (res.status === "failed" || res.status === "expired") {
              setStatus("failed");
              toast.error(
                res.status === "expired" ? "PIX expirou" : "Pagamento falhou",
              );
            }
          },
        },
      );
    }, 30_000);
    return () => {
      es.close();
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletTransactionId, transactionId, status]);

  const copy = () => {
    if (!qrCode) return;
    navigator.clipboard.writeText(qrCode);
    toast.success("Codigo PIX copiado");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pagamento via DePix</DialogTitle>
          <DialogDescription>
            {formatCurrency(totalCents)}{" "}
            {status === "pending" && "— Aguardando pagamento..."}
            {status === "paid" && "— Pagamento confirmado!"}
            {status === "failed" && "— Falha"}
          </DialogDescription>
        </DialogHeader>

        {!taxIdConfirmed ? (
          <div className="space-y-3 py-2">
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 text-sm">
              Para gerar o PIX e <strong>obrigatorio</strong> informar o CPF/CNPJ
              do pagador (exigencia da Eulen).
            </div>
            <div className="space-y-1">
              <Label>CPF ou CNPJ do pagador *</Label>
              <Input
                value={taxIdInput}
                onChange={(e) => setTaxIdInput(e.target.value)}
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                inputMode="numeric"
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={handleCancel}>
                Cancelar
              </Button>
              <Button onClick={confirmTaxId}>Continuar</Button>
            </div>
          </div>
        ) : generateMutation.isPending || !qrCode ? (
          <div className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
          </div>
        ) : status === "paid" ? (
          <div className="py-8 flex flex-col items-center gap-3 text-green-500">
            <CheckCircle2 className="h-16 w-16" />
            <p className="text-lg font-semibold">Pagamento confirmado!</p>
            <p className="text-sm text-muted-foreground">Fechando...</p>
          </div>
        ) : status === "failed" ? (
          <div className="py-8 flex flex-col items-center gap-3 text-destructive">
            <X className="h-16 w-16" />
            <p className="text-lg font-semibold">Pagamento falhou</p>
            <Button variant="outline" onClick={onClose}>Fechar</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {qrImageUrl && (
              <div className="flex justify-center bg-white p-4 rounded-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrImageUrl}
                  alt="QR Code DePix"
                  style={{ maxWidth: 256, maxHeight: 256 }}
                />
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Pix copia e cola</p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={qrCode}
                  aria-label="Codigo PIX copia e cola"
                  className="flex-1 px-2 py-1 text-xs font-mono bg-muted rounded border border-border"
                />
                <Button type="button" variant="outline" size="sm" onClick={copy}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-500" />
              </span>
              Aguardando confirmacao do pagamento...
            </div>
            <Button variant="outline" className="w-full" onClick={handleCancel}>
              Cancelar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
