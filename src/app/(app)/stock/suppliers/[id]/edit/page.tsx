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
import { CepInput, type ViaCEPResponse } from "@/components/inputs/cep-input";
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
    values: supplierQuery.data
      ? {
          id,
          type: supplierQuery.data.type as "PF" | "PJ",
          name: supplierQuery.data.name,
          tradeName: supplierQuery.data.tradeName ?? "",
          cpfCnpj: supplierQuery.data.cpfCnpj ?? "",
          phone: supplierQuery.data.phone ?? "",
          email: supplierQuery.data.email ?? "",
          notes: supplierQuery.data.notes ?? "",
          active: supplierQuery.data.active,
          address: (supplierQuery.data.address as Record<string, string> | null) ?? {
            zipCode: "",
            street: "",
            number: "",
            complement: "",
            neighborhood: "",
            city: "",
            state: "",
          },
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
              <Label>Tipo de Pessoa *</Label>
              <Select
                value={form.watch("type")}
                onValueChange={(v) => form.setValue("type", v as "PF" | "PJ")}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PJ">Pessoa Juridica</SelectItem>
                  <SelectItem value="PF">Pessoa Fisica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>CPF/CNPJ</Label>
              <Input {...form.register("cpfCnpj")} />
            </div>
            <div className="space-y-2">
              <Label>Razao Social / Nome *</Label>
              <Input {...form.register("name")} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            <div className="space-y-2">
              <Label>Nome Fantasia</Label>
              <Input {...form.register("tradeName")} />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <PhoneInput value={form.watch("phone") ?? ""} onValueChange={(v: string) => form.setValue("phone", v)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" {...form.register("email")} />
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
              <Label>CEP</Label>
              <CepInput
                value={form.watch("address.zipCode") ?? ""}
                onValueChange={(v: string) => form.setValue("address.zipCode", v)}
                onAddressFound={(addr: ViaCEPResponse) => {
                  form.setValue("address.street", addr.logradouro);
                  form.setValue("address.neighborhood", addr.bairro);
                  form.setValue("address.city", addr.localidade);
                  form.setValue("address.state", addr.uf);
                }}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Logradouro</Label>
              <Input {...form.register("address.street")} />
            </div>
            <div className="space-y-2">
              <Label>Numero</Label>
              <Input {...form.register("address.number")} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-4">
            <div className="space-y-2">
              <Label>Complemento</Label>
              <Input {...form.register("address.complement")} />
            </div>
            <div className="space-y-2">
              <Label>Bairro</Label>
              <Input {...form.register("address.neighborhood")} />
            </div>
            <div className="space-y-2">
              <Label>Cidade</Label>
              <Input {...form.register("address.city")} />
            </div>
            <div className="space-y-2">
              <Label>UF</Label>
              <Input {...form.register("address.state")} maxLength={2} className="uppercase" />
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
