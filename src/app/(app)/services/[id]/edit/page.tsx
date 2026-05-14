"use client";

import { use } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { ServiceForm } from "../../_components/service-form";

export default function EditServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const trpc = useTRPC();
  const { data: service, isLoading } = useQuery(
    trpc.catalog.getService.queryOptions({ id }),
  );

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Editar Servico" />
        <LoadingState variant="form" rows={4} />
      </div>
    );
  }

  if (!service) {
    return (
      <div>
        <PageHeader title="Servico nao encontrado" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Editar Servico"
        subtitle={`${service.serviceType ?? ""} - ${service.deviceModel ?? ""}`}
      />
      <ServiceForm
        isEdit
        defaultValues={{
          id: service.id,
          serviceType: service.serviceType ?? "",
          deviceModel: service.deviceModel ?? "",
          description: service.description ?? "",
          basePrice: service.basePrice,
          estimatedTime: service.estimatedTime ?? "",
        }}
      />
    </div>
  );
}
