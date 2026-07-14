"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, Save } from "lucide-react";
import { PageHeader } from "@/components/domain/page-header";
import { FormSection } from "@/components/domain/forms/form-section";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EntitySelector } from "@/components/domain/entity-selector";
import { toast } from "@/lib/toast";

type Row = {
  productId: string;
  productName: string;
  /** Preenchido quando o produto tem variacoes — uma linha por variacao. */
  variationId: string | null;
  variationLabel: string | null;
  currentStock: number;
  newQuantity: number;
};

type ProductSearchResult = {
  id: string;
  name: string;
  sku: string | null;
  salePrice: unknown;
  currentStock: number;
  hasVariations: boolean;
};

export default function BulkAdjustStockPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState<Row[]>([]);

  const bulkMutation = useMutation(
    trpc.stock.bulkAdjust.mutationOptions({
      onSuccess: (res) => {
        toast.success(`${res.count} produto(s) ajustado(s)`);
        queryClient.invalidateQueries({ queryKey: trpc.stock.list.queryKey() });
        router.push("/stock");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const addRow = async (product: ProductSearchResult) => {
    // Produto com variacoes: expande em uma linha por variacao. O saldo do pai
    // eh a soma das variacoes — ajustar por total agregado nao faz sentido.
    if (product.hasVariations) {
      const variations = (await queryClient.fetchQuery(
        trpc.stock.listVariations.queryOptions({ productId: product.id, active: true }),
      )) as Array<{ id: string; label: string; currentStock: number }>;

      if (variations.length === 0) {
        toast.error(`"${product.name}" nao tem variacoes ativas para ajustar.`);
        return;
      }

      setRows((prev) => {
        const novas = variations
          .filter(
            (v) => !prev.some((r) => r.productId === product.id && r.variationId === v.id),
          )
          .map((v) => ({
            productId: product.id,
            productName: product.name,
            variationId: v.id,
            variationLabel: v.label,
            currentStock: v.currentStock,
            newQuantity: v.currentStock,
          }));
        if (novas.length === 0) {
          toast.error("Variacoes deste produto ja adicionadas");
          return prev;
        }
        return [...prev, ...novas];
      });
      return;
    }

    if (rows.some((r) => r.productId === product.id && r.variationId === null)) {
      toast.error("Produto ja adicionado");
      return;
    }
    setRows((prev) => [
      ...prev,
      {
        productId: product.id,
        productName: product.name,
        variationId: null,
        variationLabel: null,
        currentStock: product.currentStock ?? 0,
        newQuantity: product.currentStock ?? 0,
      },
    ]);
  };

  const rowKey = (r: Pick<Row, "productId" | "variationId">) =>
    `${r.productId}:${r.variationId ?? ""}`;

  const updateQty = (key: string, qty: number) => {
    setRows((prev) =>
      prev.map((r) => (rowKey(r) === key ? { ...r, newQuantity: qty } : r)),
    );
  };

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((r) => rowKey(r) !== key));
  };

  const handleSubmit = () => {
    if (rows.length === 0) {
      toast.error("Adicione ao menos um produto");
      return;
    }
    if (!reason.trim()) {
      toast.error("Informe o motivo do ajuste");
      return;
    }
    bulkMutation.mutate({
      reason: reason.trim(),
      items: rows.map((r) => ({
        productId: r.productId,
        variationId: r.variationId,
        newQuantity: r.newQuantity,
      })),
    });
  };

  return (
    <div>
      <PageHeader
        title="Ajuste em Massa de Estoque"
        subtitle="Atualize o estoque atual de varios produtos de uma vez"
      />

      <div className="space-y-6">
        <FormSection title="Adicionar produto">
          <EntitySelector<ProductSearchResult>
            value=""
            onChange={() => {}}
            onSelect={(p) => {
              void addRow(p);
            }}
            searchFn={async (search) => {
              // Ajuste por quantidade nao se aplica a serializados (saldo deriva
              // dos StockItems) — escondidos da busca para evitar erro tardio.
              return queryClient.fetchQuery(
                trpc.stock.searchProducts.queryOptions({ search, excludeSerialized: true }),
              ) as Promise<ProductSearchResult[]>;
            }}
            getOptionLabel={(p) => `${p.name}${p.sku ? ` — ${p.sku}` : ""}`}
            getOptionValue={(p) => p.id}
            placeholder="Buscar produto para adicionar..."
          />
        </FormSection>

        {rows.length > 0 && (
          <FormSection title={`Produtos selecionados (${rows.length})`}>
            <div className="border border-border rounded-md overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-b border-primary/20 bg-muted/50">
                    <th className="text-left px-4 py-2 font-semibold uppercase text-xs">
                      Produto
                    </th>
                    <th className="text-right px-4 py-2 font-semibold uppercase text-xs w-32">
                      Atual
                    </th>
                    <th className="text-right px-4 py-2 font-semibold uppercase text-xs w-32">
                      Novo
                    </th>
                    <th className="text-right px-4 py-2 font-semibold uppercase text-xs w-32">
                      Diferenca
                    </th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const diff = r.newQuantity - r.currentStock;
                    const key = rowKey(r);
                    return (
                      <tr key={key} className="border-b border-border">
                        <td className="px-4 py-2">
                          {r.productName}
                          {r.variationLabel && (
                            <span className="text-muted-foreground">
                              {" "}
                              · {r.variationLabel}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {r.currentStock}
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            type="number"
                            min={0}
                            value={r.newQuantity}
                            onChange={(e) =>
                              updateQty(key, Math.max(0, Number(e.target.value) || 0))
                            }
                            className="text-right"
                          />
                        </td>
                        <td
                          className={`px-4 py-2 text-right tabular-nums font-medium ${
                            diff > 0
                              ? "text-green-500"
                              : diff < 0
                                ? "text-destructive"
                                : "text-muted-foreground"
                          }`}
                        >
                          {diff > 0 ? `+${diff}` : diff}
                        </td>
                        <td className="px-2 py-1 text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Remover linha do ajuste"
                            onClick={() => removeRow(key)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </FormSection>
        )}

        <FormSection title="Motivo">
          <div className="space-y-2">
            <Label>Motivo do ajuste *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: Contagem fisica do mes, correcao de divergencia, etc."
              rows={2}
            />
          </div>
        </FormSection>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/stock")}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={bulkMutation.isPending || rows.length === 0}>
            <Save className="mr-2 h-4 w-4" />
            Salvar {rows.length > 0 && `(${rows.length})`}
          </Button>
        </div>
      </div>
    </div>
  );
}
