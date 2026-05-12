"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import {
  updateGeneralSettingsSchema,
  type UpdateGeneralSettingsInput,
} from "@/lib/validators/settings";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/domain/page-header";
import { FormActions } from "@/components/domain/forms/form-actions";
import { CnpjInput } from "@/components/inputs/cnpj-input";
import { PhoneInput } from "@/components/inputs/phone-input";
import { CepInput, type ViaCEPResponse } from "@/components/inputs/cep-input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const UF_OPTIONS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export default function GeneralSettingsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery(
    trpc.settings.getGeneral.queryOptions()
  );

  const form = useForm<UpdateGeneralSettingsInput>({
    resolver: zodResolver(updateGeneralSettingsSchema),
    values: settings
      ? {
          tradeName: settings.tradeName ?? "",
          legalName: settings.legalName ?? "",
          cnpj: settings.cnpj ?? "",
          phone: settings.phone ?? "",
          email: settings.email ?? "",
          address: (settings.address as UpdateGeneralSettingsInput["address"]) ?? {
            cep: "",
            logradouro: "",
            numero: "",
            complemento: "",
            bairro: "",
            cidade: "",
            uf: "",
          },
        }
      : undefined,
  });

  const mutation = useMutation(
    trpc.settings.updateGeneral.mutationOptions({
      onSuccess: () => {
        toast.success("Configuracoes atualizadas com sucesso!");
        queryClient.invalidateQueries({ queryKey: [["settings"]] });
      },
      onError: (error) => {
        toast.error(error.message);
      },
    })
  );

  const onSubmit = (data: UpdateGeneralSettingsInput) => {
    mutation.mutate(data);
  };

  const handleAddressFound = (addr: ViaCEPResponse) => {
    form.setValue("address.logradouro", addr.logradouro);
    form.setValue("address.bairro", addr.bairro);
    form.setValue("address.cidade", addr.localidade);
    form.setValue("address.uf", addr.uf);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Configuracoes Gerais" subtitle="Personalize as informacoes da sua loja" />
        <div className="space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuracoes Gerais"
        subtitle="Personalize as informacoes da sua loja"
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Dados da Loja */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dados da Loja</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="tradeName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome da Loja *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Ex: Tech Store Premium" />
                      </FormControl>
                      <FormDescription>
                        Aparecera no titulo das paginas e documentos.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="legalName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Razao Social</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} placeholder="Razao social conforme CNPJ" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
                        />
                      </FormControl>
                      <FormDescription>
                        Usado em relatorios e documentos fiscais.
                      </FormDescription>
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
                        />
                      </FormControl>
                      <FormDescription>
                        Aparecera nos documentos de OS e comunicacoes com clientes.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-mail</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          type="email"
                          placeholder="contato@loja.com.br"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Endereco */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Endereco</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                        <Input {...field} value={field.value ?? ""} placeholder="Rua, Avenida, etc" />
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
                        <Input {...field} value={field.value ?? ""} placeholder="123" />
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
                        <Input {...field} value={field.value ?? ""} placeholder="Sala, Loja, etc" />
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
                      <FormLabel>UF</FormLabel>
                      <Select
                        value={field.value ?? ""}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {UF_OPTIONS.map((uf) => (
                            <SelectItem key={uf} value={uf}>
                              {uf}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <FormActions
            isLoading={mutation.isPending}
            submitLabel="Salvar Configuracoes"
          />
        </form>
      </Form>
    </div>
  );
}
