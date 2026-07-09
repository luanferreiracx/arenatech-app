"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import {
  updateFiscalSettingsSchema,
  type UpdateFiscalSettingsInput,
} from "@/lib/validators/subscription";
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
import { CepInput, type AddressResult } from "@/components/inputs/cep-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/domain/page-header";
import { FormActions } from "@/components/domain/forms/form-actions";
import { LoadingState } from "@/components/domain/loading-state";
import { Switch } from "@/components/ui/switch";
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

export default function FiscalSettingsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: fiscal, isLoading } = useQuery(
    trpc.settings.getFiscalSettings.queryOptions()
  );

  const updateMutation = useMutation(trpc.settings.updateFiscalSettings.mutationOptions());

  const form = useForm<UpdateFiscalSettingsInput>({
    resolver: zodResolver(updateFiscalSettingsSchema),
    values: fiscal ? (fiscal as UpdateFiscalSettingsInput) : undefined,
  });

  const handleAddressFound = (addr: AddressResult) => {
    form.setValue("logradouro", addr.logradouro);
    form.setValue("bairro", addr.bairro);
    form.setValue("cidade", addr.cidade);
    form.setValue("uf", addr.estado);
  };

  if (isLoading) return <LoadingState />;

  const onSubmit = (data: UpdateFiscalSettingsInput) => {
    updateMutation.mutate(data, {
      onSuccess: () => {
        toast.success("Configuracoes fiscais salvas");
        queryClient.invalidateQueries({ queryKey: trpc.settings.getFiscalSettings.queryKey() });
      },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <div>
      <PageHeader title="Configuracoes Fiscais" subtitle="Configure os dados para emissao de NF-e e NFC-e" />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-6 max-w-4xl">
          {/* Dados da Empresa */}
          <Card>
            <CardHeader><CardTitle>Dados da Empresa</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="razaoSocial" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Razao Social</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} placeholder="Razao social conforme CNPJ" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="nomeFantasia" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome Fantasia</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} placeholder="Nome fantasia" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <FormField control={form.control} name="cnpj" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CNPJ</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} placeholder="00.000.000/0000-00" maxLength={18} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="inscricaoEstadual" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Inscricao Estadual</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} placeholder="Numero da IE" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="inscricaoMunicipal" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Inscricao Municipal</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} placeholder="Numero da IM" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="cnae" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CNAE Principal</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} placeholder="Ex: 4751201" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="regimeTributario" render={({ field }) => (
                <FormItem className="max-w-sm">
                  <FormLabel>Regime Tributario</FormLabel>
                  <Select value={field.value ?? "1"} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="1">1 - Simples Nacional</SelectItem>
                      <SelectItem value="2">2 - Simples Nacional - Excesso Sublimite</SelectItem>
                      <SelectItem value="3">3 - Regime Normal (Lucro Real/Presumido)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* Endereco Fiscal */}
          <Card>
            <CardHeader><CardTitle>Endereco Fiscal</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <FormField control={form.control} name="cep" render={({ field }) => (
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
                )} />
                <FormField control={form.control} name="logradouro" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Logradouro</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} placeholder="Rua, Avenida, etc" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="numero" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Numero</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} placeholder="123" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <FormField control={form.control} name="complemento" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Complemento</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} placeholder="Sala, Loja, etc" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="bairro" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bairro</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="cidade" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cidade</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="uf" render={({ field }) => (
                  <FormItem>
                    <FormLabel>UF</FormLabel>
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {UF_OPTIONS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="codigoMunicipio" render={({ field }) => (
                <FormItem className="max-w-xs">
                  <FormLabel>Codigo IBGE Municipio</FormLabel>
                  <FormControl><Input {...field} value={field.value ?? ""} placeholder="7 digitos" maxLength={7} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* NF-e Config */}
          <Card>
            <CardHeader><CardTitle>Configuracoes NF-e / NFC-e</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <FormField control={form.control} name="nfeSerie" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Serie NF-e</FormLabel>
                    <FormControl><Input type="number" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} min={1} max={999} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="nfceSerie" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Serie NFC-e</FormLabel>
                    <FormControl><Input type="number" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} min={1} max={999} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="nfeAmbiente" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ambiente</FormLabel>
                    <Select value={field.value ?? "2"} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="2">Homologacao (Testes)</SelectItem>
                        <SelectItem value="1">Producao</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="tipoDocumentoPadrao" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Documento Padrao</FormLabel>
                    <Select value={field.value ?? "nenhum"} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="nfce">NFC-e (Cupom Fiscal)</SelectItem>
                        <SelectItem value="nfe">NF-e (Nota Fiscal)</SelectItem>
                        <SelectItem value="nenhum">Nenhum</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <FormField control={form.control} name="nfeUltimoNumero" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ultimo Numero NF-e</FormLabel>
                    <FormControl><Input type="number" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} min={0} /></FormControl>
                    <FormDescription>Proxima NF-e sera este + 1</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="nfceUltimoNumero" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ultimo Numero NFC-e</FormLabel>
                    <FormControl><Input type="number" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} min={0} /></FormControl>
                    <FormDescription>Proxima NFC-e sera este + 1</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="nfceCscId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CSC ID (NFC-e)</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} placeholder="ID do CSC" /></FormControl>
                    <FormDescription>Codigo de Seguranca do Contribuinte</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="naturezaOperacao" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Natureza da Operacao</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} placeholder="Ex: VENDA DE MERCADORIA" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          {/* Tributacao */}
          <Card>
            <CardHeader><CardTitle>Tributacao Padrao</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <FormField control={form.control} name="cfopDentroEstado" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CFOP Dentro do Estado</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} placeholder="5102" maxLength={4} /></FormControl>
                    <FormDescription>Venda dentro do estado</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="cfopForaEstado" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CFOP Fora do Estado</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} placeholder="6102" maxLength={4} /></FormControl>
                    <FormDescription>Venda fora do estado</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="csosnPadrao" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CSOSN Padrao</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} placeholder="102" maxLength={3} /></FormControl>
                    <FormDescription>Para Simples Nacional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="ncmPadrao" render={({ field }) => (
                  <FormItem>
                    <FormLabel>NCM Padrao</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} placeholder="85171290" maxLength={8} /></FormControl>
                    <FormDescription>Celulares: 85171290</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          {/* Options */}
          <Card>
            <CardHeader><CardTitle>Opcoes</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="emitirNfAutomatico" render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormControl><Switch checked={field.value ?? false} onCheckedChange={field.onChange} /></FormControl>
                  <FormLabel className="!mt-0">Emitir documento fiscal automaticamente ao finalizar venda</FormLabel>
                </FormItem>
              )} />
              <FormField control={form.control} name="habilitado" render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormControl><Switch checked={field.value ?? false} onCheckedChange={field.onChange} /></FormControl>
                  <FormLabel className="!mt-0 font-semibold">Habilitar emissao de documentos fiscais</FormLabel>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <FormActions isLoading={updateMutation.isPending} submitLabel="Salvar Configuracoes" />
        </form>
      </Form>
    </div>
  );
}
