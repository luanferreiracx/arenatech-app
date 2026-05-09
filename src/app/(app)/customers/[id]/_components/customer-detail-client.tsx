"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/domain/page-header";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { LoadingState } from "@/components/domain/loading-state";
import { DatePicker } from "@/components/inputs/date-picker";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";

interface Props {
  id: string;
}

function formatCpf(cpf: string): string {
  const d = cpf.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return cpf;
}

function formatCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "");
  if (d.length === 14)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return cnpj;
}

export function CustomerDetailClient({ id }: Props) {
  const trpc = useTRPC();
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: customer, isLoading, refetch } = useQuery(
    trpc.customers.byId.queryOptions({ id }),
  );

  const deleteMutation = useMutation(
    trpc.customers.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Cliente removido.");
        router.push("/customers");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  if (isLoading) return <LoadingState variant="card" />;
  if (!customer) return <p className="text-muted-foreground">Cliente não encontrado.</p>;

  const address = customer.address as Record<string, string> | null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={customer.name}
        subtitle={
          customer.type === "PF"
            ? customer.cpf
              ? formatCpf(customer.cpf)
              : "Pessoa Física"
            : customer.cnpj
              ? formatCnpj(customer.cnpj)
              : "Pessoa Jurídica"
        }
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href={`/customers/${id}/edit`}>
                <Pencil className="mr-1 h-4 w-4" />
                Editar
              </Link>
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Remover
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="data">
        <TabsList>
          <TabsTrigger value="data">Dados</TabsTrigger>
          <TabsTrigger value="orders">Ordens de Serviço</TabsTrigger>
          <TabsTrigger value="interests">Interesses</TabsTrigger>
        </TabsList>

        <TabsContent value="data" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Contato</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tipo</span>
                  <Badge variant="outline">{customer.type}</Badge>
                </div>
                {customer.email && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">E-mail</span>
                    <span>{customer.email}</span>
                  </div>
                )}
                {customer.phone && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Telefone</span>
                    <span>{customer.phone}</span>
                  </div>
                )}
                {customer.phone2 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Telefone 2</span>
                    <span>{customer.phone2}</span>
                  </div>
                )}
                {customer.consentAt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Consentimento LGPD</span>
                    <span className="text-success text-xs">
                      {new Date(customer.consentAt).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {address && Object.keys(address).some((k) => address[k]) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Endereço</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  {address.street && (
                    <p>
                      {address.street}
                      {address.number ? `, ${address.number}` : ""}
                      {address.complement ? ` — ${address.complement}` : ""}
                    </p>
                  )}
                  {address.neighborhood && <p>{address.neighborhood}</p>}
                  {address.city && (
                    <p>
                      {address.city}
                      {address.state ? ` — ${address.state}` : ""}
                    </p>
                  )}
                  {address.zip && <p className="font-mono">CEP: {address.zip}</p>}
                </CardContent>
              </Card>
            )}
          </div>

          {customer.notes && (
            <Card className="mt-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Observações</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-line">{customer.notes}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="orders" className="mt-4">
          <CustomerOrdersTab customerId={id} />
        </TabsContent>

        <TabsContent value="interests" className="mt-4">
          <InterestsTab customerId={id} onRefetch={() => void refetch()} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Remover cliente?"
        description="O cliente será marcado como removido mas pode ser restaurado."
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={() => deleteMutation.mutate({ id })}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

// ── Customer Orders Tab ───────────────────────────────────────────────────────

function CustomerOrdersTab({ customerId }: { customerId: string }) {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(
    trpc.serviceOrders.list.queryOptions({
      customerId,
      page: 0,
      pageSize: 50,
    }),
  );

  if (isLoading) return <LoadingState variant="card" />;

  const orders = data?.items ?? [];

  if (orders.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Nenhuma Ordem de Servico encontrada para este cliente.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-2 font-medium text-muted-foreground">Numero</th>
                <th className="pb-2 font-medium text-muted-foreground">Status</th>
                <th className="pb-2 font-medium text-muted-foreground">Data</th>
                <th className="pb-2 font-medium text-muted-foreground text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b last:border-0">
                  <td className="py-2">
                    <Link
                      href={`/service-orders/${order.id}`}
                      className="font-mono text-primary hover:underline"
                    >
                      {order.number}
                    </Link>
                  </td>
                  <td className="py-2">
                    <Badge variant="outline" className="text-xs">
                      {order.status}
                    </Badge>
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {new Date(order.entryDate).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="py-2 text-right font-mono">
                    {Number(order.totalAmount).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && data.total > 50 && (
          <div className="mt-3">
            <Button size="sm" variant="outline" asChild>
              <Link href={`/service-orders?customerId=${customerId}`}>
                Ver todas ({data.total})
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Interests Tab ─────────────────────────────────────────────────────────────

function InterestsTab({ customerId, onRefetch }: { customerId: string; onRefetch: () => void }) {
  const trpc = useTRPC();
  const [desc, setDesc] = useState("");
  const [followUpAt, setFollowUpAt] = useState<Date | undefined>();

  const { data: interests = [], refetch } = useQuery(
    trpc.customers.listInterests.queryOptions({ customerId }),
  );

  const createMutation = useMutation(
    trpc.customers.createInterest.mutationOptions({
      onSuccess: () => {
        toast.success("Interesse adicionado!");
        setDesc("");
        setFollowUpAt(undefined);
        void refetch();
        onRefetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const updateMutation = useMutation(
    trpc.customers.updateInterest.mutationOptions({
      onSuccess: () => void refetch(),
      onError: (err) => toast.error(err.message),
    }),
  );

  const deleteMutation = useMutation(
    trpc.customers.deleteInterest.mutationOptions({
      onSuccess: () => void refetch(),
      onError: (err) => toast.error(err.message),
    }),
  );

  return (
    <div className="space-y-4">
      {/* Add form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Adicionar Interesse</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Descreva o interesse ou necessidade do cliente..."
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={2}
          />
          <div className="flex items-center gap-3">
            <DatePicker
              value={followUpAt}
              onChange={setFollowUpAt}
              placeholder="Data de follow-up"
            />
            <Button
              size="sm"
              disabled={!desc.trim() || createMutation.isPending}
              onClick={() =>
                createMutation.mutate({ customerId, description: desc, followUpAt })
              }
            >
              <Plus className="mr-1 h-4 w-4" />
              Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {interests.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhum interesse registrado.</p>
      ) : (
        <div className="space-y-2">
          {interests.map((interest) => (
            <div
              key={interest.id}
              className="flex items-start gap-3 p-3 rounded-md border border-border"
            >
              <Checkbox
                checked={interest.resolved}
                onCheckedChange={(checked) =>
                  updateMutation.mutate({ id: interest.id, resolved: !!checked })
                }
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm ${interest.resolved ? "line-through text-muted-foreground" : ""}`}
                >
                  {interest.description}
                </p>
                {interest.followUpAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Follow-up: {new Date(interest.followUpAt).toLocaleDateString("pt-BR")}
                  </p>
                )}
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive hover:text-destructive h-7 w-7 shrink-0"
                onClick={() => deleteMutation.mutate({ id: interest.id })}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
