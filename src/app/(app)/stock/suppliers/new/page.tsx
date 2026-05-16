"use client";

import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
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
import { toast } from "@/lib/toast";
import { createSupplierSchema, type CreateSupplierInput } from "@/lib/validators/stock";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NewSupplierPage() {
  const router = useRouter();
  const trpc = useTRPC();

  const form = useForm<CreateSupplierInput>({
    resolver: zodResolver(createSupplierSchema),
    defaultValues: {
      type: "PJ",
      name: "",
      tradeName: "",
      cpfCnpj: "",
      phone: "",
      email: "",
      notes: "",
      active: true,
      address: {
        zipCode: "",
        street: "",
        number: "",
        complement: "",
        neighborhood: "",
        city: "",
        state: "",
      },
    },
  });

  const createMutation = useMutation(
    trpc.stock.createSupplier.mutationOptions({
      onSuccess: () => {
        toast.success("Fornecedor cadastrado com sucesso");
        router.push("/stock/suppliers");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const onSubmit = form.handleSubmit((data) => {
    createMutation.mutate(data);
  });

  return (
    <div>
      <PageHeader
        title="Novo Fornecedor"
        subtitle="Cadastre um novo fornecedor"
        actions={
          <Button variant="outline" asChild>
            <Link href="/stock/suppliers">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
        }
      />

      <form onSubmit={onSubmit} className="space-y-6">
        <FormSection title="Dados do Fornecedor">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Pessoa *</Label>
              <Select
                value={form.watch("type")}
                onValueChange={(v) => form.setValue("type", v as "PF" | "PJ")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PJ">Pessoa Juridica</SelectItem>
                  <SelectItem value="PF">Pessoa Fisica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>CPF/CNPJ</Label>
              <Input {...form.register("cpfCnpj")} placeholder="00.000.000/0000-00" />
            </div>
            <div className="space-y-2 sm:col-span-1">
              <Label>Razao Social / Nome *</Label>
              <Input {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            <div className="space-y-2">
              <Label>Nome Fantasia</Label>
              <Input {...form.register("tradeName")} />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <PhoneInput
                value={form.watch("phone") ?? ""}
                onValueChange={(v: string) => form.setValue("phone", v)}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" {...form.register("email")} />
            </div>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <Switch
              checked={form.watch("active") ?? true}
              onCheckedChange={(v) => form.setValue("active", v)}
            />
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
                onAddressFound={(addr: AddressResult) => {
                  form.setValue("address.street", addr.logradouro);
                  form.setValue("address.neighborhood", addr.bairro);
                  form.setValue("address.city", addr.cidade);
                  form.setValue("address.state", addr.estado);
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
          <Textarea
            {...form.register("notes")}
            placeholder="Observacoes sobre o fornecedor"
            rows={3}
          />
        </FormSection>

        <FormActions
          isLoading={createMutation.isPending}
          submitLabel="Cadastrar"
          onCancel={() => router.push("/stock/suppliers")}
        />
      </form>
    </div>
  );
}
