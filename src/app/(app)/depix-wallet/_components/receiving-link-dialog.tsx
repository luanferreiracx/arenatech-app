"use client";

import { useState } from "react";
import Image from "next/image";
import { Copy, Check, Link2, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
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
import { MoneyInput } from "@/components/inputs/money-input";
import { toast } from "@/lib/toast";

/**
 * Link de recebimento do tenant: fixo, reutilizável, um só.
 *
 * Substitui o antigo "gerar link" (que criava um link descartável por cobrança) e
 * a listagem de links. Com um link fixo não há o que listar — o histórico de
 * quem pagou vive no extrato da carteira, onde cada pagamento é uma transação.
 *
 * Cobrar um valor específico não cria registro: monta a mesma URL com `?valor=`.
 */
export function ReceivingLinkDialog({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Meu link de recebimento</DialogTitle>
          <DialogDescription>
            Um link fixo para receber por PIX. Pode ser divulgado e usado quantas vezes quiser.
          </DialogDescription>
        </DialogHeader>
        {open && <LinkBody />}
      </DialogContent>
    </Dialog>
  );
}

function LinkBody() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const link = useQuery(trpc.paymentLink.get.queryOptions());
  const [amountCents, setAmountCents] = useState(0);
  const [copied, setCopied] = useState<"link" | "charge" | null>(null);

  const setActive = useMutation(
    trpc.paymentLink.setActive.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: trpc.paymentLink.get.queryKey() });
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  // Cobrança com valor: só consulta quando há valor válido — o backend devolve a
  // URL pronta e o QR dela.
  const charge = useQuery(
    trpc.paymentLink.chargeUrl.queryOptions({ amountCents }, { enabled: amountCents >= 1000 }),
  );

  function copy(text: string, which: "link" | "charge") {
    void navigator.clipboard.writeText(text);
    setCopied(which);
    toast.success("Link copiado");
    window.setTimeout(() => setCopied(null), 2000);
  }

  if (link.isPending) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (link.isError || !link.data) {
    return (
      <p className="py-6 text-center text-sm text-destructive">
        Não foi possível carregar o link. Tente novamente.
      </p>
    );
  }

  const data = link.data;

  return (
    <div className="space-y-5">
      {/* O rótulo diz o ESTADO ATUAL, não a ação do switch.
          A versão anterior ("Recebendo pagamentos" + "Desligar suspende…") juntava
          as duas coisas: com o link desligado, o título afirmava que estava
          recebendo enquanto o switch dizia o contrário. */}
      <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <div className="min-w-0">
          <Label htmlFor="link-ativo" className="text-sm">
            {data.active ? "Link ativo" : "Link desativado"}
          </Label>
          <p className="mt-0.5 text-xs text-muted-foreground break-words">
            {data.active
              ? "Seu link está recebendo pagamentos normalmente."
              : "Ninguém consegue pagar por este link. Ative para voltar a receber."}
          </p>
        </div>
        <Switch
          id="link-ativo"
          checked={data.active}
          disabled={setActive.isPending}
          onCheckedChange={(v) => setActive.mutate({ active: v })}
          aria-label={data.active ? "Desativar o link" : "Ativar o link"}
        />
      </div>

      {!data.active && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-600 break-words dark:text-amber-400">
          Ative o link acima para gerar o QR e começar a receber.
        </p>
      )}

      {data.active && (
      <div className="space-y-2">
        <Label htmlFor="link-fixo">Link fixo</Label>
        <div className="flex min-w-0 gap-2">
          <Input id="link-fixo" readOnly value={data.url} className="min-w-0 text-xs" />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => copy(data.url, "link")}
            aria-label="Copiar link fixo"
          >
            {copied === "link" ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        </div>
        {data.qrCodeDataUrl && (
          <div className="mx-auto w-fit rounded-lg bg-white p-3">
            <Image
              src={data.qrCodeDataUrl}
              alt="QR Code do link de recebimento"
              width={180}
              height={180}
              unoptimized
            />
          </div>
        )}
      </div>
      )}

      {data.active && (
      <div className="space-y-2 border-t pt-4">
        <Label htmlFor="valor-cobranca">Cobrar um valor específico</Label>
        <p className="text-xs text-muted-foreground break-words">
          Gera o mesmo link com o valor já preenchido — o cliente não altera.
        </p>
        <MoneyInput id="valor-cobranca" value={amountCents} onChange={setAmountCents} />
        {amountCents >= 1000 && charge.data?.url && (
          <div className="flex min-w-0 gap-2">
            <Input
              id="link-com-valor"
              readOnly
              value={charge.data.url}
              aria-label="Link com valor preenchido"
              className="min-w-0 text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => copy(charge.data!.url!, "charge")}
              aria-label="Copiar link com valor"
            >
              {copied === "charge" ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
        )}
        {amountCents > 0 && amountCents < 1000 && (
          <p className="text-xs text-destructive">Valor mínimo de R$ 10,00.</p>
        )}
      </div>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Link2 className="mt-0.5 size-3.5 shrink-0" />
        <span className="break-words">
          Cada pagamento aparece no extrato da carteira, com valor e pagador.
        </span>
      </p>
    </div>
  );
}
