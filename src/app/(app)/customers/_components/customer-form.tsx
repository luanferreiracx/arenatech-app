"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { CpfInput } from "@/components/inputs/cpf-input";
import { CnpjInput } from "@/components/inputs/cnpj-input";
import { PhoneInput } from "@/components/inputs/phone-input";
import { CepInput, type ViaCEPResponse } from "@/components/inputs/cep-input";
import { DatePicker } from "@/components/inputs/date-picker";
import { createCustomerSchema } from "@/lib/validators/customer";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "@/lib/toast";

type FormValues = {
  type: "PF" | "PJ";
  name: string;
  cpf?: string;
  cnpj?: string;
  email?: string;
  phone?: string;
  phone2?: string;
  birthDate?: Date;
  address?: {
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  notes?: string;
  consentAt?: Date;
};

interface CustomerFormProps {
  defaultValues?: Partial<FormValues> & { id?: string };
  mode?: "create" | "edit";
}

export function CustomerForm({ defaultValues, mode = "create" }: CustomerFormProps) {
  const trpc = useTRPC();
  const router = useRouter();
  const [consentChecked, setConsentChecked] = useState(!!defaultValues?.consentAt);

  const form = useForm<FormValues>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: {
      type: defaultValues?.type ?? "PF",
      name: defaultValues?.name ?? "",
      cpf: defaultValues?.cpf ?? "",
      cnpj: defaultValues?.cnpj ?? "",
      email: defaultValues?.email ?? "",
      phone: defaultValues?.phone ?? "",
      phone2: defaultValues?.phone2 ?? "",
      birthDate: defaultValues?.birthDate,
      address: defaultValues?.address ?? {},
      notes: defaultValues?.notes ?? "",
    },
  });

  const customerType = form.watch("type");

  const createMutation = useMutation(
    trpc.customers.create.mutationOptions({
      onSuccess: (data) => {
        toast.success("Cliente criado com sucesso!");
        router.push(`/customers/${data.id}`);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const updateMutation = useMutation(
    trpc.customers.update.mutationOptions({
      onSuccess: () => {
        toast.success("Cliente atualizado com sucesso!");
        router.push(`/customers/${defaultValues?.id}`);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const handleAddressFound = (data: ViaCEPResponse) => {
    form.setValue("address.street", data.logradouro);
    form.setValue("address.neighborhood", data.bairro);
    form.setValue("address.city", data.localidade);
    form.setValue("address.state", data.uf);
    form.setValue("address.zip", data.cep.replace("-", ""));
  };

  const onSubmit = (values: FormValues) => {
    if (mode === "create" && !consentChecked) {
      toast.error("É necessário obter o consentimento do cliente (LGPD).");
      return;
    }

    const payload = {
      ...values,
      consentAt: consentChecked ? new Date() : undefined,
    };

    if (mode === "edit" && defaultValues?.id) {
      updateMutation.mutate({ id: defaultValues.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-3xl">
        <FormSection title="Dados Pessoais">
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de Pessoa</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="PF">Pessoa Física</SelectItem>
                    <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {customerType === "PF" ? "Nome Completo" : "Razão Social"} *
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="Nome do cliente" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {customerType === "PF" ? (
              <FormField
                control={form.control}
                name="cpf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF</FormLabel>
                    <FormControl>
                      <CpfInput
                        value={field.value ?? ""}
                        onValueChange={field.onChange}
                        onBlur={field.onBlur}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <FormField
                control={form.control}
                name="cnpj"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CNPJ</FormLabel>
                    <FormControl>
                      <CnpjInput
                        value={field.value ?? ""}
                        onValueChange={field.onChange}
                        onBlur={field.onBlur}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>

          {customerType === "PF" && (
            <FormField
              control={form.control}
              name="birthDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de Nascimento</FormLabel>
                  <FormControl>
                    <DatePicker
                      value={field.value ? new Date(field.value) : undefined}
                      onChange={field.onChange}
                      placeholder="Selecione a data"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="cliente@email.com" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone</FormLabel>
                  <FormControl>
                    <PhoneInput
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone2"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone 2</FormLabel>
                  <FormControl>
                    <PhoneInput
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormSection title="Endereço">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="address.zip"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CEP</FormLabel>
                  <FormControl>
                    <CepInput
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                      onAddressFound={handleAddressFound}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address.state"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>UF</FormLabel>
                  <FormControl>
                    <Input maxLength={2} placeholder="PI" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <FormField
                control={form.control}
                name="address.street"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Logradouro</FormLabel>
                    <FormControl>
                      <Input placeholder="Rua das Flores" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="address.number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número</FormLabel>
                  <FormControl>
                    <Input placeholder="123" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="address.complement"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Complemento</FormLabel>
                  <FormControl>
                    <Input placeholder="Apto 2" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address.neighborhood"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bairro</FormLabel>
                  <FormControl>
                    <Input placeholder="Centro" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address.city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cidade</FormLabel>
                  <FormControl>
                    <Input placeholder="Teresina" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormSection title="Observações">
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Observações</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Informações adicionais sobre o cliente..."
                    rows={3}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex items-start gap-3 p-3 rounded-md border border-border bg-muted/30">
            <Checkbox
              id="lgpd-consent"
              checked={consentChecked}
              onCheckedChange={(checked) => setConsentChecked(!!checked)}
              className="mt-0.5"
            />
            <label htmlFor="lgpd-consent" className="text-sm cursor-pointer">
              <span className="font-medium">Consentimento LGPD *</span>
              <br />
              <span className="text-muted-foreground">
                O cliente autoriza o uso dos seus dados pessoais para finalidades relacionadas ao
                serviço prestado, conforme a Lei Geral de Proteção de Dados (LGPD).
              </span>
            </label>
          </div>
        </FormSection>

        <FormActions
          isLoading={isLoading}
          onCancel={() => router.push("/customers")}
          submitLabel={mode === "edit" ? "Salvar Alterações" : "Criar Cliente"}
        />
      </form>
    </Form>
  );
}
