"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Copy, Eye, EyeOff } from "lucide-react";
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

interface RecoveryPhraseCardProps {
  provisioned: boolean;
  canRevealMnemonic: boolean;
  /** ADR 0051: "custodial" pede senha de login; "non_custodial" pede a passphrase. */
  custodyModel?: string;
}

export function RecoveryPhraseCard({
  provisioned,
  canRevealMnemonic,
  custodyModel = "custodial",
}: RecoveryPhraseCardProps) {
  const trpc = useTRPC();
  const isNonCustodial = custodyModel === "non_custodial";
  const [confirmRevealOpen, setConfirmRevealOpen] = useState(false);
  const [revealPassword, setRevealPassword] = useState("");
  const [revealedMnemonic, setRevealedMnemonic] = useState<string | null>(null);

  const revealMnemonicMutation = useMutation(
    trpc.depixWallet.revealMnemonic.mutationOptions({
      onSuccess: (res) => {
        setRevealedMnemonic(res.mnemonic);
        setRevealPassword("");
        setConfirmRevealOpen(false);
        toast.success("Frase de recuperacao exibida.");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  if (!provisioned) return null;

  const mnemonicWords = revealedMnemonic?.split(/\s+/).filter(Boolean) ?? [];

  return (
    <Card className="p-6 border-amber-500/30 bg-amber-500/5">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="h-5 w-5 text-amber-500" />
        <h3 className="text-sm font-semibold uppercase text-muted-foreground">
          Frase de recuperacao / SideSwap
        </h3>
      </div>

      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Use esta frase de 24 palavras apenas para backup ou importacao da
          carteira no SideSwap. Qualquer pessoa com acesso a ela pode controlar
          os fundos da carteira.
        </p>

        {revealedMnemonic ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 rounded border border-amber-500/30 bg-background/70 p-3">
              {mnemonicWords.map((word, index) => (
                <div key={`${word}-${index}`} className="flex gap-2 rounded bg-muted/40 px-2 py-1">
                  <span className="w-6 text-right font-mono text-xs text-muted-foreground">
                    {index + 1}.
                  </span>
                  <span className="font-mono text-sm">{word}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(revealedMnemonic);
                  toast.success("Frase copiada!");
                }}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copiar frase
              </Button>
              <Button type="button" variant="ghost" onClick={() => setRevealedMnemonic(null)}>
                <EyeOff className="w-4 h-4 mr-2" />
                Ocultar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmRevealOpen(true)}
              disabled={revealMnemonicMutation.isPending || !canRevealMnemonic}
            >
              <Eye className="w-4 h-4 mr-2" />
              Exibir frase de recuperacao
            </Button>
            {!canRevealMnemonic && (
              <p className="text-xs text-muted-foreground">
                Acao restrita ao perfil admin do tenant ou superadmin.
              </p>
            )}
          </div>
        )}
      </div>

      <Dialog
        open={confirmRevealOpen}
        onOpenChange={(open) => {
          setConfirmRevealOpen(open);
          if (!open) setRevealPassword("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revelar frase de recuperacao?</DialogTitle>
            <DialogDescription>
              {isNonCustodial
                ? "Digite a senha da sua carteira para exibir as 24 palavras."
                : "Confirme sua senha para exibir as 24 palavras que permitem importar e controlar a carteira no SideSwap."}{" "}
              Nao compartilhe, nao envie por WhatsApp e prefira guardar offline.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm">
            Qualquer pessoa com essa frase pode movimentar os fundos da carteira DePix/Liquid.
          </div>
          <div className="space-y-2">
            <Label htmlFor="depix-wallet-mnemonic-password">
              {isNonCustodial ? "Senha da carteira" : "Sua senha"}
            </Label>
            <Input
              id="depix-wallet-mnemonic-password"
              type="password"
              value={revealPassword}
              onChange={(event) => setRevealPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && revealPassword && !revealMnemonicMutation.isPending) {
                  revealMnemonicMutation.mutate(
                    isNonCustodial ? { passphrase: revealPassword } : { password: revealPassword },
                  );
                }
              }}
              autoComplete={isNonCustodial ? "off" : "current-password"}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmRevealOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() =>
                revealMnemonicMutation.mutate(
                  isNonCustodial ? { passphrase: revealPassword } : { password: revealPassword },
                )
              }
              disabled={revealMnemonicMutation.isPending || !revealPassword}
            >
              {revealMnemonicMutation.isPending ? "Revelando..." : "Confirmar senha e revelar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
