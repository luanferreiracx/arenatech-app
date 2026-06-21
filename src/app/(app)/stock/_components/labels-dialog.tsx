"use client";

import { useState, useDeferredValue, useCallback } from "react";
import { Tag, Search, X, Plus, Minus, Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type SelectedItem = { id: string; name: string; barcode: string; qty: number };

function buildLabelsUrl(items: SelectedItem[], mode: "one" | "stock"): string {
  const ids = items.map((i) => i.id).join(",");
  const params = new URLSearchParams({ ids });
  if (mode === "stock") {
    // Não passa qtys — a rota usa currentStock de cada produto.
    params.set("qty", "stock");
    params.set("expand", "true");
  } else {
    params.set("qtys", items.map((i) => i.qty).join(","));
  }
  return `/api/stock/labels?${params.toString()}`;
}

function QtyControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-6 w-6"
        onClick={() => onChange(Math.max(1, value - 1))}
      >
        <Minus className="h-3 w-3" />
      </Button>
      <span className="w-6 text-center text-sm tabular-nums">{value}</span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-6 w-6"
        onClick={() => onChange(value + 1)}
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}

export function LabelsDialog({
  initialIds,
  trigger,
  size = "default",
  buttonLabel = "Etiquetas Niimbot",
}: {
  initialIds?: string[];
  trigger?: React.ReactNode;
  size?: "sm" | "default";
  buttonLabel?: string;
}) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("__all__");
  const [selected, setSelected] = useState<Map<string, SelectedItem>>(new Map());

  const deferredSearch = useDeferredValue(search);

  const categoriesQuery = useQuery(
    trpc.stock.listCategories.queryOptions({ pageSize: 100 }),
  );

  const productsQuery = useQuery(
    trpc.stock.list.queryOptions(
      {
        search: deferredSearch.trim() || undefined,
        categoryId: categoryId !== "__all__" ? categoryId : undefined,
        active: true,
        pageSize: 40,
      },
      { enabled: open },
    ),
  );

  const products = productsQuery.data?.data ?? [];
  const selectedList = Array.from(selected.values());

  const toggle = useCallback((p: { id: string; name: string; barcode: string | null; sku: string | null }) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(p.id)) {
        next.delete(p.id);
      } else {
        next.set(p.id, { id: p.id, name: p.name, barcode: p.barcode ?? p.sku ?? "", qty: 1 });
      }
      return next;
    });
  }, []);

  const updateQty = useCallback((id: string, qty: number) => {
    setSelected((prev) => {
      const item = prev.get(id);
      if (!item) return prev;
      const next = new Map(prev);
      next.set(id, { ...item, qty });
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const allVisibleSelected =
    products.length > 0 && products.every((p) => selected.has(p.id));

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (products.every((p) => next.has(p.id))) {
        products.forEach((p) => next.delete(p.id));
      } else {
        products.forEach((p) => {
          if (!next.has(p.id)) {
            next.set(p.id, { id: p.id, name: p.name, barcode: p.barcode ?? p.sku ?? "", qty: 1 });
          }
        });
      }
      return next;
    });
  }, [products]);

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v && initialIds?.length) {
      // Pré-seleciona os IDs passados via prop (ex.: seleção da tabela)
      // Os nomes serão preenchidos quando os produtos carregarem
    }
    if (!v) {
      setSearch("");
      setCategoryId("__all__");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size={size}>
            <Tag className="mr-2 h-4 w-4" />
            {buttonLabel}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Gerar Etiquetas Niimbot
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 min-h-0 flex-1">
          {/* Filtros */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, SKU ou código de barras..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                autoFocus
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as categorias</SelectItem>
                {(categoriesQuery.data?.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Resultados + Selecionados */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-h-0 flex-1">
            {/* Lista de produtos */}
            <div className="flex flex-col gap-1 min-h-0">
              <div className="flex items-center justify-between px-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Produtos {products.length > 0 && `(${products.length})`}
                </p>
                {products.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-xs text-primary hover:underline"
                  >
                    {allVisibleSelected ? "Desselecionar todos" : "Selecionar todos"}
                  </button>
                )}
              </div>
              <div className="overflow-y-auto flex-1 border rounded-lg divide-y">
                {productsQuery.isLoading ? (
                  <div className="p-2 space-y-2">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
                  </div>
                ) : products.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhum produto encontrado
                  </p>
                ) : (
                  products.map((p) => {
                    const isSelected = selected.has(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggle({ id: p.id, name: p.name, barcode: p.barcode, sku: p.sku })}
                        className={cn(
                          "w-full flex items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                          isSelected && "bg-primary/5",
                        )}
                      >
                        <div className={cn(
                          "mt-0.5 h-4 w-4 shrink-0 rounded border transition-colors",
                          isSelected ? "bg-primary border-primary" : "border-border",
                        )} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-snug">{p.name}</p>
                          {(p.barcode ?? p.sku) && (
                            <p className="text-xs text-muted-foreground font-mono">
                              {p.barcode ?? p.sku}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Selecionados */}
            <div className="flex flex-col gap-1 min-h-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1 flex items-center gap-2">
                Selecionados
                {selectedList.length > 0 && (
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {selectedList.length}
                  </Badge>
                )}
              </p>
              <div className="overflow-y-auto flex-1 border rounded-lg divide-y">
                {selectedList.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Clique nos produtos ao lado para selecionar
                  </p>
                ) : (
                  selectedList.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug truncate">{item.name}</p>
                        {item.barcode && (
                          <p className="text-xs text-muted-foreground font-mono">{item.barcode}</p>
                        )}
                      </div>
                      <QtyControl value={item.qty} onChange={(v) => updateQty(item.id, v)} />
                      <button
                        type="button"
                        onClick={() => remove(item.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors ml-1"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t">
            <p className="text-sm text-muted-foreground">
              {selectedList.length === 0
                ? "Nenhum produto selecionado"
                : `${selectedList.length} produto${selectedList.length > 1 ? "s" : ""} · ${selectedList.reduce((s, i) => s + i.qty, 0)} etiqueta${selectedList.reduce((s, i) => s + i.qty, 0) !== 1 ? "s" : ""}`}
            </p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button disabled={selectedList.length === 0}>
                  <Download className="mr-2 h-4 w-4" />
                  Gerar Excel
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem asChild>
                  <a href={buildLabelsUrl(selectedList, "one")} onClick={() => setOpen(false)}>
                    <span className="flex flex-col">
                      <span>Quantidade definida acima</span>
                      <span className="text-xs text-muted-foreground">
                        Usa os valores de qty que você configurou
                      </span>
                    </span>
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={buildLabelsUrl(selectedList, "stock")} onClick={() => setOpen(false)}>
                    <span className="flex flex-col">
                      <span>Quantidade conforme estoque</span>
                      <span className="text-xs text-muted-foreground">
                        Repete cada etiqueta pelo saldo em estoque
                      </span>
                    </span>
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
