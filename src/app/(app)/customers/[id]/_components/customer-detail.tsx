"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Pencil, Trash2, RotateCcw } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/domain/page-header";
import { StatusBadge } from "@/components/domain/status-badge";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import { CUSTOMER_TYPE_LABELS } from "@/lib/validators/customer";

function formatCpf(cpf: string | null): string {
  if (!cpf || cpf.length !== 11) return cpf ?? "—";
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

function formatCnpj(cnpj: string | null): string {
  if (!cnpj || cnpj.length !== 14) return cnpj ?? "—";
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

function formatPhone(phone: string | null): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return phone;
}

export function CustomerDetail({ customerId }: { customerId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: customer, isLoading } = useQuery(
    trpc.customer.byId.queryOptions({ id: customerId }),
  );

  const deleteMutation = useMutation(
    trpc.customer.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Cliente excluído com sucesso");
        void queryClient.invalidateQueries({ queryKey: trpc.customer.list.queryKey() });
        router.push("/customers");
      },
      onError: (error: { message: string }) => toast.error(error.message),
    }),
  );

  const restoreMutation = useMutation(
    trpc.customer.restore.mutationOptions({
      onSuccess: () => {
        toast.success("Cliente restaurado com sucesso");
        void queryClient.invalidateQueries({ queryKey: trpc.customer.byId.queryKey({ id: customerId }) });
        void queryClient.invalidateQueries({ queryKey: trpc.customer.list.queryKey() });
      },
      onError: (error: { message: string }) => toast.error(error.message),
    }),
  );

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!customer) {
    return <div className="p-6">Cliente não encontrado.</div>;
  }

  const isDeleted = !!customer.deletedAt;
  const document = customer.type === "PJ"
    ? formatCnpj(customer.cnpj)
    : formatCpf(customer.cpf);

  const address = [
    customer.street,
    customer.streetNumber ? `nº ${customer.streetNumber}` : null,
    customer.complement,
    customer.neighborhood,
    customer.city,
    customer.state,
  ].filter(Boolean).join(", ");

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={customer.name}
        actions={
          <div className="flex gap-2">
            {isDeleted ? (
              <Button
                variant="outline"
                onClick={() => restoreMutation.mutate({ id: customerId })}
                disabled={restoreMutation.isPending}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Restaurar
              </Button>
            ) : (
              <>
                <Button variant="outline" asChild>
                  <Link href={`/customers/${customerId}/edit`}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Editar
                  </Link>
                </Button>
                <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir
                </Button>
                <ConfirmDialog
                  open={deleteOpen}
                  onOpenChange={setDeleteOpen}
                  title="Excluir cliente"
                  description={`Deseja desativar o cliente ${customer.name}?`}
                  onConfirm={() => deleteMutation.mutate({ id: customerId })}
                  variant="destructive"
                />
              </>
            )}
          </div>
        }
      />

      {isDeleted && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          Cliente excluído em {format(new Date(customer.deletedAt!), "dd/MM/yyyy HH:mm", { locale: ptBR })}
        </div>
      )}

      {/* Dados */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dados pessoais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tipo</span>
              <StatusBadge variant="default">{CUSTOMER_TYPE_LABELS[customer.type] ?? customer.type}</StatusBadge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{customer.type === "PJ" ? "CNPJ" : "CPF"}</span>
              <span className="font-mono">{document}</span>
            </div>
            {customer.type === "PJ" && customer.tradeName && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nome fantasia</span>
                <span>{customer.tradeName}</span>
              </div>
            )}
            {customer.type === "PF" && customer.birthDate && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Data de nascimento</span>
                <span>{format(new Date(customer.birthDate), "dd/MM/yyyy")}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">WhatsApp</span>
              <span>{formatPhone(customer.phone)}</span>
            </div>
            {customer.phoneSecondary && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tel. alternativo</span>
                <span>{formatPhone(customer.phoneSecondary)}</span>
              </div>
            )}
            {customer.email && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">E-mail</span>
                <span>{customer.email}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Endereço</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {customer.zipCode && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">CEP</span>
                <span>{customer.zipCode}</span>
              </div>
            )}
            {address && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Endereço</span>
                <span className="text-right">{address}</span>
              </div>
            )}
            {!address && !customer.zipCode && (
              <p className="text-muted-foreground">Nenhum endereço cadastrado</p>
            )}
            {customer.notes && (
              <>
                <hr />
                <div>
                  <span className="text-muted-foreground">Observações</span>
                  <p className="mt-1 whitespace-pre-wrap">{customer.notes}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="os">
        <TabsList>
          <TabsTrigger value="os">OS do cliente ({customer.serviceOrderCount})</TabsTrigger>
          <TabsTrigger value="cashback">Cashback</TabsTrigger>
        </TabsList>
        <TabsContent value="os">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                {customer.serviceOrderCount > 0
                  ? `${customer.serviceOrderCount} ordem(s) de serviço vinculada(s).`
                  : "Nenhuma ordem de serviço vinculada."}
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="cashback">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                Saldo de cashback: R$ 0,00 (módulo Recompensas não implementado)
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
