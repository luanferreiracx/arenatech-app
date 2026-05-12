"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import {
  createCustomerSchema,
  type CreateCustomerInput,
} from "@/lib/validators/customer";
import type { AddressData } from "@/lib/validators/customer";
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
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { CpfInput } from "@/components/forms/cpf-input";
import { CnpjInput } from "@/components/inputs/cnpj-input";
import { PhoneInput } from "@/components/inputs/phone-input";
import { CepInput, type ViaCEPResponse } from "@/components/inputs/cep-input";
import { DatePicker } from "@/components/inputs/date-picker";
import { Button } from "@/components/ui/button";

interface CustomerFormProps {
  defaultValues?: CreateCustomerInput & { id?: string };
  isEdit?: boolean;
}

export function CustomerForm({ defaultValues, isEdit = false }: CustomerFormProps) {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const form = useForm<CreateCustomerInput>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: defaultValues ?? {
      type: "PF",
      name: "",
      cpf: "",
      cnpj: "",
      email: "",
      phone: "",
      phone2: "",
      birthDate: "",
      address: {
        cep: "",
        logradouro: "",
        numero: "",
        complemento: "",
        bairro: "",
        cidade: "",
        uf: "",
      },
      notes: "",
      consentLgpd: false,
    },
  });

  const customerType = form.watch("type");

  const createMutation = useMutation(
    trpc.customer.create.mutationOptions({
      onSuccess: (data) => {
        toast.success("Cliente cadastrado com sucesso!");
        queryClient.invalidateQueries({ queryKey: [["customer"]] });
        router.push(`/customers/${data.id}`);
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const updateMutation = useMutation(
    trpc.customer.update.mutationOptions({
      onSuccess: (data) => {
        toast.success("Cliente atualizado com sucesso!");
        queryClient.invalidateQueries({ queryKey: [["customer"]] });
        router.push(`/customers/${data.id}`);
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const isPending = createMutation.isPending || updateMutation.isPending;

  function onSubmit(data: CreateCustomerInput) {
    if (isEdit && defaultValues?.id) {
      updateMutation.mutate({ ...data, id: defaultValues.id });
    } else {
      createMutation.mutate(data);
    }
  }

  function handleAddressFound(addr: ViaCEPResponse) {
    const current = form.getValues("address") as AddressData | undefined;
    form.setValue("address", {
      ...current,
      logradouro: addr.logradouro || current?.logradouro || "",
      bairro: addr.bairro || current?.bairro || "",
      cidade: addr.localidade || current?.cidade || "",
      uf: addr.uf || current?.uf || "",
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* Tipo */}
        <FormSection title="Tipo de Cliente">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={customerType === "PF" ? "default" : "outline"}
              onClick={() => form.setValue("type", "PF")}
            >
              Pessoa Fisica (PF)
            </Button>
            <Button
              type="button"
              variant={customerType === "PJ" ? "default" : "outline"}
              onClick={() => form.setValue("type", "PJ")}
            >
              Pessoa Juridica (PJ)
            </Button>
          </div>
        </FormSection>

        {/* Dados Pessoais */}
        <FormSection title={customerType === "PF" ? "Dados Pessoais" : "Dados da Empresa"}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>
                    {customerType === "PF" ? "Nome Completo" : "Razao Social / Nome Fantasia"} *
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={customerType === "PF" ? "Digite o nome completo" : "Digite a razao social"} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {customerType === "PF" && (
              <FormField
                control={form.control}
                name="cpf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF *</FormLabel>
                    <FormControl>
                      <CpfInput
                        value={field.value ?? ""}
                        onValueChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {customerType === "PJ" && (
              <FormField
                control={form.control}
                name="cnpj"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CNPJ *</FormLabel>
                    <FormControl>
                      <CnpjInput
                        value={field.value ?? ""}
                        onValueChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

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
                        onChange={(date) => field.onChange(date?.toISOString() ?? "")}
                        placeholder="Selecionar data"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" placeholder="email@exemplo.com" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        {/* Contato */}
        <FormSection title="Contato">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Celular/WhatsApp</FormLabel>
                  <FormControl>
                    <PhoneInput
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
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
                  <FormLabel>Celular Alternativo</FormLabel>
                  <FormControl>
                    <PhoneInput
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        {/* Endereco */}
        <FormSection title="Endereco">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <FormField
              control={form.control}
              name="address.cep"
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
              name="address.logradouro"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Logradouro</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} placeholder="Rua, Avenida..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address.numero"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Numero</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} placeholder="N" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address.complemento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Complemento</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} placeholder="Apto, Sala..." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address.bairro"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bairro</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} placeholder="Bairro" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address.cidade"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cidade</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} placeholder="Cidade" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address.uf"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} placeholder="UF" maxLength={2} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        {/* Observacoes */}
        <FormSection title="Observacoes">
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Observacoes</FormLabel>
                <FormControl>
                  <Textarea {...field} value={field.value ?? ""} placeholder="Observacoes sobre o cliente" rows={4} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        {/* LGPD */}
        {!isEdit && (
          <FormField
            control={form.control}
            name="consentLgpd"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value ?? false}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel className="font-normal">
                    Autorizo o uso dos meus dados conforme a LGPD
                  </FormLabel>
                </div>
              </FormItem>
            )}
          />
        )}

        <FormActions
          isLoading={isPending}
          onCancel={() => router.back()}
          submitLabel={isEdit ? "Salvar Alteracoes" : "Cadastrar Cliente"}
        />
      </form>
    </Form>
  );
}
