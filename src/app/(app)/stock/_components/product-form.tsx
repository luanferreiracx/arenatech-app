"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import {
  createProductSchema,
  type CreateProductInput,
} from "@/lib/validators/stock";
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
import { Switch } from "@/components/ui/switch";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { MoneyInput } from "@/components/inputs/money-input";
import { NcmInput } from "@/components/inputs/ncm-input";
import { VariationsEditor } from "./variations-editor";
import { ProductPhotoManager } from "./product-photo-manager";
import { VariationImagesPanel } from "./variation-images-panel";

interface ProductFormProps {
  defaultValues?: CreateProductInput & { id?: string };
  isEdit?: boolean;
}

/** Valor-sentinela do <select> para entrar no modo "criar nova categoria". */
const NEW_CATEGORY_OPTION = "__new__";

export function ProductForm({ defaultValues, isEdit = false }: ProductFormProps) {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const form = useForm<CreateProductInput>({
    resolver: zodResolver(createProductSchema),
    defaultValues: defaultValues ?? {
      sku: "",
      barcode: "",
      name: "",
      description: "",
      brand: "",
      ncm: null,
      cest: null,
      isDevice: false,
      isSerialized: false,
      isPremium: false,
      hasVariations: false,
      icmsDifferentialRate: null,
      costPrice: 0,
      salePrice: 0,
      promotionalPrice: null,
      defaultMargin: null,
      minStock: 0,
      unit: "un",
      active: true,
      categoryId: null,
      categoryIds: [],
      newCategoryName: null,
    },
  });

  const hasVariations = form.watch("hasVariations");

  const { data: categories } = useQuery(
    trpc.stock.listCategories.queryOptions({ pageSize: 100 })
  );

  const createMutation = useMutation(
    trpc.stock.create.mutationOptions({
      onSuccess: () => {
        toast.success("Produto cadastrado com sucesso!");
        queryClient.invalidateQueries({ queryKey: [["stock"]] });
        router.push("/stock");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const updateMutation = useMutation(
    trpc.stock.update.mutationOptions({
      onSuccess: () => {
        toast.success("Produto atualizado com sucesso!");
        queryClient.invalidateQueries({ queryKey: [["stock"]] });
        router.push("/stock");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const isPending = createMutation.isPending || updateMutation.isPending;

  function onSubmit(data: CreateProductInput) {
    if (isEdit && defaultValues?.id) {
      updateMutation.mutate({ ...data, id: defaultValues.id });
    } else {
      createMutation.mutate(data);
    }
  }

  // Fallback quando handleSubmit rejeita silenciosamente — alguns campos
  // sao validados pelo Zod mas nao tem <FormField> no UI (ex: categoryIds,
  // attributeConfigIds). Sem isto o user clica em "Cadastrar" e nada acontece.
  function onInvalid(errors: Record<string, unknown>) {
    const firstKey = Object.keys(errors)[0];
    if (!firstKey) {
      toast.error("Verifique os campos do formulario.");
      return;
    }
    const firstError = errors[firstKey] as { message?: string } | undefined;
    toast.error(
      firstError?.message
        ? `${firstKey}: ${firstError.message}`
        : "Verifique os campos do formulario.",
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-8">
        <FormSection title="Dados do Produto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Nome do Produto *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Ex: iPhone 13 128GB" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sku"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Codigo Interno (SKU)</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} placeholder="Ex: IPHONE13-128" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="barcode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Codigo de Barras</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} placeholder="Ex: 7891234567890" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="brand"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Marca</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} placeholder="Ex: Apple, Samsung" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => {
                const creatingNew = form.watch("newCategoryName") != null;
                return (
                  <FormItem>
                    <FormLabel>Categoria</FormLabel>
                    <FormControl>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={creatingNew ? NEW_CATEGORY_OPTION : field.value ?? ""}
                        onChange={(e) => {
                          if (e.target.value === NEW_CATEGORY_OPTION) {
                            // Entra no modo "criar": limpa a seleção e habilita o input.
                            field.onChange(null);
                            form.setValue("newCategoryName", "");
                          } else {
                            field.onChange(e.target.value || null);
                            form.setValue("newCategoryName", null);
                          }
                        }}
                      >
                        <option value="">Sem categoria</option>
                        {categories?.data?.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                        {!isEdit && (
                          <option value={NEW_CATEGORY_OPTION}>+ Nova categoria…</option>
                        )}
                      </select>
                    </FormControl>
                    {creatingNew && (
                      <FormField
                        control={form.control}
                        name="newCategoryName"
                        render={({ field: nameField }) => (
                          <FormItem className="mt-2">
                            <FormControl>
                              <Input
                                autoFocus
                                placeholder="Nome da nova categoria"
                                value={nameField.value ?? ""}
                                onChange={(e) => nameField.onChange(e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
          </div>
        </FormSection>

        <FormSection title="Fotos do Produto">
          {isEdit && defaultValues?.id ? (
            <ProductPhotoManager productId={defaultValues.id} />
          ) : (
            <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
              Salve o produto para adicionar fotos. O upload usa Cloudinary e fica disponivel na edicao.
            </div>
          )}
        </FormSection>

        <FormSection title="Classificacao Fiscal">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="ncm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>NCM</FormLabel>
                  <FormControl>
                    <NcmInput
                      value={field.value}
                      onChange={field.onChange}
                      suggestText={form.watch("name")}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cest"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CEST</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value || null)}
                      placeholder="Opcional"
                      maxLength={10}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="icmsDifferentialRate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Aliquota ICMS Diferencial (%)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                      placeholder="0.00"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        {hasVariations && <VariationsEditor />}

        {/* Imagem por variacao: so na edicao (precisa das variacoes ja salvas). */}
        {hasVariations && isEdit && defaultValues?.id && (
          <FormSection title="Imagens por Variacao">
            <VariationImagesPanel productId={defaultValues.id} />
          </FormSection>
        )}

        {!hasVariations && (
          <FormSection title="Precos e Estoque">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <FormField
                control={form.control}
                name="costPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preco de Custo</FormLabel>
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
                    <FormLabel>Preco de Venda *</FormLabel>
                    <FormControl>
                      <MoneyInput value={field.value} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="promotionalPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preco Promocional</FormLabel>
                    <FormControl>
                      <MoneyInput
                        value={field.value ?? 0}
                        onChange={(v) => field.onChange(v > 0 ? v : null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="defaultMargin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Margem Padrao (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                        placeholder="0.00"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="minStock"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estoque Minimo</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        value={field.value ?? 0}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        placeholder="0"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unidade</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? "un"} placeholder="un" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </FormSection>
        )}

        <FormSection title="Descricao">
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Descricao</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    value={field.value ?? ""}
                    placeholder="Descricao do produto (opcional)"
                    rows={4}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <FormSection title="Configuracoes">
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="isDevice"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">É Aparelho</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Celular, notebook, tablet, console ou similar. Necessário para aparecer em Compra de Aparelhos e PDV de upgrade.
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value ?? false}
                      onCheckedChange={(v) => {
                        field.onChange(v);
                        // Aparelhos quase sempre são serializados — ativa automaticamente
                        if (v) form.setValue("isSerialized", true);
                      }}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isSerialized"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Produto Serializado</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Ativar para produtos com IMEI ou numero de serie (aparelhos)
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isPremium"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Produto Premium</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Afeta calculo de comissoes
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="hasVariations"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Usa Variacoes</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Habilitar para produtos com variantes (cor, armazenamento). Precos definidos por variacao.
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value ?? false}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Produto Ativo</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Produtos inativos nao aparecem na busca do PDV
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value ?? true}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormActions
          isLoading={isPending}
          onCancel={() => router.push("/stock")}
          submitLabel={isEdit ? "Salvar Alteracoes" : "Cadastrar Produto"}
        />
      </form>
    </Form>
  );
}
