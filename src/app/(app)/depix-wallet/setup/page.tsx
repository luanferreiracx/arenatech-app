"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  ArrowDownToLine,
  Copy,
  Check,
  Loader2,
  ShieldAlert,
  KeyRound,
} from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WizardStepper } from "../_components/wizard-stepper";

type Mode = "create" | "import";

const MIN_PASSPHRASE = 8;

function countWords(value: string): number {
  const trimmed = value.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

/**
 * Wizard de 1o acesso da carteira DePix (ADR 0051, non-custodial).
 *
 * Fluxo:
 *   1. escolher criar nova vs importar existente
 *   2. [import] colar as 24 palavras
 *   3. definir a senha (passphrase) que cifra a seed — so o usuario a conhece
 *   --> setupWallet (cifra no LWK, persiste o blob)
 *   4. [create] exibir as 24 palavras geradas + confirmar uma delas (backup)
 *      [import] conclusao direta
 *
 * A passphrase NUNCA trafega para o superadmin; perder passphrase E as 24
 * palavras = perda total dos fundos. Isso e comunicado em cada etapa.
 */
export default function DepixWalletSetupPage() {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();

  const walletInfoQuery = useQuery(trpc.depixWallet.getWalletInfo.queryOptions());

  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<Mode | null>(null);
  const [importMnemonic, setImportMnemonic] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [passphraseConfirm, setPassphraseConfirm] = useState("");

  // Backup das 24 palavras geradas no modo create (so existe em memoria).
  const [generatedMnemonic, setGeneratedMnemonic] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Indice (0-based) da palavra que o usuario precisa confirmar.
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [challengeAnswer, setChallengeAnswer] = useState("");

  const setupMutation = useMutation(
    trpc.depixWallet.setupWallet.mutationOptions({
      onSuccess: (res) => {
        if (mode === "create" && res.mnemonic) {
          setGeneratedMnemonic(res.mnemonic);
          setStep(4);
          return;
        }
        // import: nao ha frase para exibir, conclui direto.
        finish();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  function finish() {
    void queryClient.invalidateQueries({ queryKey: [["depixWallet"]] });
    toast.success("Carteira configurada!");
    router.push("/depix-wallet");
  }

  const steps = useMemo(() => {
    if (mode === "import") {
      return [
        { id: 1, label: "Carteira" },
        { id: 2, label: "Importar" },
        { id: 3, label: "Senha" },
      ];
    }
    // create (ou ainda nao escolhido)
    return [
      { id: 1, label: "Carteira" },
      { id: 3, label: "Senha" },
      { id: 4, label: "Backup" },
    ];
  }, [mode]);

  const passphraseValid =
    passphrase.length >= MIN_PASSPHRASE && passphrase === passphraseConfirm;
  const importWordCount = countWords(importMnemonic);

  function handleModeNext() {
    if (mode === "import") {
      setStep(2);
    } else {
      setStep(3);
    }
  }

  function handleSubmitSetup() {
    if (mode === "create") {
      // Sorteia qual palavra sera pedida no backup (handler, fora de render).
      setChallengeIndex(crypto.getRandomValues(new Uint8Array(1))[0]! % 24);
    }
    setupMutation.mutate({
      mode: mode === "import" ? "import" : "create",
      passphrase,
      mnemonic: mode === "import" ? importMnemonic.trim() : undefined,
    });
  }

  const generatedWords = useMemo(
    () => (generatedMnemonic ? generatedMnemonic.trim().split(/\s+/) : []),
    [generatedMnemonic],
  );
  const challengeOk =
    challengeAnswer.trim().toLowerCase() === (generatedWords[challengeIndex] ?? "\0");

  if (walletInfoQuery.isLoading) return <LoadingState />;

  // Ja provisionada ou sem permissao: nao faz sentido o wizard.
  if (walletInfoQuery.data?.provisioned === true) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <PageHeader title="Configurar carteira" subtitle="Carteira ja configurada." />
        <Card className="max-w-xl mx-auto p-6">
          <p className="text-sm text-muted-foreground mb-4">
            Sua carteira DePix ja esta configurada.
          </p>
          <Button asChild>
            <Link href="/depix-wallet">Voltar para a carteira</Link>
          </Button>
        </Card>
      </div>
    );
  }
  if (walletInfoQuery.data?.canRevealMnemonic === false) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <PageHeader title="Configurar carteira" subtitle="Acesso restrito." />
        <Card className="max-w-xl mx-auto p-6 border-amber-500/30 bg-amber-500/5">
          <p className="text-sm text-muted-foreground">
            Apenas um usuario admin do tenant pode configurar a carteira DePix.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title={
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon">
              <Link href="/depix-wallet" aria-label="Voltar">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <span>Configurar carteira DePix</span>
          </div>
        }
        subtitle="Crie uma carteira nova ou importe uma existente. So voce conhece a senha."
      />

      <WizardStepper steps={steps} current={step} />

      {/* ─── PASSO 1 — escolher modo ─── */}
      {step === 1 && (
        <div className="max-w-xl mx-auto space-y-5 animate-in fade-in slide-in-from-right-2 duration-300">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setMode("create")}
              aria-pressed={mode === "create"}
              className={cn(
                "text-left rounded-xl border-2 p-5 transition-all",
                mode === "create"
                  ? "border-primary bg-primary/[0.06] shadow-[0_0_0_4px_var(--primary)]/10"
                  : "border-border hover:border-primary/40",
              )}
            >
              <Sparkles className="h-6 w-6 text-primary mb-2" />
              <p className="font-semibold">Criar nova carteira</p>
              <p className="text-sm text-muted-foreground mt-1">
                Geramos 24 palavras de recuperacao. Voce guarda em local seguro.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setMode("import")}
              aria-pressed={mode === "import"}
              className={cn(
                "text-left rounded-xl border-2 p-5 transition-all",
                mode === "import"
                  ? "border-primary bg-primary/[0.06] shadow-[0_0_0_4px_var(--primary)]/10"
                  : "border-border hover:border-primary/40",
              )}
            >
              <ArrowDownToLine className="h-6 w-6 text-primary mb-2" />
              <p className="font-semibold">Importar existente</p>
              <p className="text-sm text-muted-foreground mt-1">
                Use as 24 palavras de uma carteira Liquid que voce ja possui.
              </p>
            </button>
          </div>

          <div className="flex justify-end gap-2">
            <Button asChild variant="outline">
              <Link href="/depix-wallet">Cancelar</Link>
            </Button>
            <Button onClick={handleModeNext} disabled={mode === null}>
              Continuar
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── PASSO 2 — importar 24 palavras ─── */}
      {step === 2 && mode === "import" && (
        <div className="max-w-xl mx-auto space-y-5 animate-in fade-in slide-in-from-right-2 duration-300">
          <Card className="p-5 sm:p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="import-mnemonic">Frase de recuperacao (24 palavras)</Label>
              <Textarea
                id="import-mnemonic"
                value={importMnemonic}
                onChange={(e) => setImportMnemonic(e.target.value)}
                rows={4}
                className="font-mono"
                placeholder="palavra1 palavra2 ... palavra24"
                autoComplete="off"
                spellCheck={false}
              />
              <p
                className={cn(
                  "text-xs",
                  importWordCount === 24 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
                )}
              >
                {importWordCount} de 24 palavras.
              </p>
            </div>
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground inline-flex gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
              <span>
                Digite as palavras em uma rede confiavel. Qualquer pessoa com esta
                frase controla os fundos da carteira.
              </span>
            </div>
          </Card>

          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
            <Button onClick={() => setStep(3)} disabled={importWordCount !== 24}>
              Continuar
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── PASSO 3 — definir passphrase ─── */}
      {step === 3 && (
        <div className="max-w-xl mx-auto space-y-5 animate-in fade-in slide-in-from-right-2 duration-300">
          <Card className="p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Senha da carteira</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Esta senha cifra a sua carteira. <strong>So voce a conhece</strong> —
              ela e exigida em cada saque e para ver suas 24 palavras. A Arena Tech
              nao tem acesso a ela e nao consegue recupera-la.
            </p>
            <div className="space-y-2">
              <Label htmlFor="passphrase">Senha (min. {MIN_PASSPHRASE} caracteres)</Label>
              <Input
                id="passphrase"
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="passphrase-confirm">Confirme a senha</Label>
              <Input
                id="passphrase-confirm"
                type="password"
                value={passphraseConfirm}
                onChange={(e) => setPassphraseConfirm(e.target.value)}
                autoComplete="new-password"
              />
              {passphraseConfirm.length > 0 && passphrase !== passphraseConfirm && (
                <p className="text-xs text-destructive">As senhas nao coincidem.</p>
              )}
            </div>
          </Card>

          <div className="flex justify-between gap-2">
            <Button
              variant="outline"
              onClick={() => setStep(mode === "import" ? 2 : 1)}
              disabled={setupMutation.isPending}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
            <Button onClick={handleSubmitSetup} disabled={!passphraseValid || setupMutation.isPending}>
              {setupMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Configurando…
                </>
              ) : mode === "import" ? (
                "Importar carteira"
              ) : (
                "Criar carteira"
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ─── PASSO 4 — backup das 24 palavras (apenas create) ─── */}
      {step === 4 && generatedMnemonic && (
        <div className="max-w-xl mx-auto space-y-5 animate-in fade-in slide-in-from-right-2 duration-300">
          <Card className="p-5 sm:p-6 space-y-4 border-amber-500/40">
            <div className="space-y-1">
              <h3 className="font-semibold">Guarde suas 24 palavras</h3>
              <p className="text-sm text-muted-foreground">
                Anote em local seguro e offline. Esta e a unica vez que mostramos a
                frase completa. Com ela voce recupera o acesso caso esqueca a senha.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 rounded border border-amber-500/30 bg-background/70 p-3">
              {generatedWords.map((word, index) => (
                <div key={`${word}-${index}`} className="flex gap-2 rounded bg-muted/40 px-2 py-1">
                  <span className="w-6 text-right font-mono text-xs text-muted-foreground">
                    {index + 1}.
                  </span>
                  <span className="font-mono text-sm">{word}</span>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(generatedMnemonic);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copiado
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar frase
                </>
              )}
            </Button>

            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-muted-foreground inline-flex gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive shrink-0" />
              <span>
                Se voce perder a senha <strong>e</strong> estas 24 palavras, os fundos
                serao perdidos para sempre. Ninguem consegue recupera-los.
              </span>
            </div>
          </Card>

          {/* Confirmacao de backup: digitar a Nª palavra. */}
          <Card className="p-5 sm:p-6 space-y-3">
            <Label htmlFor="challenge">
              Para confirmar, digite a palavra n.º {challengeIndex + 1}
            </Label>
            <Input
              id="challenge"
              value={challengeAnswer}
              onChange={(e) => setChallengeAnswer(e.target.value)}
              className="font-mono"
              placeholder={`palavra ${challengeIndex + 1}`}
              autoComplete="off"
              spellCheck={false}
            />
            {challengeAnswer.length > 0 && !challengeOk && (
              <p className="text-xs text-destructive">Palavra incorreta. Confira a lista acima.</p>
            )}
          </Card>

          <div className="flex justify-end">
            <Button onClick={finish} disabled={!challengeOk}>
              <Check className="mr-2 h-4 w-4" />
              Concluir
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
