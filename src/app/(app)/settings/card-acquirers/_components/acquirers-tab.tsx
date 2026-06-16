"use client";

import { useMemo, useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { CARD_KIND_LABELS, type CardKind } from "@/lib/validators/receiving";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/domain/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Building2, Loader2, Pencil, Settings2, Trash2 } from "lucide-react";

interface AcquirerDraft {
  id: string | null;
  name: string;
  receivingAccountId: string | null;
}

interface RateRow {
  cardBrandId: string;
  kind: CardKind;
  installments: number;
  feePercent: number;
  feeFixedCents: number;
  settlementDays: number;
}

const EMPTY_ACQUIRER: AcquirerDraft = { id: null, name: "", receivingAccountId: null };
const NO_ACCOUNT = "__none__";

export function AcquirersTab() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<AcquirerDraft | null>(null);
  const [ratesAcquirerId, setRatesAcquirerId] = useState<string | null>(null);
  const [rates, setRates] = useState<RateRow[]>([]);

  const { data: acquirers, isLoading } = useQuery(trpc.receiving.acquirers.list.queryOptions());
  const { data: accounts } = useQuery(trpc.receiving.accounts.list.queryOptions());
  const { data: brands } = useQuery(trpc.receiving.brands.list.queryOptions());

  const activeBrands = useMemo(() => (brands ?? []).filter((b) => b.active), [brands]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [["receiving", "acquirers"]] });

  const createMutation = useMutation(
    trpc.receiving.acquirers.create.mutationOptions({
      onSuccess: () => {
        toast.success("Adquirente criada!");
        invalidate();
        setDraft(null);
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const updateMutation = useMutation(
    trpc.receiving.acquirers.update.mutationOptions({
      onSuccess: () => {
        toast.success("Adquirente atualizada!");
        invalidate();
        setDraft(null);
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const toggleMutation = useMutation(
    trpc.receiving.acquirers.toggle.mutationOptions({
      onSuccess: invalidate,
      onError: (e) => toast.error(e.message),
    }),
  );

  const upsertRatesMutation = useMutation(
    trpc.receiving.rates.upsert.mutationOptions({
      onSuccess: () => {
        toast.success("Taxas salvas!");
        setRatesAcquirerId(null);
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const ratesQuery = useQuery({
    ...trpc.receiving.rates.listByAcquirer.queryOptions({ acquirerId: ratesAcquirerId ?? "" }),
    enabled: ratesAcquirerId !== null,
  });

  const accountName = (id: string | null) =>
    accounts?.find((a) => a.id === id)?.name ?? null;

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSave = () => {
    if (!draft || draft.name.trim().length === 0) return;
    const receivingAccountId = draft.receivingAccountId;
    if (draft.id) {
      updateMutation.mutate({ id: draft.id, name: draft.name.trim(), receivingAccountId });
    } else {
      createMutation.mutate({ name: draft.name.trim(), receivingAccountId });
    }
  };

  const openRatesEditor = (acquirerId: string) => {
    setRatesAcquirerId(acquirerId);
    setRates([]); // será preenchido quando a query resolver (handleRatesLoaded)
  };

  // Preenche o estado editável quando a query de taxas resolve para o id atual.
  // Deriva no render via key — sem useEffect.
  const loadedKey = ratesQuery.data && ratesAcquirerId ? `${ratesAcquirerId}:${ratesQuery.dataUpdatedAt}` : null;
  const [appliedKey, setAppliedKey] = useState<string | null>(null);
  if (loadedKey && loadedKey !== appliedKey && ratesQuery.data) {
    setAppliedKey(loadedKey);
    setRates(
      ratesQuery.data.map((r) => ({
        cardBrandId: r.cardBrandId,
        kind: r.kind as CardKind,
        installments: r.installments,
        feePercent: r.feePercent,
        feeFixedCents: r.feeFixedCents,
        settlementDays: r.settlementDays,
      })),
    );
  }

  const addRateRow = () => {
    const firstBrand = activeBrands[0]?.id;
    if (!firstBrand) {
      toast.error("Cadastre uma bandeira antes de criar taxas.");
      return;
    }
    const lastInstall = rates.length > 0 ? Math.max(...rates.map((r) => r.installments)) : 0;
    setRates((prev) => [
      ...prev,
      {
        cardBrandId: firstBrand,
        kind: "CREDIT",
        installments: lastInstall + 1,
        feePercent: 0,
        feeFixedCents: 0,
        settlementDays: 30,
      },
    ]);
  };

  const updateRate = <K extends keyof RateRow>(idx: number, field: K, value: RateRow[K]) => {
    setRates((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  const removeRate = (idx: number) => setRates((prev) => prev.filter((_, i) => i !== idx));

  const saveRates = () => {
    if (!ratesAcquirerId) return;
    upsertRatesMutation.mutate({
      acquirerId: ratesAcquirerId,
      rates: rates.map((r) => ({
        cardBrandId: r.cardBrandId,
        kind: r.kind,
        installments: r.installments,
        feePercent: r.feePercent,
        feeFixed: r.feeFixedCents,
        settlementDays: r.settlementDays,
      })),
    });
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setDraft({ ...EMPTY_ACQUIRER })}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Adquirente
        </Button>
      </div>

      {!acquirers || acquirers.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Nenhuma adquirente"
          description="Cadastre suas maquininhas / credenciadoras (Stone, Cielo, Rede…) e suas taxas."
          action={
            <Button onClick={() => setDraft({ ...EMPTY_ACQUIRER })}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {acquirers.map((acquirer) => (
            <Card key={acquirer.id} className={acquirer.active ? "" : "opacity-60"}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">{acquirer.name}</CardTitle>
                  <Switch
                    checked={acquirer.active}
                    onCheckedChange={(active) => toggleMutation.mutate({ id: acquirer.id, active })}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {accountName(acquirer.receivingAccountId) ? (
                  <Badge variant="outline">Deposita em: {accountName(acquirer.receivingAccountId)}</Badge>
                ) : (
                  <p className="text-xs text-muted-foreground">Sem conta de depósito vinculada</p>
                )}
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => openRatesEditor(acquirer.id)}>
                    <Settings2 className="w-3.5 h-3.5 mr-1" />
                    Taxas
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setDraft({
                        id: acquirer.id,
                        name: acquirer.name,
                        receivingAccountId: acquirer.receivingAccountId,
                      })
                    }
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/edit acquirer dialog */}
      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Editar adquirente" : "Nova adquirente"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Nome *</label>
                <Input
                  autoFocus
                  value={draft.name}
                  placeholder="Ex: Stone, Cielo, Rede"
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Conta de depósito</label>
                <Select
                  value={draft.receivingAccountId ?? NO_ACCOUNT}
                  onValueChange={(v) =>
                    setDraft({ ...draft, receivingAccountId: v === NO_ACCOUNT ? null : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ACCOUNT}>Nenhuma</SelectItem>
                    {(accounts ?? [])
                      .filter((a) => a.active)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !draft?.name.trim()}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rates editor dialog */}
      <Dialog
        open={ratesAcquirerId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRatesAcquirerId(null);
            setAppliedKey(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Taxas da adquirente</DialogTitle>
            <DialogDescription>
              Defina a taxa (% + fixo), o prazo de liquidação (D+N) e a bandeira para cada
              combinação de tipo (crédito/débito) e número de parcelas.
            </DialogDescription>
          </DialogHeader>

          {ratesQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Tabela de taxas</h3>
                <Button variant="outline" size="sm" onClick={addRateRow}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Adicionar
                </Button>
              </div>

              {rates.length === 0 ? (
                <p className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-4 text-center">
                  Nenhuma taxa. Clique em &quot;Adicionar&quot; para criar a primeira.
                </p>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {rates.map((rate, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 items-end border border-border rounded-md p-2"
                    >
                      <div className="col-span-3 space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase">Bandeira</label>
                        <Select
                          value={rate.cardBrandId}
                          onValueChange={(v) => updateRate(idx, "cardBrandId", v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {activeBrands.map((b) => (
                              <SelectItem key={b.id} value={b.id}>
                                {b.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase">Tipo</label>
                        <Select
                          value={rate.kind}
                          onValueChange={(v) => updateRate(idx, "kind", v as CardKind)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.entries(CARD_KIND_LABELS) as [CardKind, string][]).map(
                              ([v, lab]) => (
                                <SelectItem key={v} value={v}>
                                  {lab}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-1 space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase">Parc</label>
                        <Input
                          type="number"
                          min={1}
                          max={36}
                          value={rate.installments}
                          onChange={(e) =>
                            updateRate(idx, "installments", parseInt(e.target.value) || 1)
                          }
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase">Taxa %</label>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          max={100}
                          value={rate.feePercent}
                          onChange={(e) =>
                            updateRate(idx, "feePercent", parseFloat(e.target.value) || 0)
                          }
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase">Fixo R$</label>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={(rate.feeFixedCents / 100).toFixed(2)}
                          onChange={(e) =>
                            updateRate(
                              idx,
                              "feeFixedCents",
                              Math.round((parseFloat(e.target.value) || 0) * 100),
                            )
                          }
                        />
                      </div>
                      <div className="col-span-1 space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase">D+</label>
                        <Input
                          type="number"
                          min={0}
                          max={180}
                          value={rate.settlementDays}
                          onChange={(e) =>
                            updateRate(idx, "settlementDays", parseInt(e.target.value) || 0)
                          }
                        />
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => removeRate(idx)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setRatesAcquirerId(null)}>
              Cancelar
            </Button>
            <Button onClick={saveRates} disabled={upsertRatesMutation.isPending}>
              {upsertRatesMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar taxas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
