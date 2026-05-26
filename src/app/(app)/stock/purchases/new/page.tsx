"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
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
      paymentMode: undefined,
      paymentMethodId: null,
      payableInstallments: 1,
      payableFirstDueDate: new Date().toISOString().slice(0, 10),
    },
  });

  const paymentMode = form.watch("paymentMode");
  const sellerType = form.watch("sellerType");

  // PaymentMethods do tenant para o select quando paymentMode === "now"
  const { data: paymentMethods } = useQuery(
    trpc.settings.listPaymentMethods.queryOptions(undefined, {
      enabled: paymentMode === "now",
    }),
  );

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
          <FormSection title="Vendedor">
            <FormField
              control={form.control}
              name="sellerType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Vendedor *</FormLabel>
                  <Select
                    onValueChange={(v) => {
                      field.onChange(v);
                      // troca de tipo reseta os ids
                      form.setValue("customerId", null);
                      form.setValue("supplierId", null);
                    }}
                    value={field.value ?? ""}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="customer">Cliente (PF ou PJ)</SelectItem>
                      <SelectItem value="supplier">Fornecedor (PF ou PJ)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    De quem voce esta comprando este aparelho.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {sellerType === "customer" && (
              <div className="mt-4">
                <FormField
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cliente *</FormLabel>
                      <FormControl>
                        <EntitySelector<{
                          id: string;
                          name: string;
                          cpf: string | null;
                          cnpj: string | null;
                        }>
                          value={field.value ?? undefined}
                          onChange={(v) => field.onChange(v ?? null)}
                          searchFn={async (q) => {
                            const res = await queryClient.fetchQuery(
                              trpc.customer.list.queryOptions({
                                search: q,
                                pageSize: 20,
                              }),
                            );
                            return res.data as Array<{
                              id: string;
                              name: string;
                              cpf: string | null;
                              cnpj: string | null;
                            }>;
                          }}
                          getOptionLabel={(c) => {
                            // Cliente pode ser PF (cpf) ou PJ (cnpj) — mostra
                            // o documento que estiver preenchido. Paridade
                            // Laravel: tipo (PF/PJ) determina qual campo usar.
                            if (c.cnpj) return `${c.name} — CNPJ ${c.cnpj}`;
                            if (c.cpf) return `${c.name} — CPF ${c.cpf}`;
                            return c.name;
                          }}
                          getOptionValue={(c) => c.id}
                          placeholder="Buscar cliente por nome, CPF ou CNPJ..."
                          emptyMessage="Nenhum cliente encontrado."
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Cliente nao cadastrado?{" "}
                        <Link
                          href="/customers/new"
                          target="_blank"
                          className="text-primary hover:underline"
                        >
                          Cadastrar novo cliente
                        </Link>
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {sellerType === "supplier" && (
              <div className="mt-4">
                <FormField
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fornecedor *</FormLabel>
                      <FormControl>
                        <EntitySelector<{
                          id: string;
                          name: string;
                          cpf: string | null;
                          cnpj: string | null;
                        }>
                          value={field.value ?? undefined}
                          onChange={(v) => field.onChange(v ?? null)}
                          searchFn={async (q) => {
                            const term = q && q.trim().length > 0 ? q : "a";
                            const res = await queryClient.fetchQuery(
                              trpc.stock.searchSuppliers.queryOptions({
                                search: term,
                              }),
                            );
                            return res as Array<{
                              id: string;
                              name: string;
                              cpf: string | null;
                              cnpj: string | null;
                            }>;
                          }}
                          getOptionLabel={(s) => {
                            // Fornecedor pode ser PF (cpf) ou PJ (cnpj) —
                            // schema tem SupplierType{PF,PJ}.
                            if (s.cnpj) return `${s.name} — CNPJ ${s.cnpj}`;
                            if (s.cpf) return `${s.name} — CPF ${s.cpf}`;
                            return s.name;
                          }}
                          getOptionValue={(s) => s.id}
                          placeholder="Buscar fornecedor por nome, CPF ou CNPJ..."
                          emptyMessage="Nenhum fornecedor encontrado."
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Fornecedor nao cadastrado?{" "}
                        <Link
                          href="/suppliers/new"
                          target="_blank"
                          className="text-primary hover:underline"
                        >
                          Cadastrar novo fornecedor
                        </Link>
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
          </FormSection>

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
                        getOptionLabel={(p) => {
                          // products.name ja contem a marca em muitos casos
                          // ("Apple iPhone 17 Pro"). Concatenar brand + name
                          // produzia "Apple — Apple iPhone 17 Pro" (ou pior,
                          // 3-4x "Apple" quando o name foi corrompido por
                          // import). Mostra so o name — limpo e suficiente.
                          return p.name;
                        }}
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

          <FormSection title="Pagamento">
            <FormField
              control={form.control}
              name="paymentMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Como vai pagar?</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(v || undefined)}
                    value={field.value ?? ""}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="now">Pagar agora (a vista)</SelectItem>
                      <SelectItem value="payable">A prazo (conta a pagar)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    A vista: registra como pago no financeiro. Em dinheiro/PIX,
                    gera saida no caixa aberto. A prazo: cria conta a pagar
                    parcelada para quitar depois.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {paymentMode === "now" && (
              <div className="mt-4">
                <FormField
                  control={form.control}
                  name="paymentMethodId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Forma de pagamento *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ?? ""}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(paymentMethods ?? [])
                            .filter((m) => m.active)
                            .map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {paymentMode === "payable" && (
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
