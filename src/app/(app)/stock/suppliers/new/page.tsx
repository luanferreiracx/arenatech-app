"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();
  const [lookingUp, setLookingUp] = useState(false);

  const form = useForm<CreateSupplierInput>({
    resolver: zodResolver(createSupplierSchema),
    defaultValues: {
      type: "PJ",
      name: "",
      tradeName: "",
      cpf: "",
      cnpj: "",
      phone: "",
      email: "",
      notes: "",
      active: true,
      zipCode: "",
      street: "",
      streetNumber: "",
      complement: "",
      neighborhood: "",
      city: "",
      state: "",
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

  // Detecção inline de fornecedor duplicado (paridade Cliente).
  const watchType = form.watch("type");
  const watchCpf = form.watch("cpf");
  const watchCnpj = form.watch("cnpj");
  const cpfDigits = (watchCpf ?? "").replace(/\D/g, "");
  const cnpjDigits = (watchCnpj ?? "").replace(/\D/g, "");
  const docComplete =
    watchType === "PF" ? cpfDigits.length === 11 : cnpjDigits.length === 14;

  const dupQuery = useQuery({
    ...trpc.stock.checkSupplierDuplicate.queryOptions(
      watchType === "PF" ? { cpf: cpfDigits } : { cnpj: cnpjDigits },
    ),
    enabled: docComplete,
    staleTime: 30_000,
  });
  const duplicate = dupQuery.data?.duplicate ? dupQuery.data : null;

  // Busca dados na Receita (CNPJ via BrasilAPI) ou base de CPF e preenche o
  // formulario. So preenche campos vazios — nao sobrescreve o que o operador ja
  // digitou. Disparado por botao (nao automatico) para previsibilidade.
  const setIfEmpty = (field: keyof CreateSupplierInput, value: string | null | undefined) => {
    if (!value) return;
    const current = form.getValues(field);
    if (!current || (typeof current === "string" && current.trim() === "")) {
      form.setValue(field, value, { shouldDirty: true });
    }
  };

  const handleLookup = async () => {
    setLookingUp(true);
    try {
      if (watchType === "PJ") {
        const data = await queryClient.fetchQuery(
          trpc.stock.lookupCnpj.queryOptions({ cnpj: cnpjDigits }),
        );
        if (!data) {
          toast.error("Nao foi possivel buscar este CNPJ na Receita.");
          return;
        }
        // Razao social e o dado-chave: sempre preenche se o campo nome estiver vazio.
        setIfEmpty("name", data.razaoSocial);
        setIfEmpty("tradeName", data.nomeFantasia);
        setIfEmpty("phone", data.telefone);
        setIfEmpty("email", data.email);
        setIfEmpty("zipCode", data.cep);
        setIfEmpty("street", data.logradouro);
        setIfEmpty("neighborhood", data.bairro);
        setIfEmpty("city", data.municipio);
        setIfEmpty("state", data.uf);
        toast.success("Dados do CNPJ preenchidos.");
      } else {
        const data = await queryClient.fetchQuery(
          trpc.stock.lookupCpf.queryOptions({ cpf: cpfDigits }),
        );
        if (!data?.name) {
          toast.error("Nao foi possivel buscar este CPF.");
          return;
        }
        setIfEmpty("name", data.name);
        toast.success("Nome preenchido a partir do CPF.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na busca.");
    } finally {
      setLookingUp(false);
    }
  };

  const onSubmit = form.handleSubmit(
    (data) => {
      if (duplicate) {
        toast.error("Documento ja cadastrado em outro fornecedor.");
        return;
      }
      createMutation.mutate(data);
    },
    () => toast.error("Revise os campos destacados antes de salvar."),
  );

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
              <div className="flex gap-2">
                <Input
                  {...form.register(form.watch("type") === "PF" ? "cpf" : "cnpj")}
                  placeholder={form.watch("type") === "PF" ? "000.000.000-00" : "00.000.000/0000-00"}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!docComplete || lookingUp}
                  onClick={handleLookup}
                  title={watchType === "PJ" ? "Buscar dados na Receita pelo CNPJ" : "Buscar nome pelo CPF"}
                >
                  {lookingUp ? "Buscando..." : "Buscar dados"}
                </Button>
              </div>
              {duplicate && (
                <p className="text-xs text-destructive">
                  Documento ja cadastrado em outro fornecedor:{" "}
                  <Link href={`/stock/suppliers/${duplicate.supplier.id}`} className="underline">
                    {duplicate.supplier.name}
                  </Link>
                </p>
              )}
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
              <Label>Logradouro</Label>
              <Input {...form.register("street")} />
            </div>
            <div className="space-y-2">
              <Label>Numero</Label>
              <Input {...form.register("streetNumber")} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-4">
            <div className="space-y-2">
              <Label>Complemento</Label>
              <Input {...form.register("complement")} />
            </div>
            <div className="space-y-2">
              <Label>Bairro</Label>
              <Input {...form.register("neighborhood")} />
            </div>
            <div className="space-y-2">
              <Label>Cidade</Label>
              <Input {...form.register("city")} />
            </div>
            <div className="space-y-2">
              <Label>UF</Label>
              <Input {...form.register("state")} maxLength={2} className="uppercase" />
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
