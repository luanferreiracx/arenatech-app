"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  X,
  ShoppingCart,
  User,
  Tag,
  RotateCcw,
  CreditCard,
  DollarSign,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { EntitySelector } from "@/components/domain/entity-selector";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { PaymentDialog } from "./payment-dialog";
import { DiscountDialog } from "./discount-dialog";
import { PriceCheckDialog } from "./price-check-dialog";

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

type DraftSale = {
  id: string;
  items: DraftItem[];
  subtotal: number;
  discountAmount: number;
  discountType: string | null;
  discountValue: number;
  totalAmount: number;
  customerId: string | null;
};

type DraftItem = {
  id: string;
  productId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  discount: number;
  total: number;
};

type SearchProduct = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  salePrice: number;
  costPrice: number;
  currentStock: number;
};

export function PdvScreen() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showPriceCheckDialog, setShowPriceCheckDialog] = useState(false);
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [customerName, setCustomerName] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // -- Create Draft (idempotent: reuses existing) --
  const createDraftMutation = useMutation(
    trpc.sale.createDraft.mutationOptions(),
  );

  const initDraft = useCallback(() => {
    setDraftError(null);
    createDraftMutation.mutate(undefined, {
      onSuccess: (data) => {
        const sale = data as unknown as DraftSale;
        setDraftId(sale.id);
        setDraftError(null);
      },
      onError: (err) => {
        setDraftError(err.message);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Wrap in queueMicrotask to avoid synchronous setState warning
    queueMicrotask(() => {
      initDraft();
    });
  }, [initDraft]);

  // -- Get Draft --
  const draftQuery = useQuery(
    trpc.sale.getDraft.queryOptions(
      { id: draftId! },
      { enabled: !!draftId, refetchOnWindowFocus: false },
    ),
  );

  const draft = draftQuery.data as unknown as DraftSale | undefined;
  const items: DraftItem[] = draft?.items ?? [];

  // -- Search Products --
  const searchQuery = useQuery(
    trpc.sale.searchProducts.queryOptions(
      { query: searchTerm, withStock: true },
      { enabled: searchTerm.length >= 2 },
    ),
  );

  // -- Mutations --
  const addItemMutation = useMutation(trpc.sale.addItem.mutationOptions());
  const updateItemMutation = useMutation(
    trpc.sale.updateItemQuantity.mutationOptions(),
  );
  const removeItemMutation = useMutation(
    trpc.sale.removeItem.mutationOptions(),
  );
  const applyDiscountMutation = useMutation(
    trpc.sale.applyDiscount.mutationOptions(),
  );
  const setCustomerMutation = useMutation(
    trpc.sale.setCustomer.mutationOptions(),
  );

  const invalidateDraft = useCallback(() => {
    if (draftId) {
      queryClient.invalidateQueries({
        queryKey: trpc.sale.getDraft.queryKey({ id: draftId }),
      });
    }
  }, [draftId, queryClient, trpc.sale.getDraft]);

  // -- Product Search --
  const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setShowResults(e.target.value.length >= 2);
  };

  const handleAddProduct = (product: SearchProduct) => {
    if (!draftId) {
      toast.error("Aguarde o rascunho ser criado ou reinicie a venda.");
      return;
    }

    // Check if already in cart, subtract from displayed stock
    const inCart =
      items
        .filter((i) => i.productId === product.id)
        .reduce((sum, i) => sum + i.quantity, 0) ?? 0;
    if (product.currentStock - inCart <= 0) {
      toast.error("Estoque insuficiente. Todo estoque ja esta no carrinho.");
      return;
    }

    addItemMutation.mutate(
      {
        saleId: draftId,
        productId: product.id,
        quantity: 1,
        unitPrice: product.salePrice,
      },
      {
        onSuccess: () => {
          invalidateDraft();
          setSearchTerm("");
          setShowResults(false);
          searchRef.current?.focus();
        },
        onError: (err) => {
          toast.error(err.message);
        },
      },
    );
  };

  const handleUpdateQuantity = (itemId: string, quantity: number) => {
    if (!draftId || quantity < 1) return;
    updateItemMutation.mutate(
      { saleId: draftId, itemId, quantity },
      {
        onSuccess: () => invalidateDraft(),
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const handleRemoveItem = (itemId: string, description: string) => {
    if (!draftId) return;
    removeItemMutation.mutate(
      { saleId: draftId, itemId },
      {
        onSuccess: () => {
          invalidateDraft();
          toast.success(`${description} removido da venda`);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  // -- Inline price editing --
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingPrice, setEditingPrice] = useState("");

  const handleStartEditPrice = (itemId: string, currentPrice: number) => {
    setEditingItemId(itemId);
    setEditingPrice((currentPrice / 100).toFixed(2));
  };

  const handleSavePrice = (itemId: string) => {
    if (!draftId) return;
    const newPriceCents = Math.round((parseFloat(editingPrice) || 0) * 100);
    const item = items.find((i) => i.id === itemId);
    if (!item || newPriceCents === item.unitPrice) {
      setEditingItemId(null);
      return;
    }

    // Update via addItem with same product to update price
    // Actually we need an updatePrice endpoint - for now, rebuild with remove+add
    // Since we don't have a dedicated price update procedure, we skip inline editing
    // and just close the editor
    setEditingItemId(null);
    toast.info("Edicao de preco inline sera implementada em breve.");
  };

  // -- Customer --
  const handleSelectCustomer = (id: string | undefined) => {
    setCustomerId(id);
    if (!draftId || !id) return;
    setCustomerMutation.mutate(
      { saleId: draftId, customerId: id ?? null },
      {
        onSuccess: () => {
          setShowCustomerDialog(false);
        },
      },
    );
  };

  const handleRemoveCustomer = () => {
    setCustomerId(undefined);
    setCustomerName(null);
    if (!draftId) return;
    setCustomerMutation.mutate({ saleId: draftId, customerId: null });
  };

  // -- Discount --
  const handleApplyDiscount = (
    type: "fixed" | "percentage",
    value: number,
    reason: string | null,
  ) => {
    if (!draftId) return;
    applyDiscountMutation.mutate(
      {
        saleId: draftId,
        discountType: type,
        discountValue: type === "fixed" ? Math.round(value * 100) : value,
        discountReason: reason,
      },
      {
        onSuccess: () => {
          invalidateDraft();
          setShowDiscountDialog(false);
          toast.success("Desconto aplicado");
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  // -- Abandon Draft --
  const abandonDraftMutation = useMutation(
    trpc.sale.abandonDraft.mutationOptions(),
  );

  // -- New Sale (restart) --
  const handleNewSale = () => {
    if (
      items.length > 0 &&
      !confirm("Tem certeza? Todos os itens do carrinho serao removidos.")
    )
      return;
    setDraftId(null);
    setCustomerId(undefined);
    setCustomerName(null);
    abandonDraftMutation.mutate(undefined, {
      onSuccess: () => {
        initDraft();
      },
      onError: (err) => {
        toast.error(`Erro ao descartar rascunho: ${err.message}`);
      },
    });
  };

  // -- Keyboard shortcuts --
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA";

      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (e.key === "F8") {
        if (isInput && target !== searchRef.current) return;
        e.preventDefault();
        if (items.length > 0) setShowPaymentDialog(true);
      }
      if (e.key === "Escape" && showResults) {
        setShowResults(false);
        setSearchTerm("");
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, showResults]);

  // Close search results on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const subtotal = draft?.subtotal ?? 0;
  const discountAmount = draft?.discountAmount ?? 0;
  const totalAmount = draft?.totalAmount ?? 0;

  // -- Error state: draft creation failed --
  if (draftError && !draftId) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-80px)]">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <AlertTriangle className="mx-auto h-12 w-12 text-destructive opacity-60" />
            <h2 className="text-lg font-semibold">
              Erro ao inicializar o PDV
            </h2>
            <p className="text-sm text-muted-foreground">{draftError}</p>
            <Button onClick={initDraft} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get adjusted stock for search results (subtract items already in cart)
  const getAdjustedStock = (product: SearchProduct) => {
    const inCart =
      items
        .filter((i) => i.productId === product.id)
        .reduce((sum, i) => sum + i.quantity, 0) ?? 0;
    return product.currentStock - inCart;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-4 h-[calc(100vh-80px)]">
      {/* -- Left: Products + Cart -- */}
      <div className="flex flex-col min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-foreground">
            PDV - Ponto de Venda
          </h1>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-xs"
              onClick={() => setShowPriceCheckDialog(true)}
            >
              <DollarSign className="h-4 w-4" />
              Consultar Preco
            </Button>
            <span className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm font-bold">
              Nova Venda
            </span>
          </div>
        </div>

        {/* Search */}
        <div ref={searchContainerRef} className="relative mb-3 z-20">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={searchTerm}
              onChange={handleSearchInput}
              onFocus={() => searchTerm.length >= 2 && setShowResults(true)}
              placeholder="Buscar produto por nome, SKU ou codigo de barras..."
              className="pl-10 h-11 text-base"
              autoComplete="off"
              autoFocus
            />
          </div>

          {/* Search results dropdown */}
          {showResults && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-card border border-border rounded-md shadow-lg max-h-72 overflow-y-auto">
              {searchQuery.isLoading && (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  Buscando...
                </div>
              )}
              {searchQuery.data && searchQuery.data.length === 0 && (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  Nenhum produto encontrado
                </div>
              )}
              {(searchQuery.data as SearchProduct[] | undefined)
                ?.filter((p) => getAdjustedStock(p) > 0)
                .map((product) => {
                  const adjustedStock = getAdjustedStock(product);
                  return (
                    <button
                      key={product.id}
                      type="button"
                      className="w-full flex items-center justify-between p-3 hover:bg-accent/50 transition-colors border-b border-border last:border-b-0 text-left"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleAddProduct(product);
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {product.name}
                        </div>
                        {product.sku && (
                          <div className="text-xs text-muted-foreground">
                            {product.sku}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 ml-3">
                        <span className="text-sm font-semibold text-primary">
                          {formatCurrency(product.salePrice)}
                        </span>
                        <span
                          className={cn(
                            "text-xs font-semibold px-1.5 py-0.5 rounded",
                            adjustedStock > 3
                              ? "bg-green-500/15 text-green-500"
                              : adjustedStock > 0
                                ? "bg-yellow-500/15 text-yellow-500"
                                : "bg-red-500/15 text-red-500",
                          )}
                        >
                          {adjustedStock} un
                        </span>
                      </div>
                    </button>
                  );
                })}
              {searchQuery.data &&
                searchQuery.data.length > 0 &&
                (searchQuery.data as SearchProduct[]).filter(
                  (p) => getAdjustedStock(p) > 0,
                ).length === 0 && (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    Nenhum produto encontrado (ou todo estoque ja esta no
                    carrinho)
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Cart table */}
        <Card className="flex-1 overflow-hidden flex flex-col relative z-10">
          <div className="overflow-y-auto flex-1">
            <table className="w-full">
              <thead className="sticky top-0 bg-muted/50 z-10">
                <tr className="border-b-2 border-primary/20">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Produto
                  </th>
                  <th className="text-center px-2 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground w-24">
                    Qtd
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground w-32">
                    Preco Unit.
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground w-28">
                    Subtotal
                  </th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="text-center py-12 text-muted-foreground"
                    >
                      <ShoppingCart className="mx-auto h-10 w-10 mb-3 opacity-30" />
                      <p>Nenhum item adicionado. Busque um produto acima.</p>
                      <p className="text-xs mt-1">
                        Pressione F2 para focar na busca
                      </p>
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-border hover:bg-accent/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-sm">
                          {item.description}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() =>
                              item.quantity > 1
                                ? handleUpdateQuantity(
                                    item.id,
                                    item.quantity - 1,
                                  )
                                : handleRemoveItem(item.id, item.description)
                            }
                          >
                            -
                          </Button>
                          <span className="w-8 text-center text-sm font-medium">
                            {item.quantity}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() =>
                              handleUpdateQuantity(item.id, item.quantity + 1)
                            }
                          >
                            +
                          </Button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        {editingItemId === item.id ? (
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            className="w-24 h-7 text-right text-sm ml-auto"
                            value={editingPrice}
                            onChange={(e) => setEditingPrice(e.target.value)}
                            onBlur={() => handleSavePrice(item.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSavePrice(item.id);
                              if (e.key === "Escape") setEditingItemId(null);
                            }}
                            autoFocus
                          />
                        ) : (
                          <button
                            type="button"
                            className="hover:text-primary hover:underline decoration-dotted cursor-pointer"
                            onClick={() =>
                              handleStartEditPrice(item.id, item.unitPrice)
                            }
                            title="Clique para editar o preco"
                          >
                            {formatCurrency(item.unitPrice)}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium">
                        {formatCurrency(item.total)}
                      </td>
                      <td className="px-2 py-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() =>
                            handleRemoveItem(item.id, item.description)
                          }
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* -- Right: Summary + Actions -- */}
      <div className="flex flex-col gap-3">
        {/* Customer */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {customerId && customerName ? (
              <div className="flex items-center justify-between bg-muted/50 rounded-md p-2.5">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{customerName}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveCustomer}
                  className="text-xs shrink-0"
                >
                  Trocar
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => setShowCustomerDialog(true)}
              >
                <User className="h-4 w-4" />
                Selecionar Cliente
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Summary */}
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm text-destructive">
                <span>Desconto</span>
                <span>-{formatCurrency(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-xl font-bold pt-2 border-t-2 border-primary/20">
              <span>TOTAL</span>
              <span className="text-primary">
                {formatCurrency(totalAmount)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col gap-2 mt-auto">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => setShowDiscountDialog(true)}
          >
            <Tag className="h-4 w-4" />
            Desconto
          </Button>

          <Button
            className="w-full h-12 text-base gap-2"
            disabled={items.length === 0}
            onClick={() => setShowPaymentDialog(true)}
          >
            <CreditCard className="h-5 w-5" />
            Finalizar Venda
          </Button>

          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span>
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono border border-border">
                F2
              </kbd>{" "}
              buscar
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono border border-border">
                F8
              </kbd>{" "}
              finalizar
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono border border-border">
                Esc
              </kbd>{" "}
              cancelar
            </span>
          </div>

          <Button
            variant="outline"
            className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={handleNewSale}
          >
            <RotateCcw className="h-4 w-4" />
            Reiniciar Venda
          </Button>

          <Button
            variant="ghost"
            className="w-full"
            onClick={() => router.push("/pdv/history")}
          >
            Historico de Vendas
          </Button>
        </div>
      </div>

      {/* -- Customer Dialog -- */}
      <Dialog open={showCustomerDialog} onOpenChange={setShowCustomerDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Selecionar Cliente</DialogTitle>
            <DialogDescription>
              Busque o cliente pelo nome, CPF ou telefone
            </DialogDescription>
          </DialogHeader>
          <EntitySelector
            value={customerId}
            onChange={handleSelectCustomer}
            onSelect={(item: { name: string }) => {
              setCustomerName(item.name);
            }}
            searchFn={async (query: string) => {
              const res = await queryClient.fetchQuery(
                trpc.customer.list.queryOptions({
                  search: query,
                  page: 0,
                  pageSize: 10,
                }),
              );
              return res.data as Array<{ id: string; name: string }>;
            }}
            getOptionLabel={(item: { name: string }) => item.name}
            getOptionValue={(item: { id: string }) => item.id}
            placeholder="Buscar cliente..."
            emptyMessage="Nenhum cliente encontrado"
          />
        </DialogContent>
      </Dialog>

      {/* -- Discount Dialog -- */}
      <DiscountDialog
        open={showDiscountDialog}
        onOpenChange={setShowDiscountDialog}
        onApply={handleApplyDiscount}
        isPending={applyDiscountMutation.isPending}
      />

      {/* -- Price Check Dialog -- */}
      <PriceCheckDialog
        open={showPriceCheckDialog}
        onOpenChange={setShowPriceCheckDialog}
      />

      {/* -- Payment Dialog -- */}
      {showPaymentDialog && draftId && (
        <PaymentDialog
          open={showPaymentDialog}
          onOpenChange={setShowPaymentDialog}
          saleId={draftId}
          totalAmount={totalAmount}
          customerId={customerId ?? null}
          onSuccess={(saleId: string) => {
            router.push(`/pdv/${saleId}`);
          }}
        />
      )}
    </div>
  );
}
