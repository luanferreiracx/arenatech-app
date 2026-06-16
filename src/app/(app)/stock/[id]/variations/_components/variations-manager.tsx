"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MoneyInput } from "@/components/inputs/money-input";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { LoadingState } from "@/components/domain/loading-state";
import { Trash2 } from "lucide-react";

type Draft = {
  sku: string;
  costPrice: number;
  salePrice: number;
  minStock: number;
  active: boolean;
};

/**
 * Editor dedicado de variacoes de um produto JA salvo. Diferente do editor no
 * form do produto (que recria todas as variacoes no submit), este atua por id —
 * updateVariation edita uma variacao sem mexer nas outras nem nos StockItems.
 * Exclusao so para variacao sem estoque (protegido no backend tambem).
 */
export function VariationsManager({ productId }: { productId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  const { data: variations, isLoading } = useQuery(
    trpc.stock.listVariations.queryOptions({ productId }),
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.stock.listVariations.queryKey({ productId }) });

  const updateMutation = useMutation(
    trpc.stock.updateVariation.mutationOptions({
      onSuccess: () => {
        toast.success("Variacao atualizada");
        invalidate();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const deleteMutation = useMutation(
    trpc.stock.deleteVariation.mutationOptions({
      onSuccess: () => {
        toast.success("Variacao excluida");
        setDeleteTarget(null);
        invalidate();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  if (isLoading) return <LoadingState variant="table" />;

  const items = variations ?? [];
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Este produto nao tem variacoes. Adicione variacoes pela edicao do produto.
        </CardContent>
      </Card>
    );
  }

  // Saldo em centavos -> reais para o MoneyInput (que trabalha em centavos).
  const draftFor = (v: (typeof items)[number]): Draft =>
    drafts[v.id] ?? {
      sku: v.sku ?? "",
      costPrice: v.costPrice ? Math.round(Number(v.costPrice) * 100) : 0,
      salePrice: v.salePrice ? Math.round(Number(v.salePrice) * 100) : 0,
      minStock: v.minStock,
      active: v.active,
    };

  const patch = (id: string, base: Draft, p: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [id]: { ...base, ...p } }));

  return (
    <div className="space-y-3">
      {items.map((v) => {
        const d = draftFor(v);
        const saving = updateMutation.isPending && updateMutation.variables?.id === v.id;
        return (
          <Card key={v.id}>
            <CardContent className="pt-6 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">{v.label}</p>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Excluir variacao ${v.label}`}
                  onClick={() => setDeleteTarget({ id: v.id, label: v.label })}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">SKU</Label>
                  <Input
                    value={d.sku}
                    onChange={(e) => patch(v.id, d, { sku: e.target.value })}
                    placeholder="Opcional"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Preco custo</Label>
                  <MoneyInput value={d.costPrice} onChange={(val) => patch(v.id, d, { costPrice: val })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Preco venda</Label>
                  <MoneyInput value={d.salePrice} onChange={(val) => patch(v.id, d, { salePrice: val })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Estoque min</Label>
                  <Input
                    type="number"
                    min={0}
                    value={d.minStock}
                    onChange={(e) => patch(v.id, d, { minStock: Math.max(0, Number(e.target.value) || 0) })}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch checked={d.active} onCheckedChange={(val) => patch(v.id, d, { active: val })} />
                  <Label className="text-sm">Ativa</Label>
                </div>
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() =>
                    updateMutation.mutate({
                      id: v.id,
                      sku: d.sku.trim() || null,
                      costPrice: d.costPrice > 0 ? d.costPrice : null,
                      salePrice: d.salePrice > 0 ? d.salePrice : null,
                      minStock: d.minStock,
                      active: d.active,
                    })
                  }
                >
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Excluir variacao"
        description={`Excluir a variacao "${deleteTarget?.label ?? ""}"? Variacoes com itens em estoque nao podem ser excluidas.`}
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate({ id: deleteTarget.id });
        }}
      />
    </div>
  );
}
