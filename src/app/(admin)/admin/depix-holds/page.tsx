"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpRight, Check, Loader2 } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
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

function formatBRL(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDate(d: Date | string): string {
  return new Date(d).toLocaleString("pt-BR");
}

/**
 * /admin/depix-holds — revisão humana dos saques externos RETIDOS (HELD).
 * Nenhum reembolso se move sozinho: aqui o admin devolve o valor ao endereço
 * allowlisted do tenant (único destino permitido) ou resolve manualmente.
 */
export default function DepixHoldsAdminPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [resolveTarget, setResolveTarget] = useState<{ id: string; number: string } | null>(null);
  const [note, setNote] = useState("");

  const listQuery = useQuery({
    ...trpc.depixHoldsAdmin.list.queryOptions(),
    refetchInterval: 30_000,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.depixHoldsAdmin.list.queryKey() });

  const refundMutation = useMutation(
    trpc.depixHoldsAdmin.refund.mutationOptions({
      onSuccess: (res) => {
        if (res.ok) toast.success("Reembolso autorizado. Enviando ao endereço do tenant.");
        else toast.error(res.reason ?? "Não foi possível reembolsar.");
        void invalidate();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const resolveMutation = useMutation(
    trpc.depixHoldsAdmin.resolve.mutationOptions({
      onSuccess: (res) => {
        if (res.ok) toast.success("Saque resolvido manualmente.");
        else toast.error(res.reason ?? "Não foi possível resolver.");
        setResolveTarget(null);
        setNote("");
        void invalidate();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  if (listQuery.isLoading) return <LoadingState />;
  const holds = listQuery.data ?? [];

  return (
    <div className="space-y-5 sm:space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Saques retidos (revisão)"
        subtitle="Saques externos que não puderam ser repassados. Nada se move sozinho — você decide."
      />

      {holds.length === 0 ? (
        <Card className="p-8 text-center">
          <Check className="mx-auto mb-3 h-8 w-8 text-emerald-500" />
          <p className="text-sm text-muted-foreground">Nenhum saque retido no momento.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {holds.map((h) => {
            const refundBusy = refundMutation.isPending && refundMutation.variables?.withdrawId === h.id;
            return (
              <Card key={h.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{h.number}</span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3" />
                        Retido
                      </span>
                      <span className="truncate text-sm text-muted-foreground">{h.tenantName}</span>
                    </div>

                    <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
                      <p className="min-w-0 break-words text-sm text-muted-foreground">
                        {h.reason ?? "Motivo não informado"}
                      </p>
                    </div>

                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
                      <div>
                        <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Recebido</dt>
                        <dd className="font-mono tabular-nums font-semibold">{formatBRL(h.receivedCents)}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Esperado</dt>
                        <dd className="font-mono tabular-nums text-muted-foreground">{formatBRL(h.expectedCents)}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Recebido em</dt>
                        <dd className="text-muted-foreground">{formatDate(h.createdAt)}</dd>
                      </div>
                    </dl>

                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Endereço de reembolso (allowlist do tenant)
                      </p>
                      <p className="min-w-0 break-all font-mono text-xs">{h.refundAddress ?? "— (tenant sem endereço cadastrado)"}</p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2 lg:flex-col">
                    <Button
                      size="sm"
                      disabled={!h.refundAddress || !h.receivedCents || refundBusy}
                      onClick={() => refundMutation.mutate({ withdrawId: h.id })}
                    >
                      {refundBusy ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowUpRight className="mr-1 h-4 w-4" />
                      )}
                      Reembolsar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setResolveTarget({ id: h.id, number: h.number })}
                    >
                      Resolver
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </ul>
      )}

      <Dialog
        open={resolveTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setResolveTarget(null);
            setNote("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolver manualmente</DialogTitle>
            <DialogDescription>
              Fecha o saque {resolveTarget?.number} sem mover dinheiro (tratado fora da
              plataforma). O DePix permanece na carteira de intermediação.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="resolve-note">Nota (obrigatória)</Label>
            <Input
              id="resolve-note"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              placeholder="Ex.: devolvido manualmente via carteira X, ticket #123"
            />
          </div>
          <DialogFooter>
            <Button
              disabled={note.trim().length < 3 || resolveMutation.isPending}
              onClick={() => {
                if (resolveTarget) resolveMutation.mutate({ withdrawId: resolveTarget.id, note: note.trim() });
              }}
            >
              {resolveMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Marcar resolvido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
