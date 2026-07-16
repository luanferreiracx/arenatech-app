"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

// Margem espelhando o backend (EXTERNAL_WITHDRAW_EULEN_MARGIN_MS): envie ANTES disto,
// senao o repasse nao cabe na janela da Eulen e o valor e devolvido.
const SEND_BY_MARGIN_MS = 5 * 60_000;

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function useCountdown(target: number | null): { label: string; expired: boolean } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (target == null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [target]);
  if (target == null) return { label: "—", expired: false };
  const ms = target - now;
  if (ms <= 0) return { label: "00:00", expired: true };
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return { label: `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`, expired: false };
}

/**
 * Saque externo em AWAITING_DEPOSIT: instrui o tenant a enviar EXATAMENTE o valor
 * (grossAmountCents) para o endereco de intermediacao. QR do endereco + copia-e-cola
 * + contagem regressiva ate o prazo seguro de envio.
 */
export function ExternalWithdrawDeposit({
  address,
  amountCents,
  expiresAt,
}: {
  address: string | null;
  amountCents: number;
  expiresAt: string | Date | null;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [copiedAmt, setCopiedAmt] = useState(false);

  const sendByTs = expiresAt ? new Date(expiresAt).getTime() - SEND_BY_MARGIN_MS : null;
  const { label: countdown, expired } = useCountdown(sendByTs);

  useEffect(() => {
    if (!address) return;
    let active = true;
    void (async () => {
      try {
        const QRCode = (await import("qrcode")).default;
        const url = await QRCode.toDataURL(address, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 512,
        });
        if (active) setQrDataUrl(url);
      } catch {
        // silencioso — o copia-e-cola do endereco ainda funciona
      }
    })();
    return () => {
      active = false;
    };
  }, [address]);

  function copyAddress() {
    if (!address) return;
    void navigator.clipboard.writeText(address);
    setCopiedAddr(true);
    toast.success("Endereço copiado");
    window.setTimeout(() => setCopiedAddr(false), 2000);
  }
  function copyAmount() {
    void navigator.clipboard.writeText((amountCents / 100).toFixed(2));
    setCopiedAmt(true);
    toast.success("Valor copiado");
    window.setTimeout(() => setCopiedAmt(false), 2000);
  }

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <Wallet className="h-3.5 w-3.5 text-primary" />
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Envie o DePix da sua carteira
        </h3>
      </div>

      <div className="flex flex-col items-center gap-4">
        {qrDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrDataUrl}
            alt="QR do endereço de recebimento"
            className="h-56 w-56 rounded-md border bg-white p-2"
          />
        )}

        {/* Valor EXATO a enviar */}
        <div className="w-full rounded-lg border border-border bg-muted/30 p-3">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Envie exatamente
          </p>
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate font-mono text-2xl font-bold tabular-nums">
              {formatBRL(amountCents)}
            </p>
            <button
              type="button"
              onClick={copyAmount}
              className="inline-flex shrink-0 items-center gap-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90"
            >
              {copiedAmt ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              Copiar
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            em DePix. Valor diferente é devolvido automaticamente.
          </p>
        </div>

        {/* Endereço */}
        <div className="w-full">
          <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            Endereço Liquid (DePix)
          </p>
          <div className="flex items-start gap-2 rounded border bg-muted/30 p-2">
            <p className="min-w-0 flex-1 select-all break-all font-mono text-xs">{address ?? "—"}</p>
            <button
              type="button"
              onClick={copyAddress}
              className="inline-flex shrink-0 items-center gap-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90"
            >
              {copiedAddr ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              Copiar
            </button>
          </div>
        </div>

        {/* Prazo */}
        <div
          className={cn(
            "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm",
            expired
              ? "border-rose-500/30 bg-rose-500/5 text-rose-600 dark:text-rose-400"
              : "border-amber-500/30 bg-amber-500/5",
          )}
        >
          <span className={cn(!expired && "text-muted-foreground")}>
            {expired ? "Prazo de envio esgotado" : "Envie dentro de"}
          </span>
          {!expired && <span className="font-mono font-semibold tabular-nums">{countdown}</span>}
        </div>
      </div>
    </Card>
  );
}
