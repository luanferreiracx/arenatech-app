"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PageHeader } from "@/components/domain/page-header";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntitySelector } from "@/components/domain/entity-selector";
import { VariationPicker } from "@/components/inputs/variation-picker";
import { toast } from "@/lib/toast";
import {
  stockExitSchema,
  type StockExitInput,
  STOCK_WRITEOFF_REASONS,
} from "@/lib/validators/stock";
import { blockEnterSubmit } from "@/lib/utils/form-keyboard";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";

type ProductSearchResult = {
  id: string;
  name: string;
  sku: string | null;
  hasVariations: boolean;
  /** Saldo efetivo (o servidor resolve via `resolveCurrentStockByProduct`). */
  currentStock: number;
};

export default function StockExitPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [reasonCode, setReasonCode] = useState<string>("danificado");
  const [reasonDetail, setReasonDetail] = useState<string>("");
  const [selectedProductHasVariations, setSelectedProductHasVariations] = useState(false);
  const [selectedProductName, setSelectedProductName] = useState<string | null>(null);
  const [selectedProductStock, setSelectedProductStock] = useState<number | null>(null);
  /**
   * Baixa pendente de confirmação. A baixa é irreversível e mexe em patrimônio:
   * ia do submit direto para o `mutate`, sem dizer o que sairia nem o que
   * sobraria. O `adjust-stock-dialog` já mostrava esse preview — a ação mais
   * dura não mostrava. Auditoria de frontend 2026-08-04, P1-5.
   */
  const [pendingExit, setPendingExit] = useState<
    | { data: StockExitInput; reason: string }
    | null
  >(null);

  const form = useForm<StockExitInput>({
    resolver: zodResolver(stockExitSchema),
    defaultValues: { productId: "", variationId: null, quantity: 1, reason: "" },
  });

  const exitMutation = useMutation(
    trpc.stock.stockExit.mutationOptions({
      onSuccess: () => {
        toast.success("Baixa de estoque registrada");
        queryClient.invalidateQueries({ queryKey: trpc.stock.list.queryKey() });
        router.push("/stock");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const submit = form.handleSubmit(
    (data) => {
      const label = STOCK_WRITEOFF_REASONS.find((r) => r.code === reasonCode)?.label ?? reasonCode;
      const reason = reasonDetail.trim()
        ? `${label}: ${reasonDetail.trim()}`
        : label;
      // Confirma ANTES de escrever: mostra produto, quantidade e saldo restante.
      setPendingExit({ data, reason });
    },
    // onInvalid: sem isto, o submit era bloqueado em silencio (botao "nao fazia
    // nada") quando algum campo estava invalido — ex: quantidade vazia (NaN) ou
    // produto nao selecionado. Agora avisa o operador.
    (errors) => {
      if (errors.productId) {
        toast.error("Selecione um produto.");
        return;
      }
      const first = errors.quantity ?? errors.variationId;
      toast.error(first?.message ?? "Revise os campos destacados antes de registrar a baixa.");
    },
  );

  return (
    <div>
      <PageHeader title="Baixa de Estoque" subtitle="Registre a saida de produtos do estoque" />

      <form onSubmit={submit} onKeyDown={blockEnterSubmit} className="space-y-6">
        <FormSection title="Produto">
          <div className="space-y-2">
            <Label>Produto *</Label>
            <EntitySelector<ProductSearchResult>
              value={form.watch("productId")}
              onChange={(v) => {
                form.setValue("productId", v ?? "", { shouldValidate: true });
                form.setValue("variationId", null);
                setSelectedProductHasVariations(false);
              }}
              onSelect={(p) => {
                setSelectedProductHasVariations(p.hasVariations);
                // Guardados só para o preview da confirmação — o operador
                // precisa ver O QUE vai sair e QUANTO sobra antes de confirmar.
                setSelectedProductName(p.name);
                setSelectedProductStock(p.currentStock ?? null);
              }}
              searchFn={async (search) => {
                // excludeSerialized: a baixa por quantidade nao se aplica a
                // serializados (o servidor os recusa). Esconde-los da busca
                // evita selecionar um produto que daria erro ao registrar.
                return queryClient.fetchQuery(
                  trpc.stock.searchProducts.queryOptions({ search, excludeSerialized: true }),
                ) as Promise<ProductSearchResult[]>;
              }}
              getOptionLabel={(p) => `${p.name}`}
              getOptionValue={(p) => p.id}
              placeholder="Buscar produto..."
            />
            {form.formState.errors.productId && (
              // productId so falha quando nada foi selecionado (campo e um uuid
              // vindo do seletor) — mensagem direta em vez do "Invalid UUID" do Zod.
              <p className="text-sm text-destructive">Selecione um produto.</p>
            )}
            <p className="text-xs text-muted-foreground">
              Aparelhos e itens com numero de serie nao aparecem aqui — sua baixa
              e feita pela venda ou pelo descarte do item no estoque.
            </p>
            {selectedProductHasVariations && (
              <>
                <VariationPicker
                  productId={form.watch("productId") || null}
                  value={form.watch("variationId") ?? null}
                  onChange={(v) => form.setValue("variationId", v, { shouldValidate: true })}
                  showStock
                />
                {form.formState.errors.variationId && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.variationId.message}
                  </p>
                )}
              </>
            )}
          </div>
        </FormSection>

        <FormSection title="Detalhes da Baixa">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantidade">Quantidade *</Label>
              <Input id="quantidade" type="number" min={1} {...form.register("quantity", { valueAsNumber: true })} />
              {form.formState.errors.quantity && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.quantity.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="motivo-da-baixa">Motivo da baixa *</Label>
              <Select value={reasonCode} onValueChange={setReasonCode}>
                <SelectTrigger id="motivo-da-baixa">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STOCK_WRITEOFF_REASONS.map((r) => (
                    <SelectItem key={r.code} value={r.code}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="detalhes-opcional">Detalhes (opcional)</Label>
            <Textarea id="detalhes-opcional"
              value={reasonDetail}
              onChange={(e) => setReasonDetail(e.target.value)}
              placeholder="Numero da NF de devolucao, descricao do dano, etc."
              rows={2}
            />
          </div>
        </FormSection>

        <FormActions
          isLoading={exitMutation.isPending}
          submitLabel="Registrar Baixa"
          onCancel={() => router.push("/stock")}
        />
      </form>

      {/* Confirmação com PREVIEW. "Tem certeza?" genérico não é proteção: o
          operador precisa ler o que sai e o que sobra antes de dar baixa em
          patrimônio, porque não há como desfazer. */}
      <ConfirmDialog
        open={pendingExit !== null}
        onOpenChange={(o) => !o && setPendingExit(null)}
        title="Dar baixa neste estoque?"
        description={
          pendingExit
            ? [
                `Sai ${pendingExit.data.quantity} un. de ${selectedProductName ?? "produto selecionado"}.`,
                selectedProductStock != null && !selectedProductHasVariations
                  ? `Saldo apos a baixa: ${Math.max(0, selectedProductStock - pendingExit.data.quantity)} un.`
                  : null,
                `Motivo: ${pendingExit.reason}.`,
                "A baixa nao pode ser desfeita — so um novo lancamento de entrada corrige.",
              ]
                .filter(Boolean)
                .join(" ")
            : ""
        }
        confirmLabel="Dar baixa"
        variant="destructive"
        isLoading={exitMutation.isPending}
        onConfirm={() => {
          if (!pendingExit) return;
          exitMutation.mutate({ ...pendingExit.data, reason: pendingExit.reason });
          setPendingExit(null);
        }}
      />
    </div>
  );
}
