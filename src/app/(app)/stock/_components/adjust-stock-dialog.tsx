"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

interface AdjustStockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  currentStock: number;
}

export function AdjustStockDialog({
  open,
  onOpenChange,
  productId,
  productName,
  currentStock,
}: AdjustStockDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const form = useForm<AdjustStockInput>({
    resolver: zodResolver(adjustStockSchema),
    defaultValues: {
      productId,
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
    mutation.mutate(data);
  }

  const watchedQty = form.watch("quantity");
  const newStock = currentStock + (watchedQty || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Ajustar Estoque</DialogTitle>
          <DialogDescription>
            {productName} — Estoque atual: {currentStock}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                  {watchedQty !== 0 && (
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
