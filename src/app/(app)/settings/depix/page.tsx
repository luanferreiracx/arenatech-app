"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Copy, Eye, EyeOff, Wallet, RefreshCw } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/domain/page-header";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { LoadingState } from "@/components/domain/loading-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MoneyInput } from "@/components/inputs/money-input";
import {
  updateDepixFeeConfigSchema,
  type UpdateDepixFeeConfigInput,
} from "@/lib/validators/depix-wallet";

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function DepixSettingsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [confirmRevealOpen, setConfirmRevealOpen] = useState(false);
  const [revealPassword, setRevealPassword] = useState("");
  const [revealedMnemonic, setRevealedMnemonic] = useState<string | null>(null);

  const feeQuery = useQuery(trpc.depixWallet.getFeeConfig.queryOptions());
  const walletQuery = useQuery(trpc.depixWallet.getWalletInfo.queryOptions());
  const balanceQuery = useQuery(trpc.depixWallet.getBalance.queryOptions());

  const form = useForm<UpdateDepixFeeConfigInput>({
    resolver: zodResolver(updateDepixFeeConfigSchema),
    values: feeQuery.data
      ? {
          entryFeeFixed: feeQuery.data.entryFeeFixed,
          entryFeePercent: feeQuery.data.entryFeePercent,
          exitFeeFixed: feeQuery.data.exitFeeFixed,
          exitFeePercent: feeQuery.data.exitFeePercent,
        }
      : undefined,
  });

  const updateMutation = useMutation(
    trpc.depixWallet.updateFeeConfig.mutationOptions({
      onSuccess: () => {
        toast.success("Taxas DePix atualizadas!");
        void queryClient.invalidateQueries({ queryKey: [["depixWallet"]] });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const provisionMutation = useMutation(
    trpc.depixWallet.provision.mutationOptions({
      onSuccess: (res) => {
        if (res.success) {
          toast.success(
            res.alreadyProvisioned ? "Carteira ja provisionada." : "Carteira provisionada!",
          );
          void queryClient.invalidateQueries({ queryKey: [["depixWallet"]] });
        } else {
          toast.error(res.error ?? "Falha ao provisionar carteira.");
        }
      },
      onError: (err) => toast.error(err.message),
    }),
  );

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

  if (feeQuery.isLoading) return <LoadingState />;

  const wallet = walletQuery.data;
  const masterAddress = wallet?.masterAddress ?? null;
  const mnemonicWords = revealedMnemonic?.split(/\s+/).filter(Boolean) ?? [];

  return (
    <div>
      <PageHeader
        title="DePix"
        subtitle="Carteira Liquid do tenant e taxas de intermediacao por transacao"
      />

      {/* Carteira */}
      <Card className="p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Wallet className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold uppercase text-muted-foreground">Carteira</h3>
        </div>
        {wallet?.provisioned && masterAddress ? (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase">Endereco de recebimento (Liquid)</p>
              <div className="flex items-start gap-2 mt-1 p-2 bg-muted/30 rounded border border-border">
                <p className="font-mono text-xs break-all flex-1 select-all">{masterAddress}</p>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(masterAddress);
                    toast.success("Endereco copiado!");
                  }}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                >
                  <Copy className="w-3 h-3" /> Copiar
                </button>
              </div>
            </div>
            <div className="flex justify-between text-sm border-t pt-3">
              <span className="text-muted-foreground">Saldo DePix</span>
              <span className="font-semibold">
                {balanceQuery.data
                  ? `R$ ${(balanceQuery.data.depixBalance ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                  : "—"}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Carteira ainda nao provisionada. Provisione para gerar a carteira Liquid deste tenant.
            </p>
            <Button
              variant="outline"
              onClick={() => provisionMutation.mutate()}
              disabled={provisionMutation.isPending}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Provisionar carteira
            </Button>
          </div>
        )}
      </Card>

      {wallet?.provisioned && (
        <Card className="p-6 mb-6 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">
              Frase de recuperacao / SideSwap
            </h3>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Use esta frase de 24 palavras apenas para backup ou importacao da carteira no
              SideSwap. Qualquer pessoa com acesso a ela pode controlar os fundos da carteira.
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
                  disabled={revealMnemonicMutation.isPending || wallet.canRevealMnemonic === false}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Exibir frase de recuperacao
                </Button>
                {wallet.canRevealMnemonic === false && (
                  <p className="text-xs text-muted-foreground">
                    Acao restrita ao perfil admin do tenant ou superadmin.
                  </p>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

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
              Confirme sua senha para exibir as 24 palavras que permitem importar e controlar a
              carteira no SideSwap. Nao compartilhe, nao envie por WhatsApp e prefira guardar offline.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm">
            Qualquer pessoa com essa frase pode movimentar os fundos da carteira DePix/Liquid.
          </div>
          <div className="space-y-2">
            <Label htmlFor="depix-mnemonic-password">Sua senha</Label>
            <Input
              id="depix-mnemonic-password"
              type="password"
              value={revealPassword}
              onChange={(event) => setRevealPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && revealPassword && !revealMnemonicMutation.isPending) {
                  revealMnemonicMutation.mutate({ password: revealPassword });
                }
              }}
              autoComplete="current-password"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmRevealOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => revealMnemonicMutation.mutate({ password: revealPassword })}
              disabled={revealMnemonicMutation.isPending || !revealPassword}
            >
              {revealMnemonicMutation.isPending ? "Revelando..." : "Confirmar senha e revelar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Aviso pro tenant central */}
      {feeQuery.data && "isCentralTenant" in feeQuery.data && feeQuery.data.isCentralTenant && (
        <Card className="p-4 mb-6 border-blue-500/30 bg-blue-500/5">
          <p className="text-sm">
            <strong>Voce esta no tenant central (Arena Tech).</strong> Como
            voce <em>recebe</em> as taxas de intermediacao dos demais tenants,
            voce nao paga taxa pra si mesmo. As taxas abaixo ficam fixas em zero.
          </p>
        </Card>
      )}

      {/* Taxas (escondido pro tenant central — sempre zero) */}
      {!(feeQuery.data && "isCentralTenant" in feeQuery.data && feeQuery.data.isCentralTenant) && (
      <form
        onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))}
        className="space-y-6"
      >
        <FormSection
          title="Taxas de intermediacao"
          description="Cobradas por transacao e repassadas para a carteira da Arena Tech. Empilham sobre a taxa do gateway de off-ramp."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <p className="text-sm font-semibold">Entrada (deposito)</p>
              <div>
                <Label>Taxa fixa</Label>
                <MoneyInput
                  value={form.watch("entryFeeFixed")}
                  onChange={(v) => form.setValue("entryFeeFixed", v)}
                />
              </div>
              <div>
                <Label>Taxa percentual (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  {...form.register("entryFeePercent", { valueAsNumber: true })}
                />
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-sm font-semibold">Saida (saque)</p>
              <div>
                <Label>Taxa fixa</Label>
                <MoneyInput
                  value={form.watch("exitFeeFixed")}
                  onChange={(v) => form.setValue("exitFeeFixed", v)}
                />
              </div>
              <div>
                <Label>Taxa percentual (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  {...form.register("exitFeePercent", { valueAsNumber: true })}
                />
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-4">
            Padrao: entrada {formatBRL(99)} + 1,5% · saida {formatBRL(99)} + 1,7%.
          </p>
        </FormSection>

        <FormActions isLoading={updateMutation.isPending} submitLabel="Salvar taxas" />
      </form>
      )}
    </div>
  );
}
