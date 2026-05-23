"use client";

import { useEffect, useState } from "react";
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
import { toast } from "@/lib/toast";

interface DepixQrDialogProps {
  open: boolean;
  saleId: string;
  totalCents: number;
  onClose: () => void;
  /** Chamado quando o pagamento e confirmado pela API (status=paid). */
  onPaid: (transactionId: string) => void;
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Modal que gera + exibe QR Code Depix para a venda. Faz polling do status
 * a cada 4s ate o pagamento ser confirmado (ou usuario fechar).
 *
 * Paridade Laravel: `PdvController::gerarPixDepix` + tela `pdv/depix-qr.blade.php`.
 */
export function DepixQrDialog({
  open,
  saleId,
  totalCents,
  onClose,
  onPaid,
}: DepixQrDialogProps) {
  const trpc = useTRPC();
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"pending" | "paid" | "failed">("pending");

  const generateMutation = useMutation(trpc.sale.generatePix.mutationOptions());
  const checkStatusMutation = useMutation(trpc.sale.checkPixStatus.mutationOptions());

  // Gera o PIX assim que abrir
  useEffect(() => {
    if (!open || transactionId) return;
    generateMutation.mutate(
      { saleId },
      {
        onSuccess: (res) => {
          if (!res.transactionId) {
            toast.error("Erro ao gerar PIX: sem id");
            onClose();
            return;
          }
          setTransactionId(res.transactionId);
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
  }, [open]);

  // Polling de status a cada 4s
  useEffect(() => {
    if (!transactionId || status === "paid" || status === "failed") return;
    const interval = setInterval(() => {
      checkStatusMutation.mutate(
        { saleId, transactionId },
        {
          onSuccess: (res) => {
            if (res.status === "paid") {
              setStatus("paid");
              toast.success("Pagamento confirmado!");
              setTimeout(() => onPaid(transactionId), 1500);
            } else if (res.status === "failed" || res.status === "expired") {
              setStatus("failed");
              toast.error(
                res.status === "expired" ? "PIX expirou" : "Pagamento falhou",
              );
            }
          },
        },
      );
    }, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId, status]);

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

        {generateMutation.isPending || !qrCode ? (
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
              Verificando pagamento a cada 4 segundos...
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
