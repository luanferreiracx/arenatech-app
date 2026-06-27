"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { QrCode, Copy, Check, Maximize2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

/**
 * QR PIX ESTÁTICO da Arena Tech (chave fixa da intermediadora). Pagamentos caem
 * na carteira master. Exclusivo do tenant central — útil para vendas rápidas no
 * balcão. NÃO identifica o pagador nem o valor automaticamente: a conferência do
 * recebimento é manual. Para cobrança rastreável, use o link de pagamento.
 */
const STATIC_BR_CODE =
  "00020126580014BR.GOV.BCB.PIX013694b45348-166b-4693-923b-c8c2e21378f15204000053039865802BR5919Plebz Intermediacao6009Sao Paulo62150511pdvdepixapp6304702A";

export function StaticQrCard() {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(false);

  // Gera o PNG do QR no client a partir do BR Code (lib já usada no projeto).
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const QRCode = (await import("qrcode")).default;
        const url = await QRCode.toDataURL(STATIC_BR_CODE, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 512,
        });
        if (active) setQrDataUrl(url);
      } catch {
        // silencioso — o copia-e-cola ainda funciona
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function copy() {
    void navigator.clipboard.writeText(STATIC_BR_CODE);
    setCopied(true);
    toast.success("Código PIX copiado");
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <QrCode className="h-3.5 w-3.5 text-primary" />
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          QR para pagamentos rápidos
        </h3>
      </div>

      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => qrDataUrl && setZoom(true)}
          className="group relative mx-auto shrink-0 rounded-xl bg-white p-3 transition-shadow hover:shadow-[0_0_28px_-6px_var(--primary)] sm:mx-0"
          aria-label="Ampliar QR Code"
        >
          {qrDataUrl ? (
            <>
              <Image src={qrDataUrl} alt="QR Code PIX estático" width={160} height={160} className="size-40" unoptimized />
              <span className="absolute right-1.5 top-1.5 grid size-6 place-content-center rounded-md bg-black/5 text-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <Maximize2 className="size-3.5" />
              </span>
            </>
          ) : (
            <div className="grid size-40 place-content-center text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
            </div>
          )}
        </button>

        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-sm text-muted-foreground">
            Mostre este QR ao cliente para receber via PIX no balcão. Toque no QR para
            ampliar.
          </p>
          <div className="rounded-lg border bg-muted/40 px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              PIX copia e cola
            </p>
            <p className="mt-0.5 truncate font-mono text-xs text-foreground/80">{STATIC_BR_CODE}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={copy}>
              {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
              {copied ? "Copiado" : "Copiar código"}
            </Button>
            {qrDataUrl && (
              <Button asChild size="sm" variant="outline">
                <a href={qrDataUrl} download="qr-pix-arenatech.png">
                  Baixar QR
                </a>
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Este QR não identifica o pagador nem o valor automaticamente — confira o
            recebimento manualmente. Para cobrança rastreável, use o link de pagamento.
          </p>
        </div>
      </div>

      {/* Zoom: QR grande para o cliente escanear */}
      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="text-center text-sm">Pagar com PIX</DialogTitle>
          {qrDataUrl && (
            <div className="mx-auto w-fit rounded-2xl bg-white p-4">
              <Image src={qrDataUrl} alt="QR Code PIX estático ampliado" width={320} height={320} className="size-[min(78vw,320px)]" unoptimized />
            </div>
          )}
          <Button variant="outline" onClick={copy} className="w-full">
            {copied ? "Código copiado!" : "Copiar código PIX"}
          </Button>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
