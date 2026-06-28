"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { MoneyInput } from "@/components/inputs/money-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Send } from "lucide-react";

function looksLikeLiquidAddress(addr: string): boolean {
  const a = addr.trim();
  if (a.length < 20 || a.length > 110) return false;
  if (/^(lq1|ex1)[0-9ac-hj-np-z]{20,108}$/i.test(a)) return true;
  if (/^[1-9A-HJ-NP-Za-km-z]{26,108}$/.test(a) && /^[GHJPQVX]/.test(a)) return true;
  return false;
}

/** Envia DePix da carteira de taxas p/ um endereço Liquid externo (consolidar a
 *  receita). Confirmação visual do endereço colado (sem re-digitar). Irreversível. */
export function SendOnchainDialog({ balanceCents }: { balanceCents: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState(0);
  const [acknowledged, setAcknowledged] = useState(false);

  const sendMutation = useMutation(
    trpc.depixFeeWalletAdmin.sendOnchain.mutationOptions({
      onSuccess: (res) => {
        toast.success("Envio transmitido!");
        void queryClient.invalidateQueries({ queryKey: [["depixFeeWalletAdmin"]] });
        window.open(res.explorerUrl, "_blank");
        reset();
        setOpen(false);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  function reset() {
    setToAddress("");
    setAmount(0);
    setAcknowledged(false);
  }

  const addressValid = looksLikeLiquidAddress(toAddress);
  const amountValid = amount > 0 && amount <= balanceCents;
  const canSend = addressValid && amountValid && acknowledged;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Send className="h-3.5 w-3.5 mr-1.5" />
          Enviar on-chain
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar DePix da carteira de taxas</DialogTitle>
          <DialogDescription>
            Consolide a receita enviando DePix para um endereço Liquid externo. Operação
            on-chain irreversível.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="feeSendAddr">Endereço Liquid de destino</Label>
            <Input
              id="feeSendAddr"
              value={toAddress}
              onChange={(e) => {
                setToAddress(e.target.value);
                setAcknowledged(false);
              }}
              placeholder="Cole o endereço lq1qq..."
              className={cn("font-mono text-sm", toAddress && !addressValid && "border-destructive")}
              autoComplete="off"
              spellCheck={false}
            />
            {toAddress && !addressValid && (
              <p className="text-xs text-destructive mt-1.5">Endereço Liquid inválido.</p>
            )}
          </div>

          <div>
            <Label>Valor</Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-2">
              Disponível: {(balanceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
            <MoneyInput value={amount} onChange={setAmount} placeholder="R$ 0,00" className="!font-mono tabular-nums" />
            {amount > balanceCents && <p className="text-xs text-destructive mt-1.5">Saldo insuficiente.</p>}
          </div>

          {addressValid && amountValid && (
            <div className="rounded-md border bg-muted/40 p-3 space-y-2">
              <p className="font-mono text-xs break-all">{toAddress.trim()}</p>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <Checkbox checked={acknowledged} onCheckedChange={(c) => setAcknowledged(c === true)} className="mt-0.5" />
                <span className="text-sm">Conferi o endereço de destino e confirmo que está correto.</span>
              </label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={sendMutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => sendMutation.mutate({ toAddress: toAddress.trim(), amountReais: amount / 100 })}
            disabled={!canSend || sendMutation.isPending}
          >
            {sendMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
