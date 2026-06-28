"use client";

import { Search, Eye } from "lucide-react";
import Link from "next/link";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/domain/data-table";
import { EmptyState } from "@/components/domain/empty-state";
import { StatusBadge } from "@/components/domain/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PROVIDER_PROFILE_LABELS,
  PROVIDER_BOND_TYPE_LABELS,
} from "@/lib/validators/provider-commission";
import { NewProviderButton } from "./new-provider-button";

export function ProvidersList() {
  const trpc = useTRPC();

  const listQuery = useQuery(
    trpc.providerCommission.listProviders.queryOptions({ active: true }),
  );

  if (listQuery.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  const providers = listQuery.data ?? [];

  if (providers.length === 0) {
    return (
      <EmptyState
        title="Nenhum prestador cadastrado"
        description="Cadastre prestadores MEI/CLT para gerenciar comissoes com faixas progressivas"
        icon={Search}
        action={<NewProviderButton />}
      />
    );
  }

  return (
    <DataTable
      data={providers}
      columns={[
        {
          header: "Nome",
          accessorKey: "userName",
          cell: ({ row }) => (
            <div>
              <span className="font-medium">{row.original.userName}</span>
              {row.original.razaoSocial && (
                <span className="block text-xs text-muted-foreground">{row.original.razaoSocial}</span>
              )}
            </div>
          ),
        },
        {
          header: "Perfil",
          accessorKey: "profile",
          cell: ({ row }) => (
            <StatusBadge variant={row.original.profile === "TECHNICIAN" ? "warning" : "info"}>
              {PROVIDER_PROFILE_LABELS[row.original.profile] ?? row.original.profile}
            </StatusBadge>
          ),
        },
        {
          header: "Vinculo",
          accessorKey: "bondType",
          cell: ({ row }) => (
            <StatusBadge variant={row.original.bondType === "MEI" ? "success" : "info"}>
              {PROVIDER_BOND_TYPE_LABELS[row.original.bondType] ?? row.original.bondType}
            </StatusBadge>
          ),
        },
        {
          header: "CPF / CNPJ",
          id: "document",
          cell: ({ row }) => (
            <span className="text-xs text-muted-foreground">
              {row.original.cnpjMei ?? row.original.cpf ?? "—"}
            </span>
          ),
        },
        {
          header: "Contrato vigente",
          id: "contract",
          cell: ({ row }) => {
            const contract = row.original.currentContract;
            if (!contract) {
              return <span className="text-xs text-red-400">sem contrato</span>;
            }
            return (
              <span className="text-xs text-muted-foreground">
                desde {new Date(contract.startDate).toLocaleDateString("pt-BR")}
              </span>
            );
          },
        },
        {
          header: "Acoes",
          id: "actions",
          cell: ({ row }) => (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/commissions/providers/${row.original.id}`}>
                <Eye className="h-4 w-4 mr-1" />
                Abrir
              </Link>
            </Button>
          ),
        },
      ]}
    />
  );
}
