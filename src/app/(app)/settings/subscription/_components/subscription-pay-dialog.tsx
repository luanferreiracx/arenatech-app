"use client";
import { formatCentsBRL as formatCurrency } from "@/lib/format";

import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, CheckCircle2, Loader2 } from "lucide-react";
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

type SubscriptionPayDialogProps = {
  open: boolean;
  amountCents: number;
  onClose: () => void;
  /** Chamado quando o pagamento é confirmado (para revalidar a assinatura). */
  onPaid: () => void;
};


/** mm:ss (ou "expirado") a partir de um vencimento absoluto. */
function countdownLabel(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  if (remainingMs <= 0) return "expirado";
  const totalSeconds = Math.floor(remainingMs / 1000);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/** mm:ss até `expiresAt`, ou null. Deriva o 1º valor sem effect (evita cascata). */
function useCountdown(expiresAt: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);
  // `now` força o recomputo a cada segundo; o label em si é puro.
  void now;
  return countdownLabel(expiresAt);
}

/**
 * Dialog de pagamento da assinatura via DePix (ADR 0058). Pede CPF/CNPJ do
 * pagador (exigência da Eulen), gera o QR (válido 30 min → conta central da
 * Arena) e faz polling do status até confirmar; a renovação em si é aplicada pelo
 * webhook. Modelado no DepixQrDialog do PDV, sem SSE (polling simples basta aqui).
 */
export function SubscriptionPayDialog({ open, amountCents, onClose, onPaid }: SubscriptionPayDialogProps) {
  const trpc = useTRPC();

  const [taxIdInput, setTaxIdInput] = useState("");
  const [taxIdConfirmed, setTaxIdConfirmed] = useState(false);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const paidFiredRef = useRef(false);

  const payMutation = useMutation(trpc.settings.paySubscription.mutationOptions());

  // O estado é resetado por REMONTAGEM (o parent troca a `key` a cada abertura),
  // não por effect — evita cascata de setState. Ver a página que renderiza o dialog.

  // Gera o QR assim que o CPF/CNPJ é confirmado.
  useEffect(() => {
    if (!open || !taxIdConfirmed || transactionId) return;
    payMutation.mutate(
      { payerTaxId: taxIdInput.replace(/\D/g, "") },
      {
        onSuccess: (res) => {
          setTransactionId(res.transactionId);
          setQrCode(res.qrCode);
          setQrImageUrl(res.qrCodeBase64 || null);
          setExpiresAt(res.expiresAt);
        },
        onError: (err) => {
          toast.error(err.message);
          setTaxIdConfirmed(false);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, taxIdConfirmed]);

  // Polling do status (a cada 5s) até confirmar.
  const statusQuery = useQuery({
    ...trpc.settings.subscriptionChargeStatus.queryOptions(
      { transactionId: transactionId ?? "" },
      { enabled: Boolean(transactionId) && !paid, refetchInterval: 5000 },
    ),
  });

  useEffect(() => {
    if (statusQuery.data?.paid && !paidFiredRef.current) {
      paidFiredRef.current = true;
      setPaid(true);
      toast.success("Pagamento confirmado! Assinatura renovada.");
      onPaid();
    }
  }, [statusQuery.data?.paid, onPaid]);

  const countdown = useCountdown(expiresAt);

  const confirmTaxId = () => {
    const digits = taxIdInput.replace(/\D/g, "");
    if (digits.length !== 11 && digits.length !== 14) {
      toast.error("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.");
      return;
    }
    setTaxIdConfirmed(true);
  };

  const copy = () => {
    if (!qrCode) return;
    void navigator.clipboard.writeText(qrCode);
    toast.success("Código PIX copiado");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pagar assinatura</DialogTitle>
          <DialogDescription>
            {formatCurrency(amountCents)}
            {paid ? " — pago" : taxIdConfirmed ? " — aguardando pagamento" : " — via DePix (PIX)"}
          </DialogDescription>
        </DialogHeader>

        {paid ? (
          <div className="flex flex-col items-center gap-3 py-8 text-success">
            <CheckCircle2 className="h-16 w-16" />
            <p className="text-lg font-semibold">Pagamento confirmado</p>
            <p className="text-sm text-muted-foreground">Sua assinatura foi renovada.</p>
            <Button variant="outline" onClick={onClose}>Fechar</Button>
          </div>
        ) : !taxIdConfirmed ? (
          <div className="space-y-3 py-2">
            <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm break-words">
              Para gerar o PIX é <strong>obrigatório</strong> informar o CPF/CNPJ do pagador (exigência da Eulen).
            </div>
            <div className="space-y-1.5">
              <Label>CPF ou CNPJ do pagador</Label>
              <Input
                value={taxIdInput}
                onChange={(e) => setTaxIdInput(e.target.value)}
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                inputMode="numeric"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={confirmTaxId}>Continuar</Button>
            </div>
          </div>
        ) : payMutation.isPending || !qrCode ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Gerando QR Code…</p>
          </div>
        ) : (
          <div className="space-y-4">
            {qrImageUrl && (
              <div className="flex justify-center rounded-md bg-white p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrImageUrl} alt="QR Code DePix da assinatura" className="size-64 max-w-full" />
              </div>
            )}
            <div className="min-w-0">
              <p className="mb-1 text-xs text-muted-foreground">Pix copia e cola</p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={qrCode}
                  aria-label="Código PIX copia e cola"
                  className="min-w-0 flex-1 truncate rounded border border-border bg-muted px-2 py-1 font-mono text-xs"
                />
                <Button type="button" variant="outline" size="sm" onClick={copy}>
                  <Copy className="size-3" />
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-warning opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-warning" />
                </span>
                Aguardando confirmação…
              </span>
              {countdown && (
                <span className={countdown === "expirado" ? "text-destructive" : "tabular-nums"}>
                  {countdown === "expirado" ? "QR expirado — gere outro" : `expira em ${countdown}`}
                </span>
              )}
            </div>
            <Button variant="outline" className="w-full" onClick={onClose}>Fechar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
