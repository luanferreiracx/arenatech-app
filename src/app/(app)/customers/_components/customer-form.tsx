"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCustomerSchema,
  type CreateCustomerInput,
  CUSTOMER_TYPE_LABELS,
} from "@/lib/validators/customer";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { CpfInput } from "@/components/inputs/cpf-input";
import { CnpjInput } from "@/components/inputs/cnpj-input";
import { PhoneInput } from "@/components/inputs/phone-input";
import { CepInput, type AddressResult } from "@/components/inputs/cep-input";
import { DateInput } from "@/components/inputs/date-input";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/lib/toast";

const UF_OPTIONS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

interface CustomerFormProps {
  mode: "create" | "edit";
  customerId?: string;
  defaultValues?: Partial<CreateCustomerInput>;
  /** Quando preenchido, chamado apos sucesso em vez de navegar. Util em modais. */
  onSuccess?: (customer: { id: string; name: string }) => void;
  /** Quando preenchido, substitui o botao "Cancelar" que vai para /customers. */
  onCancel?: () => void;
}

export function CustomerForm({ mode, customerId, defaultValues, onSuccess, onCancel }: CustomerFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const form = useForm<CreateCustomerInput>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: {
      type: "PF",
      name: "",
      phone: "",
      ...defaultValues,
    },
  });

  const watchType = form.watch("type");
  const watchCpf = form.watch("cpf");
  const watchCnpj = form.watch("cnpj");

  // Detectar duplicidade ao digitar CPF (PF) ou CNPJ (PJ) — paridade Laravel
  // `consultarCpf`/`consultarCnpj` (parte de duplicidade). Sem chamada DirectD.
  // Skip em modo edit quando documento nao mudou.
  const cpfDigits = (watchCpf ?? "").replace(/\D/g, "");
  const cnpjDigits = (watchCnpj ?? "").replace(/\D/g, "");
  const originalCpf = (defaultValues?.cpf ?? "").replace(/\D/g, "");
  const originalCnpj = (defaultValues?.cnpj ?? "").replace(/\D/g, "");
  const docChanged =
    watchType === "PF"
      ? cpfDigits.length === 11 && cpfDigits !== originalCpf
      : cnpjDigits.length === 14 && cnpjDigits !== originalCnpj;

  const dupQuery = useQuery({
    ...trpc.customer.checkDuplicate.queryOptions(
      watchType === "PF" ? { cpf: cpfDigits } : { cnpj: cnpjDigits },
    ),
    enabled: docChanged,
    staleTime: 30_000,
  });
  const duplicate = dupQuery.data?.duplicate ? dupQuery.data : null;

  const createMutation = useMutation(
    trpc.customer.create.mutationOptions({
      onSuccess: (data: { id: string; name: string }) => {
        toast.success("Cliente cadastrado com sucesso!");
        void queryClient.invalidateQueries({ queryKey: trpc.customer.list.queryKey() });
        if (onSuccess) {
          onSuccess(data);
        } else {
          router.push(`/customers/${data.id}`);
        }
      },
      onError: (error: { message: string }) => {
        toast.error(error.message);
      },
    }),
  );

  const updateMutation = useMutation(
    trpc.customer.update.mutationOptions({
      onSuccess: () => {
        toast.success("Cliente atualizado com sucesso!");
        void queryClient.invalidateQueries({ queryKey: trpc.customer.list.queryKey() });
        if (onSuccess && customerId) {
          onSuccess({ id: customerId, name: form.getValues("name") });
        } else {
          router.push(`/customers/${customerId}`);
        }
      },
      onError: (error: { message: string }) => {
        toast.error(error.message);
      },
    }),
  );

  const isLoading = createMutation.isPending || updateMutation.isPending || dupQuery.isLoading;
  const submitBlocked = !!duplicate;

  function onSubmit(data: CreateCustomerInput) {
    if (submitBlocked) {
      toast.error("Documento ja cadastrado. Resolva a duplicidade antes de salvar.");
      return;
    }
    if (mode === "create") {
      createMutation.mutate(data);
    } else {
      updateMutation.mutate({ ...data, id: customerId! });
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* Tipo de pessoa */}
      <FormSection title="Tipo de pessoa">
        <div className="space-y-2">
          <Label>Tipo</Label>
          <RadioGroup
            value={watchType}
            onValueChange={(v: string) => form.setValue("type", v as "PF" | "PJ")}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="PF" id="pf" />
              <Label htmlFor="pf">{CUSTOMER_TYPE_LABELS.PF}</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="PJ" id="pj" />
              <Label htmlFor="pj">{CUSTOMER_TYPE_LABELS.PJ}</Label>
            </div>
          </RadioGroup>
        </div>
      </FormSection>

      {/* Dados principais */}
      <FormSection title="Dados do cliente">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="customer-name">{watchType === "PJ" ? "Razão social" : "Nome completo"} *</Label>
            <Input id="customer-name" {...form.register("name")} placeholder={watchType === "PJ" ? "Razão social" : "Nome completo"} />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          {watchType === "PJ" && (
            <div className="space-y-2">
              <Label htmlFor="customer-tradeName">Nome fantasia</Label>
              <Input id="customer-tradeName" {...form.register("tradeName")} placeholder="Nome fantasia" />
            </div>
          )}

          {watchType === "PF" ? (
            <div className="space-y-2">
              <Label htmlFor="customer-cpf">CPF *</Label>
              <Controller
                control={form.control}
                name="cpf"
                render={({ field }) => (
                  <CpfInput id="customer-cpf" value={field.value ?? ""} onValueChange={field.onChange} onBlur={field.onBlur} ref={field.ref} />
                )}
              />
              {form.formState.errors.cpf && (
                <p className="text-sm text-destructive">{form.formState.errors.cpf.message}</p>
              )}
              {duplicate && (
                <p className="text-sm text-destructive">
                  Este CPF ja esta cadastrado.{" "}
                  <Link href={`/customers/${duplicate.customer.id}`} className="underline">
                    Ver {duplicate.customer.name}
                  </Link>
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="customer-cnpj">CNPJ *</Label>
              <Controller
                control={form.control}
                name="cnpj"
                render={({ field }) => (
                  <CnpjInput id="customer-cnpj" value={field.value ?? ""} onValueChange={field.onChange} onBlur={field.onBlur} ref={field.ref} />
                )}
              />
              {form.formState.errors.cnpj && (
                <p className="text-sm text-destructive">{form.formState.errors.cnpj.message}</p>
              )}
              {duplicate && (
                <p className="text-sm text-destructive">
                  Este CNPJ ja esta cadastrado.{" "}
                  <Link href={`/customers/${duplicate.customer.id}`} className="underline">
                    Ver {duplicate.customer.name}
                  </Link>
                </p>
              )}
            </div>
          )}

          {watchType === "PF" && (
            <div className="space-y-2">
              <Label htmlFor="customer-birthDate">Data de nascimento</Label>
              <Controller
                control={form.control}
                name="birthDate"
                render={({ field }) => (
                  <DateInput
                    id="customer-birthDate"
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    aria-label="Data de nascimento"
                    yearDropdown
                  />
                )}
              />
            </div>
          )}
        </div>
      </FormSection>

      {/* Contato */}
      <FormSection title="Contato">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="customer-phone">WhatsApp *</Label>
            <Controller
              control={form.control}
              name="phone"
              render={({ field }) => (
                <PhoneInput id="customer-phone" value={field.value ?? ""} onValueChange={field.onChange} onBlur={field.onBlur} ref={field.ref} />
              )}
            />
            {form.formState.errors.phone && (
              <p className="text-sm text-destructive">{form.formState.errors.phone.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer-phoneSecondary">Telefone alternativo</Label>
            <Controller
              control={form.control}
              name="phoneSecondary"
              render={({ field }) => (
                <PhoneInput id="customer-phoneSecondary" value={field.value ?? ""} onValueChange={field.onChange} onBlur={field.onBlur} ref={field.ref} />
              )}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer-email">E-mail</Label>
            <Input id="customer-email" {...form.register("email")} type="email" placeholder="email@exemplo.com" />
            {form.formState.errors.email && (
              <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>
        </div>
      </FormSection>

      {/* Endereço (ADR 0007: campos separados, ADR 0009: ViaCEP) */}
      <FormSection title="Endereço">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="customer-zipCode">CEP</Label>
            <CepInput
              id="customer-zipCode"
              value={form.watch("zipCode") ?? ""}
              onValueChange={(raw) => form.setValue("zipCode", raw)}
              onAddressFound={(address: AddressResult) => {
                form.setValue("street", address.logradouro);
                form.setValue("neighborhood", address.bairro);
                form.setValue("city", address.cidade);
                form.setValue("state", address.estado);
              }}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="customer-street">Logradouro</Label>
            <Input id="customer-street" {...form.register("street")} placeholder="Rua, Avenida..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer-streetNumber">Número</Label>
            <Input id="customer-streetNumber" {...form.register("streetNumber")} placeholder="Nº" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer-complement">Complemento</Label>
            <Input id="customer-complement" {...form.register("complement")} placeholder="Apto, Sala..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer-neighborhood">Bairro</Label>
            <Input id="customer-neighborhood" {...form.register("neighborhood")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer-city">Cidade</Label>
            <Input id="customer-city" {...form.register("city")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer-state">Estado</Label>
            <Select
              value={form.watch("state") ?? ""}
              onValueChange={(v: string) => form.setValue("state", v)}
            >
              <SelectTrigger id="customer-state">
                <SelectValue placeholder="UF" />
              </SelectTrigger>
              <SelectContent>
                {UF_OPTIONS.map((uf) => (
                  <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </FormSection>

      {/* Observações */}
      <FormSection title="Observações">
        <Textarea {...form.register("notes")} placeholder="Observações sobre o cliente..." rows={3} />
      </FormSection>

      <FormActions
        submitLabel={mode === "create" ? "Cadastrar cliente" : "Salvar alterações"}
        onCancel={onCancel ?? (() => router.push("/customers"))}
        isLoading={isLoading}
      />
    </form>
  );
}
