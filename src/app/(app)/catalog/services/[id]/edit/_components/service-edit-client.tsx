"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { LoadingState } from "@/components/domain/loading-state";
import { ServiceForm } from "../../../_components/service-form";

interface Props {
  id: string;
}

export function ServiceEditClient({ id }: Props) {
  const trpc = useTRPC();
  const { data: service, isLoading } = useQuery(
    trpc.catalog.getService.queryOptions({ id }),
  );

  if (isLoading) return <LoadingState variant="form" />;
  if (!service) return <p className="text-muted-foreground">Serviço não encontrado.</p>;

  return (
    <ServiceForm
      mode="edit"
      defaultValues={{
        id: service.id,
        name: service.name,
        description: service.description ?? undefined,
        basePrice: Number(service.basePrice),
        active: service.active,
      }}
    />
  );
}
