"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { toast } from "@/lib/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface WalletManagementCardProps {
  provisioned: boolean;
  custodyModel: string;
  canManage: boolean;
}

/** Gerenciamento da carteira non-custodial (ADR 0051): trocar a passphrase e
 *  recuperar acesso por 24 palavras. So aparece p/ admin com carteira
 *  non_custodial provisionada (pos-setup). */
export function WalletManagementCard({
  provisioned,
  custodyModel,
  canManage,
}: WalletManagementCardProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [rewrapOpen, setRewrapOpen] = useState(false);
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [recoverMnemonic, setRecoverMnemonic] = useState("");
  const [recoverNewPass, setRecoverNewPass] = useState("");

  const rewrapMutation = useMutation(
    trpc.depixWallet.rewrapPassphrase.mutationOptions({
      onSuccess: () => {
        toast.success("Senha da carteira trocada!");
        setRewrapOpen(false);
        setOldPass("");
        setNewPass("");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const recoverMutation = useMutation(
    trpc.depixWallet.recoverNonCustodial.mutationOptions({
      onSuccess: () => {
        toast.success("Acesso recuperado! Use a nova senha.");
        void queryClient.invalidateQueries({ queryKey: [["depixWallet"]] });
        setRecoverOpen(false);
        setRecoverMnemonic("");
        setRecoverNewPass("");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  if (!provisioned || custodyModel !== "non_custodial" || !canManage) return null;

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="h-5 w-5 text-emerald-500" />
        <h3 className="text-sm font-semibold uppercase text-muted-foreground">
          Protecao da carteira
        </h3>
      </div>

      <div className="space-y-4">
        <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
          Sua carteira esta protegida por senha. So voce a conhece — todo saque exige
          ela. Com a senha voce pode ver sua frase de 24 palavras quando quiser.
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setRewrapOpen(true)}>
            <KeyRound className="w-4 h-4 mr-2" />
            Trocar senha
          </Button>
          <Button variant="outline" onClick={() => setRecoverOpen(true)}>
            Recuperar acesso
          </Button>
        </div>
      </div>

      {/* Trocar senha */}
      <Dialog
        open={rewrapOpen}
        onOpenChange={(o) => {
          setRewrapOpen(o);
          if (!o) {
            setOldPass("");
            setNewPass("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trocar senha da carteira</DialogTitle>
            <DialogDescription>
              Informe a senha atual e a nova. Sem a senha atual, use a opcao
              Recuperar acesso com sua frase de 24 palavras.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="old-pass">Senha atual</Label>
              <Input
                id="old-pass"
                type="password"
                value={oldPass}
                onChange={(e) => setOldPass(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-pass">Nova senha (min. 8)</Label>
              <Input
                id="new-pass"
                type="password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRewrapOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                rewrapMutation.mutate({ oldPassphrase: oldPass, newPassphrase: newPass })
              }
              disabled={oldPass.length === 0 || newPass.length < 8 || rewrapMutation.isPending}
            >
              {rewrapMutation.isPending ? "Trocando..." : "Trocar senha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recuperar acesso */}
      <Dialog
        open={recoverOpen}
        onOpenChange={(o) => {
          setRecoverOpen(o);
          if (!o) {
            setRecoverMnemonic("");
            setRecoverNewPass("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recuperar acesso</DialogTitle>
            <DialogDescription>
              Esqueceu a senha? Digite suas 24 palavras de recuperacao e defina uma
              nova senha. Isto so funciona com a frase da carteira deste tenant.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="recover-mnemonic">Frase de recuperacao (24 palavras)</Label>
              <textarea
                id="recover-mnemonic"
                value={recoverMnemonic}
                onChange={(e) => setRecoverMnemonic(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono"
                placeholder="palavra1 palavra2 ... palavra24"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recover-new-pass">Nova senha (min. 8)</Label>
              <Input
                id="recover-new-pass"
                type="password"
                value={recoverNewPass}
                onChange={(e) => setRecoverNewPass(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecoverOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                recoverMutation.mutate({
                  mnemonic: recoverMnemonic.trim(),
                  newPassphrase: recoverNewPass,
                })
              }
              disabled={
                recoverMnemonic.trim().split(/\s+/).length < 12 ||
                recoverNewPass.length < 8 ||
                recoverMutation.isPending
              }
            >
              {recoverMutation.isPending ? "Recuperando..." : "Recuperar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
