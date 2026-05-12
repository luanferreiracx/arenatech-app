"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Pencil,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Plus,
  ClipboardList,
} from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/domain/page-header";
import { StatusBadge } from "@/components/domain/status-badge";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";

interface AddressData {
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
}

function formatCpf(cpf: string): string {
  if (cpf.length !== 11) return cpf;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

function formatCnpj(cnpj: string): string {
  if (cnpj.length !== 14) return cnpj;
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

function formatPhone(phone: string): string {
  if (phone.length === 11)
    return `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`;
  if (phone.length === 10)
    return `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}`;
  return phone;
}

function InfoItem({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium">{value || "-"}</p>
    </div>
  );
}

export function CustomerDetail({ customerId }: { customerId: string }) {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [newInterest, setNewInterest] = useState("");

  const { data: customer, isLoading } = useQuery(
    trpc.customer.byId.queryOptions({ id: customerId }),
  );

  const deleteMutation = useMutation(
    trpc.customer.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Cliente excluido com sucesso");
        queryClient.invalidateQueries({ queryKey: [["customer"]] });
        router.push("/customers");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const restoreMutation = useMutation(
    trpc.customer.restore.mutationOptions({
      onSuccess: () => {
        toast.success("Cliente restaurado com sucesso");
        queryClient.invalidateQueries({ queryKey: [["customer"]] });
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const createInterestMutation = useMutation(
    trpc.customer.createInterest.mutationOptions({
      onSuccess: () => {
        toast.success("Interesse adicionado");
        setNewInterest("");
        queryClient.invalidateQueries({ queryKey: [["customer"]] });
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const resolveInterestMutation = useMutation(
    trpc.customer.updateInterest.mutationOptions({
      onSuccess: () => {
        toast.success("Interesse atualizado");
        queryClient.invalidateQueries({ queryKey: [["customer"]] });
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const deleteInterestMutation = useMutation(
    trpc.customer.deleteInterest.mutationOptions({
      onSuccess: () => {
        toast.success("Interesse removido");
        queryClient.invalidateQueries({ queryKey: [["customer"]] });
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  if (isLoading || !customer) {
    return null;
  }

  const address = customer.address as AddressData | null;
  const isDeleted = customer.deletedAt !== null;

  return (
    <div className="space-y-6">
      {/* Deleted banner */}
      {isDeleted && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Este cliente foi excluido em{" "}
            {format(new Date(customer.deletedAt!), "dd/MM/yyyy HH:mm", { locale: ptBR })}.
            <Button
              variant="link"
              className="ml-2 p-0 h-auto text-destructive"
              onClick={() => restoreMutation.mutate({ id: customerId })}
            >
              Restaurar
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <PageHeader
        title={customer.name}
        subtitle={
          <span className="flex items-center gap-2">
            <StatusBadge variant={customer.type === "PF" ? "info" : "warning"}>
              {customer.type === "PF" ? "Pessoa Fisica" : "Pessoa Juridica"}
            </StatusBadge>
            {customer.cpf && (
              <span className="text-muted-foreground">{formatCpf(customer.cpf)}</span>
            )}
            {customer.cnpj && (
              <span className="text-muted-foreground">{formatCnpj(customer.cnpj)}</span>
            )}
          </span>
        }
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`/customers/${customerId}/edit`}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </Link>
            </Button>
            {!isDeleted && (
              <Button
                variant="destructive"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </Button>
            )}
            {isDeleted && (
              <Button
                variant="outline"
                onClick={() => restoreMutation.mutate({ id: customerId })}
                disabled={restoreMutation.isPending}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Restaurar
              </Button>
            )}
          </div>
        }
      />

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="os">Ordens de Servico</TabsTrigger>
          <TabsTrigger value="interesses">Interesses</TabsTrigger>
        </TabsList>

        {/* Tab Dados */}
        <TabsContent value="dados" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Dados pessoais */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {customer.type === "PF" ? "Dados Pessoais" : "Dados da Empresa"}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <InfoItem label="Nome" value={customer.name} />
                {customer.type === "PF" && customer.cpf && (
                  <InfoItem label="CPF" value={formatCpf(customer.cpf)} />
                )}
                {customer.type === "PJ" && customer.cnpj && (
                  <InfoItem label="CNPJ" value={formatCnpj(customer.cnpj)} />
                )}
                {customer.type === "PF" && customer.birthDate && (
                  <InfoItem
                    label="Data de Nascimento"
                    value={format(new Date(customer.birthDate), "dd/MM/yyyy", { locale: ptBR })}
                  />
                )}
                <InfoItem label="Email" value={customer.email ?? "-"} />
              </CardContent>
            </Card>

            {/* Contato */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contato</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <InfoItem
                  label="Telefone/WhatsApp"
                  value={customer.phone ? formatPhone(customer.phone) : "-"}
                />
                <InfoItem
                  label="Celular Alternativo"
                  value={customer.phone2 ? formatPhone(customer.phone2) : "-"}
                />
              </CardContent>
            </Card>

            {/* Endereco */}
            {address && (address.logradouro || address.cidade) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Endereco</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  {address.cep && <InfoItem label="CEP" value={address.cep} />}
                  <InfoItem
                    label="Endereco"
                    value={[address.logradouro, address.numero ? `n ${address.numero}` : null, address.complemento].filter(Boolean).join(", ")}
                  />
                  {address.bairro && <InfoItem label="Bairro" value={address.bairro} />}
                  <InfoItem
                    label="Cidade/UF"
                    value={[address.cidade, address.uf].filter(Boolean).join(" - ")}
                  />
                </CardContent>
              </Card>
            )}

            {/* Observacoes */}
            {customer.notes && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Observacoes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {customer.notes}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Info do cadastro */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Informacoes do Cadastro</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <InfoItem
                  label="Cadastrado em"
                  value={format(new Date(customer.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                />
                <InfoItem
                  label="Ultima atualizacao"
                  value={format(new Date(customer.updatedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                />
                <InfoItem
                  label="Status"
                  value={
                    <StatusBadge variant={isDeleted ? "destructive" : "success"}>
                      {isDeleted ? "Excluido" : "Ativo"}
                    </StatusBadge>
                  }
                />
                {customer.consentAt && (
                  <InfoItem
                    label="Consentimento LGPD"
                    value={format(new Date(customer.consentAt), "dd/MM/yyyy", { locale: ptBR })}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab OS */}
        <TabsContent value="os" className="mt-4">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <ClipboardList className="mx-auto h-12 w-12 mb-4 opacity-40" />
              <p className="font-medium">Ordens de Servico</p>
              {customer.serviceOrderCount > 0 ? (
                <p className="text-sm mt-1">
                  Este cliente possui {customer.serviceOrderCount} ordem(ns) de servico.
                </p>
              ) : (
                <p className="text-sm mt-1">
                  Nenhuma ordem de servico encontrada para este cliente.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Interesses */}
        <TabsContent value="interesses" className="mt-4 space-y-4">
          {/* Add interest inline form */}
          <Card>
            <CardContent className="pt-6">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newInterest.trim()) return;
                  createInterestMutation.mutate({
                    customerId,
                    description: newInterest,
                  });
                }}
                className="flex gap-2"
              >
                <Textarea
                  placeholder="Descreva o interesse do cliente (ex: procurando iPhone 15 Pro 256GB)"
                  value={newInterest}
                  onChange={(e) => setNewInterest(e.target.value)}
                  className="min-h-[60px]"
                />
                <Button
                  type="submit"
                  disabled={createInterestMutation.isPending || !newInterest.trim()}
                  className="self-end"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Interests list */}
          {customer.interests.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <p>Nenhum interesse registrado.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {customer.interests.map((interest) => (
                <Card key={interest.id} className={interest.resolved ? "opacity-60" : ""}>
                  <CardContent className="py-4 flex items-start gap-3">
                    <Checkbox
                      checked={interest.resolved}
                      onCheckedChange={(checked) =>
                        resolveInterestMutation.mutate({
                          id: interest.id,
                          resolved: checked === true,
                        })
                      }
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${interest.resolved ? "line-through text-muted-foreground" : ""}`}>
                        {interest.description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(interest.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        {interest.followUpAt && (
                          <span className="ml-2">
                            Follow-up: {format(new Date(interest.followUpAt), "dd/MM/yyyy", { locale: ptBR })}
                          </span>
                        )}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => deleteInterestMutation.mutate({ id: interest.id })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Excluir cliente"
        description={`Tem certeza que deseja excluir o cliente "${customer.name}"? Ele nao aparecera mais na listagem padrao.`}
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={() => deleteMutation.mutate({ id: customerId })}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
