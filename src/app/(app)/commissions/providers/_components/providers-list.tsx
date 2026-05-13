"use client";

import { Search, Eye, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/domain/data-table";
import { EmptyState } from "@/components/domain/empty-state";
import { StatusBadge } from "@/components/domain/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";

export function ProvidersList() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const listQuery = useQuery(
    trpc.operation.listServiceProviders.queryOptions({ active: true }),
  );
  const deleteMutation = useMutation(trpc.operation.deleteServiceProvider.mutationOptions());

  const handleDelete = (id: string) => {
    if (!confirm("Tem certeza que deseja remover este prestador?")) return;
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          toast.success("Prestador removido");
          queryClient.invalidateQueries({ queryKey: trpc.operation.listServiceProviders.queryKey() });
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  if (listQuery.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  const providers = listQuery.data ?? [];

  if (providers.length === 0) {
    return (
      <EmptyState
        title="Nenhum prestador cadastrado"
        description="Cadastre prestadores de servico para gerenciar comissoes"
        icon={Search}
      />
    );
  }

  return (
    <DataTable
      data={providers}
      columns={[
        { header: "Nome", accessorKey: "name" },
        { header: "Tipo", accessorKey: "type" },
        { header: "CPF/CNPJ", accessorKey: "cpfCnpj" },
        { header: "Telefone", accessorKey: "phone" },
        {
          header: "Comissao %",
          accessorKey: "commissionRate",
          cell: ({ row }) => {
            const rate = row.original.commissionRate;
            return rate ? `${rate}%` : "—";
          },
        },
        {
          header: "Status",
          accessorKey: "active",
          cell: ({ row }) => (
            <StatusBadge variant={row.original.active ? "success" : "default"}>
              {row.original.active ? "Ativo" : "Inativo"}
            </StatusBadge>
          ),
        },
        {
          header: "Acoes",
          id: "actions",
          cell: ({ row }) => (
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/commissions/providers/${row.original.id}`}>
                  <Eye className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => handleDelete(row.original.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ),
        },
      ]}
    />
  );
}
