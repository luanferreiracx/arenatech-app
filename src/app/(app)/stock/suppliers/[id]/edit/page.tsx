"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PageHeader } from "@/components/domain/page-header";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhoneInput } from "@/components/inputs/phone-input";
import { CepInput, type AddressResult } from "@/components/inputs/cep-input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import { updateSupplierSchema, type UpdateSupplierInput } from "@/lib/validators/stock";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const supplierQuery = useQuery(trpc.stock.getSupplier.queryOptions({ id }));

  const form = useForm<UpdateSupplierInput>({
    resolver: zodResolver(updateSupplierSchema),
    // Se o dado do servidor mudar embaixo (outra pessoa editando), preserva o que
    // o usuário já digitou em vez de sobrescrever o formulário (CFG-4).
    resetOptions: { keepDirtyValues: true },
    values: supplierQuery.data
      ? {
          id,
          type: supplierQuery.data.type as "PF" | "PJ",
          name: supplierQuery.data.name,
          tradeName: supplierQuery.data.tradeName ?? "",
          cpf: supplierQuery.data.cpf ?? "",
          cnpj: supplierQuery.data.cnpj ?? "",
          phone: supplierQuery.data.phone ?? "",
          email: supplierQuery.data.email ?? "",
          notes: supplierQuery.data.notes ?? "",
          active: supplierQuery.data.active,
          zipCode: supplierQuery.data.zipCode ?? "",
          street: supplierQuery.data.street ?? "",
          streetNumber: supplierQuery.data.streetNumber ?? "",
          complement: supplierQuery.data.complement ?? "",
          neighborhood: supplierQuery.data.neighborhood ?? "",
          city: supplierQuery.data.city ?? "",
          state: supplierQuery.data.state ?? "",
        }
      : undefined,
  });

  const updateMutation = useMutation(
    trpc.stock.updateSupplier.mutationOptions({
      onSuccess: () => {
        toast.success("Fornecedor atualizado");
        queryClient.invalidateQueries({ queryKey: trpc.stock.getSupplier.queryKey({ id }) });
        router.push(`/stock/suppliers/${id}`);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  if (supplierQuery.isLoading) {
    return <Skeleton className="h-96" />;
  }

  return (
    <div>
      <PageHeader
        title="Editar Fornecedor"
        subtitle={supplierQuery.data?.name}
        actions={
          <Button variant="outline" asChild>
            <Link href={`/stock/suppliers/${id}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
        }
      />

      <form onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))} className="space-y-6">
        <FormSection title="Dados do Fornecedor">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tipo-de-pessoa">Tipo de Pessoa *</Label>
              <Select
                value={form.watch("type")}
                onValueChange={(v) => form.setValue("type", v as "PF" | "PJ")}
              >
                <SelectTrigger id="tipo-de-pessoa"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PJ">Pessoa Juridica</SelectItem>
                  <SelectItem value="PF">Pessoa Fisica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cpf-cnpj">CPF/CNPJ</Label>
              <Input id="cpf-cnpj" {...form.register(form.watch("type") === "PF" ? "cpf" : "cnpj")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="razao-social-nome">Razao Social / Nome *</Label>
              <Input id="razao-social-nome" {...form.register("name")} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="nome-fantasia">Nome Fantasia</Label>
              <Input id="nome-fantasia" {...form.register("tradeName")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone</Label>
              <PhoneInput id="telefone" value={form.watch("phone") ?? ""} onValueChange={(v: string) => form.setValue("phone", v)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...form.register("email")} />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <Switch checked={form.watch("active") ?? true} onCheckedChange={(v) => form.setValue("active", v)} />
            <Label>Fornecedor ativo</Label>
          </div>
        </FormSection>

        <FormSection title="Endereco">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cep">CEP</Label>
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
              <Label htmlFor="logradouro">Logradouro</Label>
              <Input id="logradouro" {...form.register("street")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="numero">Numero</Label>
              <Input id="numero" {...form.register("streetNumber")} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="complemento">Complemento</Label>
              <Input id="complemento" {...form.register("complement")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bairro">Bairro</Label>
              <Input id="bairro" {...form.register("neighborhood")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cidade">Cidade</Label>
              <Input id="cidade" {...form.register("city")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="uf">UF</Label>
              <Input id="uf" {...form.register("state")} maxLength={2} className="uppercase" />
            </div>
          </div>
        </FormSection>

        <FormSection title="Observacoes">
          <Textarea {...form.register("notes")} rows={3} />
        </FormSection>

        <FormActions
          isLoading={updateMutation.isPending}
          submitLabel="Atualizar"
          onCancel={() => router.push(`/stock/suppliers/${id}`)}
        />
      </form>
    </div>
  );
}
