"use client";
import { formatCentsBRL as formatCurrency } from "@/lib/format";

import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingState } from "@/components/domain/loading-state";

interface SelectVariationDialogProps {
  productId: string | null;
  productName: string;
  onClose: () => void;
  onSelect: (variation: { id: string; salePrice: number; label: string }) => void;
}


/**
 * Modal de selecao de variacao para produtos com `has_variations=true`.
 * Lista todas as variacoes ativas mostrando atributos (cor, tamanho, etc) +
 * preco efetivo (fallback no preco do produto pai se a variacao nao tem
 * preco proprio). Paridade Laravel modal-selecionar-variacao.
 */
export function SelectVariationDialog({
  productId,
  productName,
  onClose,
  onSelect,
}: SelectVariationDialogProps) {
  const trpc = useTRPC();

  const query = useQuery({
    ...trpc.sale.listProductVariations.queryOptions({ productId: productId! }),
    enabled: !!productId,
  });

  return (
    <Dialog open={!!productId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Selecione a variacao</DialogTitle>
          <DialogDescription>{productName}</DialogDescription>
        </DialogHeader>

        {query.isLoading ? (
          <LoadingState />
        ) : !query.data || query.data.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Nenhuma variacao ativa para este produto.
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {query.data.map((v) => {
              const outOfStock = v.currentStock <= 0;
              return (
              <button
                key={v.id}
                type="button"
                disabled={outOfStock}
                onClick={() =>
                  onSelect({ id: v.id, salePrice: v.salePrice, label: v.label })
                }
                className="w-full text-left p-3 border border-border rounded-md hover:border-primary hover:bg-accent transition-colors flex items-center justify-between gap-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-transparent"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{v.label}</div>
                  <div className="text-xs text-muted-foreground flex gap-2">
                    {v.sku && <span>SKU: {v.sku}</span>}
                    <span>
                      Estoque:{" "}
                      <span
                        className={
                          v.currentStock <= 0
                            ? "text-destructive font-medium"
                            : v.currentStock < 5
                              ? "text-warning font-medium"
                              : ""
                        }
                      >
                        {v.currentStock}
                      </span>
                    </span>
                  </div>
                </div>
                <div className="font-semibold tabular-nums whitespace-nowrap">
                  {formatCurrency(v.salePrice)}
                </div>
              </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
