"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Plus, Minus, X, ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [discountType, setDiscountType] = useState<"fixed" | "percent">("fixed");
  const [discountValue, setDiscountValue] = useState(0);
  const [customerId, setCustomerId] = useState<string | undefined>();

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch products
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
      onSuccess: () => {
        void refetchDraft();
      },
    }),
  );

  const applyDiscountMutation = useMutation(
    trpc.sales.applyDiscount.mutationOptions({
      onSuccess: () => {
        void refetchDraft();
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
        toast.success("Venda cancelada");
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
        setCustomerId(undefined);
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
      if (e.key === "F2" || (e.key === "Enter" && e.target === document.body)) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "F8") {
        e.preventDefault();
        if (draft && cartItems.length > 0) {
          setShowPaymentDialog(true);
        }
      }
      if (e.key === "F9") {
        e.preventDefault();
        if (draft) {
          cancelDraft.mutate({ saleId: draft.id });
        }
      }
      if (e.key === "Escape") {
        setShowPaymentDialog(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [draft, cartItems.length, cancelDraft]);

  // Apply discount when value changes
  const handleApplyDiscount = useCallback(() => {
    if (!draft) return;
    applyDiscountMutation.mutate({
      saleId: draft.id,
      discountType,
      discountValue: discountType === "fixed" ? discountValue / 100 : discountValue,
    });
  }, [draft, discountType, discountValue, applyDiscountMutation]);

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

  return (
    <div className="flex h-[calc(100vh-3.5rem)] gap-4 p-4">
      {/* Left column — Products */}
      <div className="flex w-3/5 flex-col gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="Buscar produto por nome, SKU ou código de barras... (F2)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-12 pl-10 text-lg"
            autoFocus
          />
        </div>

        {/* Product grid */}
        <div className="grid flex-1 grid-cols-2 gap-2 overflow-y-auto lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => {
            const price = Number(product.salePrice);
            const isOutOfStock = product.currentStock <= 0;

            return (
              <button
                key={product.id}
                disabled={isOutOfStock || addItem.isPending}
                onClick={() => handleAddProduct(product.id, price)}
                className={`flex flex-col rounded-lg border p-3 text-left transition-colors ${
                  isOutOfStock
                    ? "cursor-not-allowed border-border bg-muted opacity-50"
                    : "cursor-pointer border-border hover:border-primary hover:bg-primary/5"
                }`}
              >
                <span className="truncate text-sm font-medium">{product.name}</span>
                {product.sku && (
                  <span className="text-xs text-muted-foreground">SKU: {product.sku}</span>
                )}
                <div className="mt-auto flex items-center justify-between pt-2">
                  <span className="font-mono text-sm font-bold text-primary">
                    {formatMoney(Math.round(price * 100))}
                  </span>
                  <Badge variant={isOutOfStock ? "destructive" : "secondary"} className="text-xs">
                    {product.currentStock} un
                  </Badge>
                </div>
              </button>
            );
          })}
          {products.length === 0 && debouncedSearch && (
            <div className="col-span-full flex items-center justify-center py-12 text-muted-foreground">
              Nenhum produto encontrado
            </div>
          )}
        </div>
      </div>

      {/* Right column — Cart */}
      <div className="flex w-2/5 flex-col rounded-lg border bg-card">
        {/* Cart Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">
              {draft ? `Venda #${draft.number}` : "Nova Venda"}
            </h2>
          </div>
          {draft && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => cancelDraft.mutate({ saleId: draft.id })}
              className="text-destructive hover:text-destructive"
              title="Nova venda (F9)"
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Limpar
            </Button>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {cartItems.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
              <ShoppingCart className="mb-2 h-10 w-10 opacity-30" />
              <p className="text-sm">Carrinho vazio</p>
              <p className="text-xs">Busque e clique em um produto para adicionar</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cartItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2 rounded-md border p-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.description}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {formatMoney(item.unitPrice)} x {item.quantity}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        if (item.quantity <= 1) {
                          removeItem.mutate({ itemId: item.id });
                        } else {
                          updateItemQty.mutate({ itemId: item.id, quantity: item.quantity - 1 });
                        }
                      }}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() =>
                        updateItemQty.mutate({ itemId: item.id, quantity: item.quantity + 1 })
                      }
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <span className="w-20 text-right font-mono text-sm font-bold">
                    {formatMoney(item.total)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => removeItem.mutate({ itemId: item.id })}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cart Footer */}
        <div className="border-t px-4 py-3 space-y-3">
          {/* Discount */}
          {cartItems.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Desconto</Label>
              <div className="flex gap-2">
                <Select
                  value={discountType}
                  onValueChange={(v) => setDiscountType(v as "fixed" | "percent")}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">R$</SelectItem>
                    <SelectItem value="percent">%</SelectItem>
                  </SelectContent>
                </Select>
                {discountType === "fixed" ? (
                  <MoneyInput
                    value={discountValue}
                    onChange={setDiscountValue}
                    className="flex-1"
                    onBlur={handleApplyDiscount}
                  />
                ) : (
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                    onBlur={handleApplyDiscount}
                    className="flex-1"
                    placeholder="0"
                  />
                )}
              </div>
            </div>
          )}

          {/* Customer */}
          {cartItems.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Cliente (opcional)</Label>
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
            </div>
          )}

          <Separator />

          {/* Totals */}
          <div className="space-y-1 text-sm">
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

          <div className="flex items-center justify-between">
            <span className="text-lg font-bold">Total</span>
            <span className="text-2xl font-bold font-mono text-primary">
              {formatMoney(totalAmount)}
            </span>
          </div>

          {/* Finalize Button */}
          <Button
            size="lg"
            className="w-full text-lg h-12"
            disabled={cartItems.length === 0}
            onClick={() => setShowPaymentDialog(true)}
          >
            Finalizar Venda (F8)
          </Button>
        </div>
      </div>

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
          onFinalize={(payments) => {
            finalizeMutation.mutate({
              saleId: draft.id,
              customerId,
              payments,
              discountType: discountValue > 0 ? discountType : undefined,
              discountValue: discountValue > 0
                ? (discountType === "fixed" ? discountValue / 100 : discountValue)
                : undefined,
            });
          }}
          isPending={finalizeMutation.isPending}
        />
      )}
    </div>
  );
}
