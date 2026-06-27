"use client";

import { useState } from "react";
import { Link2, Copy, Check, MessageCircle, Loader2 } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

/**
 * Gera e compartilha o link público de pagamento de uma venda avulsa. O cliente
 * paga o QR por /pay/<token> sem login (informa CPF/CNPJ + confirma titularidade).
 */
export function SharePaymentLink({ quickSaleId }: { quickSaleId: string }) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createLink = useMutation(
    trpc.quickSale.createPublicLink.mutationOptions({
      onSuccess: (res) => {
        setUrl(res.url);
        setOpen(true);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  function copy() {
    if (!url) return;
    void navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => createLink.mutate({ id: quickSaleId, amountOpen: false })}
        disabled={createLink.isPending}
        title="Gerar link público para o cliente pagar"
      >
        {createLink.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Link2 className="mr-2 h-4 w-4" />
        )}
        Link de pagamento
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link de pagamento</DialogTitle>
            <DialogDescription>
              Envie ao cliente. Ele paga sem login, informando o CPF/CNPJ do titular da conta.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-sm">{url}</span>
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
                url &&
                window.open(
                  `https://wa.me/?text=${encodeURIComponent(`Pague aqui: ${url}`)}`,
                  "_blank",
                )
              }
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              WhatsApp
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
