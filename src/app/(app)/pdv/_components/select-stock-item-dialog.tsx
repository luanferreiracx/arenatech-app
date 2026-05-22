"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Smartphone, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

interface StockItemOption {
  id: string;
  imei: string | null;
  serialNumber: string | null;
  condition: string;
  conservationGrade: string | null;
  batteryHealth: number | null;
  costPrice: number;
  suggestedSalePrice: number | null;
}

export interface SelectStockItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string | null;
  productName: string;
  onSelect: (stockItem: StockItemOption) => void;
}

/**
 * Modal de selecao de unidade serializada (IMEI/serial) para o PDV.
 * Paridade Laravel `pdv/partials/modal-selecionar-imei.blade.php`.
 *
 * Lista os StockItems com status AVAILABLE do produto, mostrando IMEI/serial,
 * condicao e preco sugerido. Operador escolhe qual aparelho esta vendendo.
 */
export function SelectStockItemDialog({
  open,
  onOpenChange,
  productId,
  productName,
  onSelect,
}: SelectStockItemDialogProps) {
  const trpc = useTRPC();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const itemsQuery = useQuery(
    trpc.stock.listStockItems.queryOptions(
      { productId: productId ?? undefined, availableOnly: true, pageSize: 50 },
      { enabled: open && !!productId },
    ),
  );

  // O endpoint retorna Decimal (string) para precos — convertemos para
  // centavos aqui pra manter o resto da UI em numbers.
  const rawItems = itemsQuery.data?.data ?? [];
  const items: StockItemOption[] = rawItems.map((it) => ({
    id: it.id,
    imei: it.imei,
    serialNumber: it.serialNumber,
    condition: it.condition,
    conservationGrade: it.conservationGrade,
    batteryHealth: it.batteryHealth,
    costPrice: Math.round(Number(it.costPrice) * 100),
    suggestedSalePrice: it.suggestedSalePrice != null
      ? Math.round(Number(it.suggestedSalePrice) * 100)
      : null,
  }));

  const handleConfirm = () => {
    const selected = items.find((i) => i.id === selectedId);
    if (selected) {
      onSelect(selected);
      onOpenChange(false);
      setSelectedId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            Selecione o aparelho
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{productName}</span> — escolha qual unidade especifica esta sendo vendida.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 py-2">
          {itemsQuery.isLoading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Carregando aparelhos disponiveis...
            </div>
          )}
          {!itemsQuery.isLoading && items.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum aparelho disponivel para este produto.
            </div>
          )}
          {items.map((item) => (
            <label
              key={item.id}
              className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                selectedId === item.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
              }`}
            >
              <input
                type="radio"
                name="stockItem"
                checked={selectedId === item.id}
                onChange={() => setSelectedId(item.id)}
                className="mt-1 accent-primary"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono font-medium">
                    {item.imei ?? item.serialNumber ?? "Sem IMEI/Serial"}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-muted">
                    {item.condition === "NEW" ? "Novo" : item.condition === "USED" ? "Usado" : item.condition}
                  </span>
                  {item.conservationGrade && (
                    <span className="text-xs text-muted-foreground">Grau {item.conservationGrade}</span>
                  )}
                  {item.batteryHealth != null && (
                    <span className="text-xs text-muted-foreground">Bateria {item.batteryHealth}%</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Custo: {formatCurrency(item.costPrice)}
                  {item.suggestedSalePrice != null && (
                    <> · Venda sugerida: {formatCurrency(item.suggestedSalePrice)}</>
                  )}
                </div>
              </div>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedId}>
            Adicionar ao carrinho
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
