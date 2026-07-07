"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { adjustStockSchema, type AdjustStockInput } from "@/lib/validators/stock";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { VariationPicker } from "@/components/inputs/variation-picker";

interface AdjustStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  currentStock: number;
  /** Produto com variacoes: o ajuste incide sobre a variacao escolhida, nao o pai. */
  hasVariations?: boolean;
}

export function AdjustStockDialog({
  open,
  onOpenChange,
  productId,
  productName,
  currentStock,
  hasVariations = false,
}: AdjustStockDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const form = useForm<AdjustStockInput>({
    resolver: zodResolver(adjustStockSchema),
    defaultValues: {
      productId,
      variationId: null,
      quantity: 0,
      reason: "",
    },
  });

  const mutation = useMutation(
    trpc.stock.adjustStock.mutationOptions({
      onSuccess: () => {
        toast.success("Estoque ajustado com sucesso!");
        queryClient.invalidateQueries({ queryKey: [["stock"]] });
        onOpenChange(false);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  function onSubmit(data: AdjustStockInput) {
    if (hasVariations && !data.variationId) {
      form.setError("variationId", { message: "Selecione uma variacao" });
      return;
    }
    mutation.mutate(data);
  }

  const watchedQty = form.watch("quantity");
  const watchedVariationId = form.watch("variationId");

  // Para produtos com variacoes, o saldo relevante eh o da variacao escolhida
  // (o currentStock do pai eh a soma de todas). Busca as variacoes so nesse caso.
  const variationsQuery = useQuery({
    ...trpc.stock.listVariations.queryOptions({ productId }),
    enabled: open && hasVariations,
  });
  const selectedVariation = variationsQuery.data?.find(
    (v) => v.id === watchedVariationId,
  );

  // Saldo base do preview: variacao escolhida (se houver) ou o produto simples.
  const baseStock = hasVariations
    ? selectedVariation?.currentStock ?? null
    : currentStock;
  const newStock = baseStock === null ? null : baseStock + (watchedQty || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Ajustar Estoque</DialogTitle>
          <DialogDescription>
            {hasVariations
              ? `${productName} — selecione a variacao para ajustar`
              : `${productName} — Estoque atual: ${currentStock}`}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {hasVariations && (
              <FormField
                control={form.control}
                name="variationId"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <VariationPicker
                        productId={productId}
                        value={field.value ?? null}
                        onChange={(v) => field.onChange(v)}
                        showStock
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantidade (positivo = entrada, negativo = saida) *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      placeholder="Ex: 5 ou -3"
                    />
                  </FormControl>
                  <FormMessage />
                  {watchedQty !== 0 && newStock !== null && (
                    <p className="text-xs text-muted-foreground">
                      Novo estoque: <span className={newStock < 0 ? "text-destructive" : "text-emerald-500 font-medium"}>{newStock}</span>
                    </p>
                  )}
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo *</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Ex: Contagem de inventario, Perda, etc."
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Salvando..." : "Confirmar Ajuste"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
