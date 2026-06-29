"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import {
  ALL_PARTNER_SCOPES,
  PARTNER_SCOPE_LABELS,
  type PartnerScope,
} from "@/lib/partner-api/scopes";

export default function PartnerApiPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const keysQuery = useQuery(trpc.partnerApiKey.list.queryOptions());

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<PartnerScope[]>(["depix:read"]);
  // Segredo recém-emitido — mostrado UMA vez.
  const [issuedSecret, setIssuedSecret] = useState<string | null>(null);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: [["partnerApiKey", "list"]] });
  }

  const issueMutation = useMutation(
    trpc.partnerApiKey.issue.mutationOptions({
      onSuccess: (res) => {
        setIssuedSecret(res.plaintextKey);
        setCreateOpen(false);
        setName("");
        setScopes(["depix:read"]);
        invalidate();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const revokeMutation = useMutation(
    trpc.partnerApiKey.revoke.mutationOptions({
      onSuccess: () => {
        toast.success("Chave revogada");
        invalidate();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  function toggleScope(s: PartnerScope) {
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  if (keysQuery.isLoading) return <LoadingState />;
  const keys = keysQuery.data ?? [];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="API de Parceiros"
        subtitle="Credenciais de máquina (API-keys) para integrações externas consumirem a API DePix deste tenant. O segredo é exibido uma única vez."
      />

      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nova chave
        </Button>
      </div>

      <Card className="overflow-hidden">
        {keys.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhuma chave emitida ainda.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {keys.map((k) => {
              const revoked = k.revokedAt != null;
              return (
                <li key={k.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-medium", revoked && "text-muted-foreground line-through")}>
                      {k.name}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      at_{k.keyPrefix}_••••••••
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {k.scopes.map((s) => (
                        <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {s}
                        </span>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      {revoked
                        ? `Revogada em ${new Date(k.revokedAt!).toLocaleString("pt-BR")}`
                        : k.lastUsedAt
                          ? `Último uso: ${new Date(k.lastUsedAt).toLocaleString("pt-BR")}`
                          : "Nunca usada"}
                    </p>
                  </div>
                  {!revoked && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-rose-500 hover:text-rose-600"
                      disabled={revokeMutation.isPending}
                      onClick={() => {
                        if (confirm(`Revogar a chave "${k.name}"? Integrações que a usam param de funcionar.`)) {
                          revokeMutation.mutate({ keyId: k.id });
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Revogar
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Criar chave */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova API-key de parceiro</DialogTitle>
            <DialogDescription>
              Escolha um nome e os escopos. O segredo será exibido uma única vez após criar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="keyName">Nome</Label>
              <Input
                id="keyName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Integração ACME"
              />
            </div>
            <div>
              <Label className="mb-2 block">Escopos</Label>
              <div className="space-y-2">
                {ALL_PARTNER_SCOPES.map((s) => (
                  <label key={s} className="flex items-start gap-2.5 cursor-pointer">
                    <Checkbox
                      checked={scopes.includes(s)}
                      onCheckedChange={() => toggleScope(s)}
                      className="mt-0.5"
                    />
                    <span className="text-sm">{PARTNER_SCOPE_LABELS[s]}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={issueMutation.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => issueMutation.mutate({ name: name.trim(), scopes })}
              disabled={issueMutation.isPending || name.trim().length < 2 || scopes.length === 0}
            >
              {issueMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar chave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Segredo recém-emitido (mostrado 1x) */}
      <Dialog open={issuedSecret != null} onOpenChange={(o) => !o && setIssuedSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              Copie a chave agora
            </DialogTitle>
            <DialogDescription>
              Este é o <strong>único momento</strong> em que o segredo é exibido. Guarde com segurança —
              não conseguimos mostrá-lo de novo.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border bg-muted/40 p-3 flex items-center gap-2">
            <code className="text-xs font-mono break-all flex-1">{issuedSecret}</code>
            <Button size="sm" variant="ghost" onClick={() => issuedSecret && copy(issuedSecret)}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>

          <DialogFooter>
            <Button onClick={() => setIssuedSecret(null)}>Já copiei</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
