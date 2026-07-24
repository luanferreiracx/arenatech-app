"use client";
import { formatCentsBRL as formatCurrency } from "@/lib/format";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";


interface PriceCheckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PriceCheckDialog({ open, onOpenChange }: PriceCheckDialogProps) {
  const trpc = useTRPC();
  const [term, setTerm] = useState("");

  const searchQuery = useQuery(
    trpc.sale.searchProducts.queryOptions(
      { query: term, withStock: false },
      { enabled: term.length >= 2 },
    ),
  );

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setTerm("");
    }
    onOpenChange(newOpen);
  };

  const products = (searchQuery.data ?? []) as Array<{
    id: string;
    name: string;
    sku: string | null;
    salePrice: number;
    currentStock: number;
  }>;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Consulta de Preco</DialogTitle>
          <DialogDescription>
            Busque um produto para verificar o preco e estoque
          </DialogDescription>
        </DialogHeader>

        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Buscar produto por nome, codigo..."
          autoFocus
          autoComplete="off"
        />

        <div className="max-h-96 overflow-y-auto space-y-2">
          {term.length < 2 && (
            <p className="text-muted-foreground text-center py-8 text-sm">
              Digite para buscar um produto.
            </p>
          )}

          {searchQuery.isLoading && (
            <p className="text-muted-foreground text-center py-8 text-sm">
              Buscando...
            </p>
          )}

          {term.length >= 2 && !searchQuery.isLoading && products.length === 0 && (
            <p className="text-muted-foreground text-center py-8 text-sm">
              Nenhum produto encontrado.
            </p>
          )}

          {products.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-4 p-3 bg-muted/50 border border-border rounded-lg hover:border-primary/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{p.name}</div>
                {p.sku && (
                  <div className="text-xs text-muted-foreground">{p.sku}</div>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-xl font-bold text-primary">
                  {formatCurrency(p.salePrice)}
                </div>
                <div
                  className={cn(
                    "text-xs",
                    p.currentStock <= 0
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {p.currentStock} em estoque
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
