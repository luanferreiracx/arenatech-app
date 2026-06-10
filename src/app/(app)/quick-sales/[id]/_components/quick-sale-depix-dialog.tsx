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

interface Props {
  open: boolean;
  quickSaleId: string;
  totalCents: number;
  /** CPF/CNPJ ja salvo na venda (se houver). */
  buyerTaxId?: string | null;
  /** Transacao wallet canonica. */
  existingWalletTransactionId?: string | null;
  /** Se a venda ja tem transactionId+QR persistidos, abre direto na tela do QR. */
  existingTransactionId?: string | null;
  existingQrCode?: string | null;
  existingQrCodeBase64?: string | null;
  onClose: () => void;
  /** Chamado quando o pagamento confirmar via polling. */
  onPaid: () => void;
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Dialog para gerar/exibir QR PIX DePix de uma venda avulsa.
 * Faz polling de status a cada 4s ate confirmar pagamento. Paridade com
 * o DepixQrDialog do PDV (sale.generatePix).
 */
export function QuickSaleDepixDialog({
  open,
  quickSaleId,
  totalCents,
  buyerTaxId,
  existingWalletTransactionId,
  existingTransactionId,
  existingQrCode,
  existingQrCodeBase64,
  onClose,
  onPaid,
}: Props) {
  const trpc = useTRPC();
  const [walletTransactionId, setWalletTransactionId] = useState<string | null>(existingWalletTransactionId ?? null);
  const [transactionId, setTransactionId] = useState<string | null>(existingTransactionId ?? null);
  const [qrCode, setQrCode] = useState<string | null>(existingQrCode ?? null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(existingQrCodeBase64 ?? null);
  const [status, setStatus] = useState<"pending" | "paid" | "failed">("pending");
  const paidFiredRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    paidFiredRef.current = false;
  }, [open]);

  const requiresTaxId = totalCents >= 50_000;
  const existingTaxId = (buyerTaxId ?? "").replace(/\D/g, "");
  const hasValidExisting = existingTaxId.length === 11 || existingTaxId.length === 14;
  const needsTaxIdPrompt = requiresTaxId && !hasValidExisting && !transactionId;
  const [taxIdInput, setTaxIdInput] = useState("");
  const [taxIdConfirmed, setTaxIdConfirmed] = useState(!needsTaxIdPrompt);

  const generateMutation = useMutation(trpc.quickSale.generatePix.mutationOptions());
  const checkStatusMutation = useMutation(trpc.quickSale.checkPixStatus.mutationOptions());

  // Gera o PIX assim que abrir (apos confirmar tax id se necessario)
  useEffect(() => {
    if (!open || transactionId || !taxIdConfirmed) return;
    const taxId = hasValidExisting ? existingTaxId : taxIdInput.replace(/\D/g, "");
    generateMutation.mutate(
      { id: quickSaleId, taxId: taxId || undefined },
      {
        onSuccess: (res) => {
          if (!res.transactionId) {
            toast.error("Erro ao gerar PIX: sem id");
            onClose();
            return;
          }
          setWalletTransactionId(res.walletTransactionId ?? null);
          setTransactionId(res.transactionId ?? null);
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

  // SSE em tempo real (webhook -> pg_notify -> SSE) + polling fallback 30s.
  useEffect(() => {
    if (!walletTransactionId && !transactionId) return;

    const confirmPaid = () => {
      if (paidFiredRef.current) return;
      paidFiredRef.current = true;
      setStatus("paid");
      toast.success("Pagamento confirmado!");
      // SSE e polling podem confirmar quase juntos; sem esse guard, onPaid podia
      // invalidar queries/fechar modal duas vezes.
      onPaid();
    };

    const es = new EventSource(`/api/sse/quick-sale/${quickSaleId}`);
    es.addEventListener("paid", () => {
      confirmPaid();
      es.close();
    });
    es.onerror = () => {
      // Polling abaixo cobre.
    };

    const interval = setInterval(() => {
      checkStatusMutation.mutate(
        { id: quickSaleId, transactionId: transactionId ?? walletTransactionId!, walletTransactionId },
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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
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
              Para PIX a partir de <strong>R$ 500,00</strong>, e obrigatorio
              informar o CPF/CNPJ do pagador (exigencia anti-fraude da PixPay).
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
              <Button variant="outline" onClick={onClose}>
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
            <Button variant="outline" className="w-full" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
