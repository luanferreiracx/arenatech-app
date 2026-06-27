"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Link2, Copy, Check, MessageCircle, Loader2, Download } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

const MIN_CENTS = 1000;
const MAX_CENTS = 500000;

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Created = { url: string; qrCodeDataUrl: string | null };

/**
 * Gera um link de pagamento DePix direto da carteira: valor fixo OU livre +
 * descrição. Mostra a URL + QR Code do link (copiar / WhatsApp / baixar PNG).
 * O cliente paga por /pay/<token> sem login.
 */
export function GenerateLinkDialog({ trigger }: { trigger: React.ReactNode }) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [amountOpen, setAmountOpen] = useState(false);
  const [amountInput, setAmountInput] = useState("");
  const [description, setDescription] = useState("");
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);

  const amountCents = Number(amountInput.replace(/\D/g, "")) || 0;
  const amountValid = amountOpen || (amountCents >= MIN_CENTS && amountCents <= MAX_CENTS);

  const createLink = useMutation(
    trpc.paymentLink.create.mutationOptions({
      onSuccess: (res) => setCreated({ url: res.url, qrCodeDataUrl: res.qrCodeDataUrl }),
      onError: (err) => toast.error(err.message),
    }),
  );

  function reset() {
    setCreated(null);
    setAmountOpen(false);
    setAmountInput("");
    setDescription("");
    setCopied(false);
  }

  function copy() {
    if (!created) return;
    void navigator.clipboard.writeText(created.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gerar link de pagamento</DialogTitle>
          <DialogDescription>
            Envie ao cliente. Ele paga sem login, informando o CPF/CNPJ do titular da conta.
          </DialogDescription>
        </DialogHeader>

        {!created ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="amountOpen" className="text-sm">
                  Valor preenchido pelo cliente
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  O cliente escolhe quanto pagar (entre {formatBRL(MIN_CENTS)} e {formatBRL(MAX_CENTS)}).
                </p>
              </div>
              <Switch id="amountOpen" checked={amountOpen} onCheckedChange={setAmountOpen} />
            </div>

            {!amountOpen && (
              <div>
                <Label htmlFor="amount">Valor</Label>
                <Input
                  id="amount"
                  inputMode="numeric"
                  value={amountInput ? formatBRL(amountCents) : ""}
                  onChange={(e) => setAmountInput(e.target.value.replace(/\D/g, ""))}
                  placeholder="R$ 0,00"
                  className="tabular-nums"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Entre {formatBRL(MIN_CENTS)} e {formatBRL(MAX_CENTS)}.
                </p>
              </div>
            )}

            <div>
              <Label htmlFor="description">
                Descrição{" "}
                <span className="text-[10px] text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 200))}
                placeholder="Ex.: Mensalidade, reserva, conta…"
                maxLength={200}
              />
            </div>

            <Button
              className="w-full"
              disabled={!amountValid || createLink.isPending}
              onClick={() =>
                createLink.mutate({
                  amountCents: amountOpen ? null : amountCents,
                  description: description.trim() || null,
                })
              }
            >
              {createLink.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="mr-2 h-4 w-4" />
              )}
              Gerar link
            </Button>

            <Link
              href="/depix-wallet/payment-links"
              className="block text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Ver links gerados
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {created.qrCodeDataUrl && (
              <div className="mx-auto w-fit rounded-xl bg-white p-3">
                <Image
                  src={created.qrCodeDataUrl}
                  alt="QR Code do link de pagamento"
                  width={200}
                  height={200}
                  className="size-[200px]"
                  unoptimized
                />
              </div>
            )}

            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-mono text-sm">{created.url}</span>
              <Button size="sm" variant="ghost" onClick={copy} aria-label="Copiar link">
                {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>

            <div className="flex gap-2">
              <Button onClick={copy} className="flex-1">
                {copied ? "Copiado!" : "Copiar link"}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() =>
                  window.open(
                    `https://wa.me/?text=${encodeURIComponent(`Pague aqui: ${created.url}`)}`,
                    "_blank",
                  )
                }
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                WhatsApp
              </Button>
            </div>

            {created.qrCodeDataUrl && (
              <a
                href={created.qrCodeDataUrl}
                download="qr-pagamento-depix.png"
                className="flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <Download className="h-3.5 w-3.5" />
                Baixar QR Code
              </a>
            )}

            <Button variant="ghost" className="w-full" onClick={reset}>
              Gerar outro link
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
