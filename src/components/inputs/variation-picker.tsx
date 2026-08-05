"use client";

import { useId } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

interface VariationPickerProps {
  productId: string | null;
  value: string | null;
  onChange: (variationId: string | null) => void;
  /** Quando true, mostra o estoque atual ao lado de cada variacao. */
  showStock?: boolean;
  label?: string;
}

/**
 * Seletor de variacao do produto (cor, tamanho, capacidade). Reusavel entre
 * entrada/baixa de estoque e PDV. Mostra so quando produto tem variacoes.
 * Retorna null silenciosamente se productId for null.
 */
export function VariationPicker({
  productId,
  value,
  onChange,
  showStock = true,
  label = "Variacao",
}: VariationPickerProps) {
  // Antes do early return: a ordem dos hooks precisa ser estável. O componente
  // aparece várias vezes na mesma tela (um por item do carrinho), então o id
  // não pode ser uma constante literal.
  const selectId = useId();
  const trpc = useTRPC();
  const query = useQuery({
    ...trpc.stock.listVariations.queryOptions({ productId: productId! }),
    enabled: !!productId,
  });

  if (!productId) return null;

  return (
    <div className="space-y-1">
      <Label htmlFor={selectId}>{label} *</Label>
      {query.isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : !query.data || query.data.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          Este produto nao tem variacoes ativas.
        </p>
      ) : (
        <select
          id={selectId}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">Selecione...</option>
          {query.data.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
              {showStock && ` — estoque: ${v.currentStock}`}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
