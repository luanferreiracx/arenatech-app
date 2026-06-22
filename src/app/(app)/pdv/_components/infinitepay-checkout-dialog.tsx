"use client";

import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { Copy, CheckCircle2, Loader2, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

interface InfinitepayCheckoutDialogProps {
  open: boolean;
  saleId: string;
  totalCents: number;
  onClose: () => void;
  /** Chamado quando o pagamento e confirmado (webhook revalidado). */
  onPaid: (info: { captureMethod: string | null }) => void;
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Modal que gera + exibe o checkout InfinitePay para a venda. O cliente
 * escaneia o QR (ou abre o link) e paga PIX/cartao na pagina da InfinitePay.
 * A confirmacao chega via SSE (webhook -> pg_notify -> SSE) com polling de 30s
 * como fallback. `onPaid` so significa pagamento confirmado; o parent decide
 * como concluir (o PDV auto-finaliza via sale.finalize). Espelha o DepixQrDialog.
 */
export function InfinitepayCheckoutDialog({
  open,
  saleId,
  totalCents,
  onClose,
  onPaid,
}: InfinitepayCheckoutDialogProps) {
  const trpc = useTRPC();
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"pending" | "paid">("pending");
  // Garante que onPaid seja agendado uma unica vez (SSE OU polling, nao ambos).
  const paidFiredRef = useRef(false);
  const generatedRef = useRef(false);

  const generateMutation = useMutation(trpc.sale.createInfinitepayLink.mutationOptions());
  const checkStatusMutation = useMutation(trpc.sale.checkInfinitepayStatus.mutationOptions());
  const cancelMutation = useMutation(trpc.sale.cancelInfinitepay.mutationOptions());

  useEffect(() => {
    if (!open) {
      paidFiredRef.current = false;
      generatedRef.current = false;
      return;
    }
  }, [open]);

  const handleCancel = () => {
    // Fire-and-forget: limpa o leg pendente do rascunho (so remove se ainda
    // pendente — nao apaga pagamento ja confirmado pelo webhook).
    cancelMutation.mutate({ saleId });
    onClose();
  };

  // Gera o link assim que abrir.
  useEffect(() => {
    if (!open || generatedRef.current) return;
    generatedRef.current = true;
    generateMutation.mutate(
      { saleId, amountCents: totalCents },
      {
        onSuccess: (res) => {
          setCheckoutUrl(res.url);
          setQrImageUrl(res.qrCodeBase64);
        },
        onError: (err) => {
          toast.error(`Erro ao gerar cobranca InfinitePay: ${err.message}`);
          onClose();
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // SSE em tempo real (webhook -> pg_notify -> SSE) + polling fallback de 30s.
  useEffect(() => {
    if (!checkoutUrl || status === "paid") return;

    const confirmPaid = (captureMethod: string | null) => {
      if (paidFiredRef.current) return;
      paidFiredRef.current = true;
      setStatus("paid");
      toast.success("Pagamento confirmado!");
      onPaid({ captureMethod });
    };

    const es = new EventSource(`/api/sse/sale/${saleId}`);
    es.addEventListener("paid", () => {
      confirmPaid(null);
      es.close();
    });
    es.onerror = () => {
      // Falha silenciosa — polling abaixo cobre.
    };

    const interval = setInterval(() => {
      checkStatusMutation.mutate(
        { saleId },
        {
          onSuccess: (res) => {
            if (res.status === "paid") confirmPaid(res.captureMethod);
          },
        },
      );
    }, 30_000);

    return () => {
      es.close();
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutUrl, status]);

  const copy = () => {
    if (!checkoutUrl) return;
    navigator.clipboard.writeText(checkoutUrl);
    toast.success("Link de pagamento copiado");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pagamento via InfinitePay</DialogTitle>
          <DialogDescription>
            {formatCurrency(totalCents)}{" "}
            {status === "pending" && "— Aguardando pagamento..."}
            {status === "paid" && "— Pagamento confirmado!"}
          </DialogDescription>
        </DialogHeader>

        {generateMutation.isPending || !checkoutUrl ? (
          <div className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Gerando cobranca...</p>
          </div>
        ) : status === "paid" ? (
          <div className="py-8 flex flex-col items-center gap-3 text-green-500">
            <CheckCircle2 className="h-16 w-16" />
            <p className="text-lg font-semibold">Pagamento confirmado!</p>
            <p className="text-sm text-muted-foreground">Fechando...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {qrImageUrl && (
              <div className="flex justify-center bg-white p-4 rounded-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrImageUrl}
                  alt="QR Code de pagamento InfinitePay"
                  style={{ maxWidth: 256, maxHeight: 256 }}
                />
              </div>
            )}
            <p className="text-center text-xs text-muted-foreground">
              O cliente escaneia o QR e paga via PIX ou cartao na pagina da
              InfinitePay.
            </p>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm" className="flex-1">
                <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1 h-3 w-3" /> Abrir link
                </a>
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={copy}>
                <Copy className="h-3 w-3" />
              </Button>
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
