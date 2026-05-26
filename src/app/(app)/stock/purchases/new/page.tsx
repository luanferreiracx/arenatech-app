"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import {
  createDevicePurchaseSchema,
  type CreateDevicePurchaseInput,
  deviceConditionLabels,
} from "@/lib/validators/stock";
import { PageHeader } from "@/components/domain/page-header";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { EntitySelector } from "@/components/domain/entity-selector";
import { VariationPicker } from "@/components/inputs/variation-picker";
import { MoneyInput } from "@/components/inputs/money-input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ImeiInput } from "@/components/inputs/imei-input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function NewPurchasePage() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const form = useForm<CreateDevicePurchaseInput>({
    resolver: zodResolver(createDevicePurchaseSchema),
    defaultValues: {
      // productId obrigatorio (sem default — operador escolhe via combobox)
      productId: undefined as unknown as string,
      variationId: null,
      customerId: null,
      supplierId: null,
      sellerType: "customer",
      imei: "",
      serial: "",
      condition: "USED",
      batteryHealth: null,
      purchasePrice: 0,
      salePrice: null,
      notes: "",
      generatePayable: false,
      payableInstallments: 1,
      payableFirstDueDate: new Date().toISOString().slice(0, 10),
    },
  });

  const generatePayable = form.watch("generatePayable");

  const mutation = useMutation(
    trpc.stock.createPurchase.mutationOptions({
      onSuccess: () => {
        toast.success("Compra registrada com sucesso!");
        queryClient.invalidateQueries({ queryKey: [["stock"]] });
        router.push("/stock/purchases");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  function onSubmit(data: CreateDevicePurchaseInput) {
    mutation.mutate(data);
  }

  return (
    <div>
      <PageHeader
        title="Nova Compra de Aparelho"
        subtitle="Registre a compra de aparelho novo, seminovo, usado ou de vitrine"
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <FormSection title="Dados do Aparelho">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="productId"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Modelo do Aparelho *</FormLabel>
                    <FormControl>
                      <EntitySelector<{
                        id: string;
                        name: string;
                        brand: string | null;
                        sku: string | null;
                      }>
                        value={field.value}
                        onChange={(v) => {
                          field.onChange(v);
                          // troca de produto reseta variation
                          form.setValue("variationId", null);
                        }}
                        searchFn={async (q) => {
                          const all = await queryClient.fetchQuery(
                            trpc.sale.searchProducts.queryOptions({
                              query: q || "iphone",
                              withStock: false,
                            }),
                          );
                          // Filtra so aparelhos serializados — paridade
                          // backend que rejeita outros tipos.
                          return all.filter(
                            (p) => p.isDevice && p.isSerialized,
                          ) as Array<{
                            id: string;
                            name: string;
                            brand: string | null;
                            sku: string | null;
                          }>;
                        }}
                        getOptionLabel={(p) =>
                          [p.brand, p.name].filter(Boolean).join(" — ") || p.name
                        }
                        getOptionValue={(p) => p.id}
                        placeholder="Buscar aparelho cadastrado..."
                        emptyMessage="Nenhum produto encontrado. Cadastre primeiro em Estoque → Produtos."
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Aparelho precisa estar cadastrado como produto serializado.{" "}
                      <Link
                        href="/stock/new"
                        target="_blank"
                        className="text-primary hover:underline"
                      >
                        Cadastrar novo produto
                      </Link>
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="variationId"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormControl>
                      <VariationPicker
                        productId={form.watch("productId") || null}
                        value={field.value ?? null}
                        onChange={(v) => field.onChange(v)}
                        label="Armazenamento + Cor"
                        showStock={false}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="imei"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>IMEI</FormLabel>
                    <FormControl>
                      <ImeiInput
                        name="imei"
                        value={field.value ?? ""}
                        onValueChange={(v) => field.onChange(v)}
                        checkDuplicate
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="serial"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Numero de Serie</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} placeholder="Ex: C39XXXXXYZ" maxLength={50} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="condition"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Condicao *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(deviceConditionLabels).map(([key, label]) => (
                          <SelectItem key={key} value={key}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="batteryHealth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Saude da Bateria (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                        placeholder="Ex: 85"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </FormSection>

          <FormSection title="Valores">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="purchasePrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preco de Compra *</FormLabel>
                    <FormControl>
                      <MoneyInput value={field.value} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="salePrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preco de Venda Sugerido</FormLabel>
                    <FormControl>
                      <MoneyInput
                        value={field.value ?? 0}
                        onChange={(v) => field.onChange(v || null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </FormSection>

          <FormSection title="Conta a Pagar">
            <FormField
              control={form.control}
              name="generatePayable"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Gerar conta a pagar automaticamente</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Cria uma transação PAYABLE no financeiro com o valor da compra. Útil para compras a prazo de fornecedores.
                    </p>
                  </div>
                </FormItem>
              )}
            />

            {generatePayable && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <FormField
                  control={form.control}
                  name="payableInstallments"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Número de parcelas</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={36}
                          {...field}
                          value={field.value ?? 1}
                          onChange={(e) => field.onChange(Number(e.target.value) || 1)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="payableFirstDueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vencimento da 1ª parcela</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
          </FormSection>

          <FormSection title="Observacoes">
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observacoes</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Detalhes sobre o estado do aparelho, acessorios inclusos, etc."
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>

          <FormActions
            isLoading={mutation.isPending}
            onCancel={() => router.push("/stock/purchases")}
            submitLabel="Registrar Compra"
          />
        </form>
      </Form>
    </div>
  );
}
