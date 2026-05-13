"use client";

import { Search } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/domain/empty-state";
import { StatusBadge } from "@/components/domain/status-badge";

export function ProviderDetail({ providerId }: { providerId: string }) {
  const trpc = useTRPC();

  const providersQuery = useQuery(
    trpc.operation.listServiceProviders.queryOptions({}),
  );

  const provider = providersQuery.data?.find((p) => p.id === providerId);

  if (providersQuery.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!provider) {
    return <EmptyState title="Prestador nao encontrado" icon={Search} />;
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="font-semibold mb-4">Dados do Prestador</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <span className="text-xs text-muted-foreground">Nome</span>
            <p className="font-medium">{provider.name}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Tipo</span>
            <p className="font-medium">{provider.type}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">CPF/CNPJ</span>
            <p className="font-medium">{provider.cpfCnpj ?? "—"}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Telefone</span>
            <p className="font-medium">{provider.phone ?? "—"}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Email</span>
            <p className="font-medium">{provider.email ?? "—"}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Taxa Comissao</span>
            <p className="font-medium">{provider.commissionRate ? `${provider.commissionRate}%` : "—"}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Status</span>
            <StatusBadge variant={provider.active ? "success" : "default"}>
              {provider.active ? "Ativo" : "Inativo"}
            </StatusBadge>
          </div>
        </div>
        {provider.notes && (
          <div className="mt-4">
            <span className="text-xs text-muted-foreground">Observacoes</span>
            <p className="text-sm">{provider.notes}</p>
          </div>
        )}
      </Card>
    </div>
  );
}
