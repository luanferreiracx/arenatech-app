"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet, Plus, Trash2, ShieldCheck } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { toast } from "@/lib/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Carteiras BYOW (self-custody) autorizadas do tenant. A API de parceiro só pode
 * receber DePix num endereço que esteja nesta lista. Cadastrar exige senha + 2FA
 * + confirmação por email E WhatsApp (fluxo 2 passos); remover exige só 2FA.
 */
export function ByowWalletsCard({ canManage }: { canManage: boolean }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const listQuery = useQuery(trpc.depixByow.list.queryOptions(undefined, { enabled: canManage }));

  // Fluxo de cadastro (2 passos).
  const [addOpen, setAddOpen] = useState(false);
  const [step, setStep] = useState<"form" | "codes">("form");
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [isThirdParty, setIsThirdParty] = useState(false);
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [whatsappCode, setWhatsappCode] = useState("");
  const [masked, setMasked] = useState<{ email: string; phone: string } | null>(null);

  // Remoção.
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [removeCode, setRemoveCode] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.depixByow.list.queryKey() });

  const resetAdd = () => {
    setStep("form");
    setAddress("");
    setLabel("");
    setIsThirdParty(false);
    setPassword("");
    setTwoFactorCode("");
    setEmailCode("");
    setWhatsappCode("");
    setMasked(null);
  };

  const startMutation = useMutation(
    trpc.depixByow.startAdd.mutationOptions({
      onSuccess: (res) => {
        setMasked({ email: res.emailMasked, phone: res.phoneMasked });
        setStep("codes");
        toast.success("Códigos enviados por email e WhatsApp.");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const confirmMutation = useMutation(
    trpc.depixByow.confirmAdd.mutationOptions({
      onSuccess: () => {
        toast.success("Carteira autorizada!");
        setAddOpen(false);
        resetAdd();
        invalidate();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const removeMutation = useMutation(
    trpc.depixByow.remove.mutationOptions({
      onSuccess: () => {
        toast.success("Carteira removida.");
        setRemoveTarget(null);
        setRemoveCode("");
        invalidate();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  if (!canManage) return null;

  const wallets = listQuery.data ?? [];

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h3 className="text-sm font-semibold">Carteiras autorizadas (BYOW)</h3>
            <p className="text-sm text-muted-foreground">
              Endereços Liquid próprios (ou de terceiros) que a API pode usar para
              receber o DePix, sem depender da carteira gerenciada. Cadastrar exige
              2FA + confirmação por email e WhatsApp.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Adicionar
        </Button>
      </div>

      {wallets.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          Nenhuma carteira autorizada. A API usa a carteira gerenciada até você
          cadastrar uma aqui.
        </p>
      ) : (
        <ul className="space-y-2">
          {wallets.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {w.label}
                  {w.isThirdParty && (
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                      terceiro
                    </span>
                  )}
                </p>
                <p className="truncate font-mono text-xs text-muted-foreground">{w.address}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => setRemoveTarget(w.id)}
                aria-label="Remover carteira"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Cadastro — 2 passos */}
      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) resetAdd();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Autorizar nova carteira</DialogTitle>
            <DialogDescription>
              {step === "form"
                ? "Confirme com sua senha e o código do app (2FA). Enviaremos códigos por email e WhatsApp."
                : `Digite os códigos enviados para ${masked?.email} e ${masked?.phone}.`}
            </DialogDescription>
          </DialogHeader>

          {step === "form" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="byow-address">Endereço Liquid</Label>
                <Input
                  id="byow-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="lq1... (cole e confira)"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="byow-label">Apelido</Label>
                <Input id="byow-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex: Carteira principal" />
              </div>
              <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
                <span className="text-sm">É uma carteira de terceiro</span>
                <Switch checked={isThirdParty} onCheckedChange={setIsThirdParty} />
              </label>
              <div className="space-y-1.5">
                <Label htmlFor="byow-pass">Sua senha</Label>
                <Input id="byow-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="byow-2fa">Código 2FA (app)</Label>
                <Input id="byow-2fa" inputMode="numeric" value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value)} placeholder="000000" />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="byow-email-code">Código do email</Label>
                <Input id="byow-email-code" inputMode="numeric" value={emailCode} onChange={(e) => setEmailCode(e.target.value)} placeholder="000000" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="byow-wa-code">Código do WhatsApp</Label>
                <Input id="byow-wa-code" inputMode="numeric" value={whatsappCode} onChange={(e) => setWhatsappCode(e.target.value)} placeholder="000000" />
              </div>
            </div>
          )}

          <DialogFooter>
            {step === "form" ? (
              <Button
                onClick={() => startMutation.mutate({ address, label, isThirdParty, password, twoFactorCode })}
                disabled={startMutation.isPending || !address || !label || !password || !twoFactorCode}
              >
                <ShieldCheck className="mr-1 h-4 w-4" />
                Enviar códigos
              </Button>
            ) : (
              <Button
                onClick={() => confirmMutation.mutate({ address, label, isThirdParty, emailCode, whatsappCode })}
                disabled={confirmMutation.isPending || !emailCode || !whatsappCode}
              >
                Autorizar carteira
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remoção — só 2FA */}
      <Dialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveTarget(null);
            setRemoveCode("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover carteira autorizada?</DialogTitle>
            <DialogDescription>
              A API deixa de poder usar este endereço. Informe seu código 2FA para confirmar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="byow-remove-2fa">Código 2FA</Label>
            <Input id="byow-remove-2fa" inputMode="numeric" value={removeCode} onChange={(e) => setRemoveCode(e.target.value)} placeholder="000000" />
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => {
                if (removeTarget) removeMutation.mutate({ id: removeTarget, twoFactorCode: removeCode });
              }}
              disabled={removeMutation.isPending || !removeCode}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
