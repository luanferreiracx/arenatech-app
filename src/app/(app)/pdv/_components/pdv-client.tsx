"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  Plus,
  Minus,
  X,
  ShoppingCart,
  Trash2,
  Percent,
  DollarSign,
  RotateCcw,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { EntitySelector } from "@/components/domain/entity-selector";
import { MoneyInput } from "@/components/inputs/money-input";
import { toast } from "@/lib/toast";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PaymentDialog } from "./payment-dialog";

function formatMoney(value: number): string {
  return (value / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

interface CartItem {
  id: string;
  productId: string;
  description: string;
  quantity: number;
  unitPrice: number; // centavos
  costPrice: number; // centavos
  discount: number; // centavos
  total: number; // centavos
}

export function PdvClient() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);
  const [discountType, setDiscountType] = useState<"fixed" | "percent">("fixed");
  const [discountValue, setDiscountValue] = useState(0);
  const [discountReason, setDiscountReason] = useState("");
  const [customerId, setCustomerId] = useState<string | undefined>();
  const [observations, setObservations] = useState("");
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Show results when search changes
  useEffect(() => {
    setShowSearchResults(debouncedSearch.length >= 2);
  }, [debouncedSearch]);

  // Close results on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Fetch products for search
  const { data: productsData } = useQuery(
    trpc.stock.listProducts.queryOptions({
      search: debouncedSearch || undefined,
      active: true,
      page: 0,
      pageSize: 20,
    }),
  );

  // Fetch draft sale
  const { data: draft, refetch: refetchDraft } = useQuery(
    trpc.sales.getDraft.queryOptions(),
  );

  // Mutations
  const createDraft = useMutation(
    trpc.sales.createDraft.mutationOptions({
      onSuccess: () => {
        void refetchDraft();
      },
    }),
  );

  const addItem = useMutation(
    trpc.sales.addItem.mutationOptions({
      onSuccess: () => {
        void refetchDraft();
        setSearch("");
        setShowSearchResults(false);
        searchInputRef.current?.focus();
      },
      onError: (err) => {
        toast.error(err.message);
      },
    }),
  );

  const updateItemQty = useMutation(
    trpc.sales.updateItemQuantity.mutationOptions({
      onSuccess: () => {
        void refetchDraft();
      },
      onError: (err) => {
        toast.error(err.message);
      },
    }),
  );

  const removeItem = useMutation(
    trpc.sales.removeItem.mutationOptions({
      onSuccess: (_, vars) => {
        void refetchDraft();
        const removed = cartItems.find((i) => i.id === vars.itemId);
        if (removed) toast.info(`${removed.description} removido`);
      },
    }),
  );

  const applyDiscountMutation = useMutation(
    trpc.sales.applyDiscount.mutationOptions({
      onSuccess: () => {
        void refetchDraft();
        setShowDiscountDialog(false);
        toast.success("Desconto aplicado");
      },
    }),
  );

  const setCustomerMutation = useMutation(
    trpc.sales.setCustomer.mutationOptions({
      onSuccess: () => {
        void refetchDraft();
      },
    }),
  );

  const cancelDraft = useMutation(
    trpc.sales.cancel.mutationOptions({
      onSuccess: () => {
        void refetchDraft();
        setDiscountType("fixed");
        setDiscountValue(0);
        setDiscountReason("");
        setCustomerId(undefined);
        setObservations("");
        toast.success("Venda reiniciada");
      },
    }),
  );

  const finalizeMutation = useMutation(
    trpc.sales.finalize.mutationOptions({
      onSuccess: () => {
        toast.success("Venda finalizada com sucesso!");
        void queryClient.invalidateQueries();
        void refetchDraft();
        setShowPaymentDialog(false);
        setDiscountType("fixed");
        setDiscountValue(0);
        setDiscountReason("");
        setCustomerId(undefined);
        setObservations("");
      },
      onError: (err) => {
        toast.error(err.message);
      },
    }),
  );

  // Cart items from draft
  const cartItems: CartItem[] = (draft?.items ?? []).map((item) => ({
    id: item.id,
    productId: item.productId,
    description: item.description,
    quantity: item.quantity,
    unitPrice: Math.round(Number(item.unitPrice) * 100),
    costPrice: Math.round(Number(item.costPrice) * 100),
    discount: Math.round(Number(item.discount) * 100),
    total: Math.round(Number(item.total) * 100),
  }));

  const subtotal = draft ? Math.round(Number(draft.subtotal) * 100) : 0;
  const discountAmount = draft ? Math.round(Number(draft.discountAmount) * 100) : 0;
  const totalAmount = draft ? Math.round(Number(draft.totalAmount) * 100) : 0;

  // Add product to cart
  const handleAddProduct = useCallback(
    async (productId: string, salePrice: number) => {
      let saleId = draft?.id;
      if (!saleId) {
        const newDraft = await createDraft.mutateAsync();
        saleId = newDraft.id;
      }

      addItem.mutate({
        saleId,
        productId,
        quantity: 1,
        unitPrice: salePrice,
      });
    },
    [draft?.id, createDraft, addItem],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";

      if (e.key === "F2") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      if (e.key === "F8") {
        if (inInput && target !== searchInputRef.current) return;
        e.preventDefault();
        if (draft && cartItems.length > 0) {
          setShowPaymentDialog(true);
        }
      }
      if (e.key === "Escape") {
        if (showPaymentDialog) {
          setShowPaymentDialog(false);
        } else if (showDiscountDialog) {
          setShowDiscountDialog(false);
        } else if (showSearchResults) {
          setShowSearchResults(false);
          setSearch("");
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [draft, cartItems.length, showPaymentDialog, showDiscountDialog, showSearchResults]);

  // Apply discount handler
  const handleApplyDiscount = useCallback(() => {
    if (!draft) return;
    applyDiscountMutation.mutate({
      saleId: draft.id,
      discountType,
      discountValue: discountType === "fixed" ? discountValue / 100 : discountValue,
      discountReason: discountReason || undefined,
    });
  }, [draft, discountType, discountValue, discountReason, applyDiscountMutation]);

  // Set customer
  const handleSetCustomer = useCallback(
    (value: string | undefined) => {
      setCustomerId(value);
      if (draft) {
        setCustomerMutation.mutate({
          saleId: draft.id,
          customerId: value,
        });
      }
    },
    [draft, setCustomerMutation],
  );

  // Customer search function
  const searchCustomers = useCallback(
    async (q: string) => {
      const result = await queryClient.fetchQuery(
        trpc.customers.list.queryOptions({
          search: q,
          page: 0,
          pageSize: 10,
        }),
      );
      return result.items;
    },
    [queryClient, trpc.customers.list],
  );

  const products = productsData?.items ?? [];

  // Get quantity already in cart for a product
  const getQtyInCart = (productId: string) =>
    cartItems
      .filter((i) => i.productId === productId)
      .reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="grid h-[calc(100vh-3.5rem)] grid-cols-[1fr_350px] gap-4 p-4">
      {/* Left column — Main area */}
      <div className="flex min-h-0 flex-col">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-xl font-bold">PDV - Ponto de Venda</h1>
          <Badge variant="default" className="bg-primary px-3 py-1 text-sm font-bold">
            {draft ? `Venda #${draft.number}` : "Nova Venda"}
          </Badge>
        </div>

        {/* Search bar (autocomplete) */}
        <div ref={searchContainerRef} className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="Buscar produto por nome, SKU ou codigo de barras..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => {
              if (debouncedSearch.length >= 2) setShowSearchResults(true);
            }}
            className="h-12 pl-10 text-lg"
            autoFocus
          />

          {/* Autocomplete dropdown */}
          {showSearchResults && (
            <div className="absolute left-0 right-0 top-full z-50 max-h-[300px] overflow-y-auto rounded-b-lg border border-t-0 bg-card shadow-lg">
              {products.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Nenhum produto encontrado
                </div>
              ) : (
                products.map((product) => {
                  const price = Number(product.salePrice);
                  const inCart = getQtyInCart(product.id);
                  const available = product.currentStock - inCart;
                  const isOutOfStock = available <= 0;

                  return (
                    <button
                      key={product.id}
                      disabled={isOutOfStock || addItem.isPending}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!isOutOfStock) {
                          void handleAddProduct(product.id, price);
                        }
                      }}
                      className="flex w-full items-center justify-between border-b px-4 py-3 text-left transition-colors last:border-0 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-medium">{product.name}</span>
                        {product.sku && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {product.sku}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-bold text-primary">
                          {formatMoney(Math.round(price * 100))}
                        </span>
                        <Badge
                          variant={isOutOfStock ? "destructive" : "secondary"}
                          className="min-w-[3rem] justify-center text-xs"
                        >
                          {available} un
                        </Badge>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Cart items table */}
        <div className="flex-1 overflow-y-auto rounded-lg border bg-card">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-muted">
              <tr className="border-b-2 border-primary text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5">Produto</th>
                <th className="w-[100px] px-4 py-2.5">Qtd</th>
                <th className="w-[130px] px-4 py-2.5">Preco Unit.</th>
                <th className="w-[130px] px-4 py-2.5">Subtotal</th>
                <th className="w-[50px] px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {cartItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    Nenhum item adicionado. Busque um produto acima.
                  </td>
                </tr>
              ) : (
                cartItems.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b transition-colors hover:bg-primary/5"
                  >
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{item.description}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            if (item.quantity <= 1) {
                              removeItem.mutate({ itemId: item.id });
                            } else {
                              updateItemQty.mutate({
                                itemId: item.id,
                                quantity: item.quantity - 1,
                              });
                            }
                          }}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center text-sm font-medium">
                          {item.quantity}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() =>
                            updateItemQty.mutate({
                              itemId: item.id,
                              quantity: item.quantity + 1,
                            })
                          }
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-sm">
                      {formatMoney(item.unitPrice)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-sm font-bold">
                      {formatMoney(item.total)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => removeItem.mutate({ itemId: item.id })}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right column — Sidebar */}
      <div className="flex flex-col gap-3">
        {/* Customer */}
        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Cliente
          </h3>
          {cartItems.length > 0 ? (
            <EntitySelector
              value={customerId}
              onChange={handleSetCustomer}
              searchFn={searchCustomers}
              getOptionLabel={(c: { name: string; cpf: string | null }) =>
                c.cpf ? `${c.name} (${c.cpf})` : c.name
              }
              getOptionValue={(c: { id: string }) => c.id}
              placeholder="Venda sem cliente"
              emptyMessage="Nenhum cliente encontrado"
            />
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span>Adicione itens para selecionar cliente</span>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="rounded-lg border bg-card p-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-mono">{formatMoney(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-destructive">
                <span>Desconto</span>
                <span className="font-mono">-{formatMoney(discountAmount)}</span>
              </div>
            )}
          </div>
          <Separator className="my-3" />
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold">TOTAL</span>
            <span className="font-mono text-2xl font-bold text-primary">
              {formatMoney(totalAmount)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-auto flex flex-col gap-2">
          {/* Discount button */}
          <Button
            variant="secondary"
            className="w-full justify-center gap-2"
            disabled={cartItems.length === 0}
            onClick={() => setShowDiscountDialog(true)}
          >
            <Percent className="h-4 w-4" />
            Desconto
          </Button>

          {/* Finalize button */}
          <Button
            size="lg"
            className="h-12 w-full text-lg"
            disabled={cartItems.length === 0}
            onClick={() => setShowPaymentDialog(true)}
          >
            <DollarSign className="mr-1 h-5 w-5" />
            Finalizar Venda
          </Button>

          {/* Keyboard hints */}
          <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
            <span>
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                F2
              </kbd>{" "}
              buscar
            </span>
            <span>
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                F8
              </kbd>{" "}
              finalizar
            </span>
            <span>
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                Esc
              </kbd>{" "}
              fechar
            </span>
          </div>

          {/* Restart / Cancel */}
          {draft && (
            <Button
              variant="outline"
              className="w-full gap-2 border-destructive text-destructive hover:bg-destructive/10"
              onClick={() => {
                if (confirm("Tem certeza? Todos os itens do carrinho serao removidos.")) {
                  cancelDraft.mutate({ saleId: draft.id });
                }
              }}
            >
              <RotateCcw className="h-4 w-4" />
              Reiniciar Venda
            </Button>
          )}
        </div>
      </div>

      {/* Discount Dialog */}
      <Dialog open={showDiscountDialog} onOpenChange={setShowDiscountDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Aplicar Desconto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block text-sm">Tipo de Desconto</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={discountType === "fixed" ? "default" : "outline"}
                  onClick={() => setDiscountType("fixed")}
                  className="w-full"
                >
                  R$ Valor
                </Button>
                <Button
                  variant={discountType === "percent" ? "default" : "outline"}
                  onClick={() => setDiscountType("percent")}
                  className="w-full"
                >
                  % Percentual
                </Button>
              </div>
            </div>
            <div>
              <Label className="mb-2 block text-sm">Valor do Desconto</Label>
              {discountType === "fixed" ? (
                <MoneyInput
                  value={discountValue}
                  onChange={setDiscountValue}
                  className="text-lg"
                />
              ) : (
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={discountValue || ""}
                  onChange={(e) => setDiscountValue(Number(e.target.value))}
                  className="text-lg"
                  placeholder="0"
                />
              )}
            </div>
            <div>
              <Label className="mb-2 block text-sm">Motivo (opcional)</Label>
              <Input
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                placeholder="Ex: Cliente fidelidade"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDiscountDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleApplyDiscount} disabled={discountValue <= 0}>
              Aplicar Desconto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      {draft && (
        <PaymentDialog
          open={showPaymentDialog}
          onOpenChange={setShowPaymentDialog}
          totalAmount={totalAmount}
          saleId={draft.id}
          customerId={customerId}
          discountType={discountType}
          discountValue={discountType === "fixed" ? discountValue / 100 : discountValue}
          discountReason={discountReason}
          observations={observations}
          onObservationsChange={setObservations}
          onFinalize={(payments) => {
            finalizeMutation.mutate({
              saleId: draft.id,
              customerId,
              payments,
              discountType: discountValue > 0 ? discountType : undefined,
              discountValue:
                discountValue > 0
                  ? discountType === "fixed"
                    ? discountValue / 100
                    : discountValue
                  : undefined,
              discountReason: discountReason || undefined,
              observations: observations || undefined,
            });
          }}
          isPending={finalizeMutation.isPending}
        />
      )}
    </div>
  );
}
