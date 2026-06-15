"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, ShieldCheck, ShieldAlert, Copy } from "lucide-react";
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

interface WalletProtectionCardProps {
  provisioned: boolean;
  custodyModel: string;
  canManage: boolean;
}

type SetupStep = "passphrase" | "backup" | "confirm";

/** Card de protecao da carteira (ADR 0051): migrar p/ non-custodial, trocar a
 *  passphrase e recuperar acesso. So aparece p/ admin com carteira provisionada. */
export function WalletProtectionCard({
  provisioned,
  custodyModel,
  canManage,
}: WalletProtectionCardProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const isNonCustodial = custodyModel === "non_custodial";

  if (!provisioned || !canManage) return null;

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        {isNonCustodial ? (
          <ShieldCheck className="h-5 w-5 text-emerald-500" />
        ) : (
          <ShieldAlert className="h-5 w-5 text-amber-500" />
        )}
        <h3 className="text-sm font-semibold uppercase text-muted-foreground">
          Protecao da carteira
        </h3>
      </div>

      {isNonCustodial ? (
        <NonCustodialActions trpc={trpc} queryClient={queryClient} />
      ) : (
        <CustodialUpgrade trpc={trpc} queryClient={queryClient} />
      )}
    </Card>
  );
}

// ── Custodial -> definir senha (migracao) ───────────────────────────────────

function CustodialUpgrade({
  trpc,
  queryClient,
}: {
  trpc: ReturnType<typeof useTRPC>;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<SetupStep>("passphrase");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [confirmWord, setConfirmWord] = useState("");

  // Pede o indice da palavra a confirmar (4ª) — prova que o operador anotou.
  const CONFIRM_INDEX = 4;

  const reset = () => {
    setStep("passphrase");
    setPassphrase("");
    setConfirmPassphrase("");
    setMnemonic(null);
    setConfirmWord("");
  };

  const setupMutation = useMutation(
    trpc.depixWallet.setupNonCustodial.mutationOptions({
      onSuccess: () => {
        toast.success("Carteira protegida por senha!");
        void queryClient.invalidateQueries({ queryKey: [["depixWallet"]] });
        setOpen(false);
        reset();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  // Antes de cifrar, mostra a seed pro operador anotar. Reusa o reveal custodial.
  const revealMutation = useMutation(
    trpc.depixWallet.revealMnemonic.mutationOptions({
      onSuccess: (res) => {
        setMnemonic(res.mnemonic);
        setStep("backup");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const words = mnemonic?.split(/\s+/).filter(Boolean) ?? [];
  const passphraseValid =
    passphrase.length >= 8 && passphrase === confirmPassphrase;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Proteja sua carteira com uma senha que <strong>so voce conhece</strong>. A
        partir disso, nem a Arena Tech consegue ver sua frase de recuperacao nem
        mover seus fundos — todo saque passa a exigir esta senha.
      </p>
      <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
        Importante: se voce esquecer a senha <strong>e</strong> perder a frase de
        24 palavras, os fundos ficam inacessiveis para sempre. Ninguem recupera.
      </div>
      <Button type="button" onClick={() => setOpen(true)}>
        <KeyRound className="w-4 h-4 mr-2" />
        Proteger com senha
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent>
          {step === "passphrase" && (
            <>
              <DialogHeader>
                <DialogTitle>Definir senha da carteira</DialogTitle>
                <DialogDescription>
                  Escolha uma senha forte (minimo 8 caracteres). Ela nao fica
                  guardada no sistema e protege a assinatura dos seus saques.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="setup-pass">Nova senha da carteira</Label>
                  <Input
                    id="setup-pass"
                    type="password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="setup-pass-confirm">Confirme a senha</Label>
                  <Input
                    id="setup-pass-confirm"
                    type="password"
                    value={confirmPassphrase}
                    onChange={(e) => setConfirmPassphrase(e.target.value)}
                    autoComplete="new-password"
                  />
                  {confirmPassphrase.length > 0 && passphrase !== confirmPassphrase && (
                    <p className="text-xs text-destructive">As senhas nao coincidem.</p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => revealMutation.mutate({})}
                  disabled={!passphraseValid || revealMutation.isPending}
                >
                  {revealMutation.isPending ? "Carregando..." : "Continuar"}
                </Button>
              </DialogFooter>
            </>
          )}

          {step === "backup" && (
            <>
              <DialogHeader>
                <DialogTitle>Anote sua frase de recuperacao</DialogTitle>
                <DialogDescription>
                  Estas 24 palavras sao a unica forma de recuperar a carteira se
                  voce esquecer a senha. Anote em local seguro e offline.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 rounded border border-amber-500/30 bg-background/70 p-3">
                {words.map((word, index) => (
                  <div key={`${word}-${index}`} className="flex gap-2 rounded bg-muted/40 px-2 py-1">
                    <span className="w-6 text-right font-mono text-xs text-muted-foreground">
                      {index + 1}.
                    </span>
                    <span className="font-mono text-sm">{word}</span>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(mnemonic ?? "");
                  toast.success("Frase copiada!");
                }}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copiar frase
              </Button>
              <DialogFooter>
                <Button variant="outline" onClick={() => setStep("passphrase")}>
                  Voltar
                </Button>
                <Button onClick={() => setStep("confirm")}>Ja anotei</Button>
              </DialogFooter>
            </>
          )}

          {step === "confirm" && (
            <>
              <DialogHeader>
                <DialogTitle>Confirme o backup</DialogTitle>
                <DialogDescription>
                  Para garantir que voce anotou, digite a {CONFIRM_INDEX}ª palavra da frase.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="confirm-word">{CONFIRM_INDEX}ª palavra</Label>
                <Input
                  id="confirm-word"
                  value={confirmWord}
                  onChange={(e) => setConfirmWord(e.target.value)}
                  autoComplete="off"
                  className="font-mono"
                />
                {confirmWord.length > 0 && confirmWord.trim() !== words[CONFIRM_INDEX - 1] && (
                  <p className="text-xs text-destructive">Palavra incorreta.</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setStep("backup")}>
                  Voltar
                </Button>
                <Button
                  onClick={() => setupMutation.mutate({ passphrase })}
                  disabled={
                    confirmWord.trim() !== words[CONFIRM_INDEX - 1] || setupMutation.isPending
                  }
                >
                  {setupMutation.isPending ? "Protegendo..." : "Concluir"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Non-custodial: trocar senha + recuperar ─────────────────────────────────

function NonCustodialActions({
  trpc,
  queryClient,
}: {
  trpc: ReturnType<typeof useTRPC>;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
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

  return (
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
    </div>
  );
}
