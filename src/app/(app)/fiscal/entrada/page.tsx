"use client";

import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PageHeader } from "@/components/domain/page-header";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { Button } from "@/components/ui/button";
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
import { PhoneInput } from "@/components/inputs/phone-input";
import { CepInput, type AddressResult } from "@/components/inputs/cep-input";
import { MoneyInput } from "@/components/inputs/money-input";
import { EntitySelector } from "@/components/domain/entity-selector";
import { toast } from "@/lib/toast";
import { createEntradaSchema, type CreateEntradaInput } from "@/lib/validators/fiscal";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function EntradaPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const form = useForm<CreateEntradaInput>({
    resolver: zodResolver(createEntradaSchema),
    defaultValues: {
      supplierName: "",
      supplierCpfCnpj: "",
      supplierEmail: "",
      supplierPhone: "",
      supplierId: null,
      zipCode: "",
      street: "",
      number: "",
      complement: "",
      neighborhood: "",
      city: "",
      state: "",
      freightMode: "9",
      freightAmount: 0,
      insuranceAmount: 0,
      otherExpenses: 0,
      additionalInfo: "",
    },
  });

  const createMutation = useMutation(
    trpc.fiscal.createEntrada.mutationOptions({
      onSuccess: (data) => {
        toast.success("NF-e de entrada criada. Adicione os itens.");
        router.push(`/fiscal/${data.id}/edit`);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <div>
      <PageHeader
        title="NF-e de Entrada Avulsa"
        subtitle="Registre compras de mercadorias sem vinculo a uma compra no sistema"
        actions={
          <Button variant="outline" asChild>
            <Link href="/fiscal">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
        }
      />

      <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-6">
        <FormSection title="Remetente / Fornecedor">
          <div className="space-y-2 mb-4">
            <Label htmlFor="buscar-fornecedor">Buscar Fornecedor</Label>
            <EntitySelector id="buscar-fornecedor"
              value={form.watch("supplierId") ?? ""}
              onChange={(v) => form.setValue("supplierId", v || null)}
              searchFn={async (search) => {
                return queryClient.fetchQuery(
                  trpc.stock.searchSuppliers.queryOptions({ search }),
                );
              }}
              getOptionLabel={(s) => `${s.tradeName || s.name}${(s.cpf || s.cnpj) ? ` — ${s.cpf || s.cnpj}` : ""}`}
              getOptionValue={(s) => s.id}
              placeholder="Buscar fornecedor..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cpf-cnpj">CPF/CNPJ *</Label>
              <Input id="cpf-cnpj" {...form.register("supplierCpfCnpj")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone</Label>
              <PhoneInput id="telefone"
                value={form.watch("supplierPhone") ?? ""}
                onValueChange={(v: string) => form.setValue("supplierPhone", v)}
              />
            </div>
          </div>
          <div className="space-y-2 mt-4">
            <Label htmlFor="nome-razao-social">Nome / Razao Social *</Label>
            <Input id="nome-razao-social" {...form.register("supplierName")} />
          </div>
          <div className="space-y-2 mt-4">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...form.register("supplierEmail")} />
          </div>

          <div className="border-t pt-4 mt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Endereco</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cep">CEP *</Label>
                <CepInput id="cep"
                  value={form.watch("zipCode") ?? ""}
                  onValueChange={(v: string) => form.setValue("zipCode", v)}
                  onAddressFound={(addr: AddressResult) => {
                    form.setValue("street", addr.logradouro);
                    form.setValue("neighborhood", addr.bairro);
                    form.setValue("city", addr.cidade);
                    form.setValue("state", addr.estado);
                  }}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="logradouro">Logradouro *</Label>
                <Input id="logradouro" {...form.register("street")} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
              <div className="space-y-2">
                <Label htmlFor="numero">Numero *</Label>
                <Input id="numero" {...form.register("number")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="complemento">Complemento</Label>
                <Input id="complemento" {...form.register("complement")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bairro">Bairro *</Label>
                <Input id="bairro" {...form.register("neighborhood")} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="cidade">Cidade *</Label>
                <Input id="cidade" {...form.register("city")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="uf">UF *</Label>
                <Input id="uf" {...form.register("state")} maxLength={2} className="uppercase" />
              </div>
            </div>
          </div>
        </FormSection>

        <FormSection title="Dados da Operacao">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="modalidade-do-frete">Modalidade do Frete</Label>
              <Select
                value={form.watch("freightMode") ?? "9"}
                onValueChange={(v) => form.setValue("freightMode", v)}
              >
                <SelectTrigger id="modalidade-do-frete"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="9">Sem Frete</SelectItem>
                  <SelectItem value="0">Por conta do Emitente (Loja)</SelectItem>
                  <SelectItem value="1">Por conta do Remetente</SelectItem>
                  <SelectItem value="2">Por conta de Terceiros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="valor-do-frete">Valor do Frete</Label>
              <MoneyInput id="valor-do-frete"
                value={form.watch("freightAmount") ?? 0}
                onChange={(v) => form.setValue("freightAmount", v)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="valor-do-seguro">Valor do Seguro</Label>
              <MoneyInput id="valor-do-seguro"
                value={form.watch("insuranceAmount") ?? 0}
                onChange={(v) => form.setValue("insuranceAmount", v)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="outras-despesas">Outras Despesas</Label>
              <MoneyInput id="outras-despesas"
                value={form.watch("otherExpenses") ?? 0}
                onChange={(v) => form.setValue("otherExpenses", v)}
              />
            </div>
          </div>
          <div className="space-y-2 mt-4">
            <Label htmlFor="informacoes-complementares">Informacoes Complementares</Label>
            <Textarea id="informacoes-complementares" {...form.register("additionalInfo")} rows={3} placeholder="Detalhes adicionais..." />
          </div>
        </FormSection>

        <FormActions
          isLoading={createMutation.isPending}
          submitLabel="Criar NF-e e Adicionar Itens"
          onCancel={() => router.push("/fiscal")}
        />
      </form>
    </div>
  );
}
