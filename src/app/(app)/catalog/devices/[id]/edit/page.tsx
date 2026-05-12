"use client";

import { use } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { DeviceForm } from "../../_components/device-form";

export default function EditDevicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const trpc = useTRPC();
  const { data: device, isLoading } = useQuery(
    trpc.catalog.getDevice.queryOptions({ id }),
  );

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Editar Aparelho" />
        <LoadingState variant="form" rows={3} />
      </div>
    );
  }

  if (!device) {
    return (
      <div>
        <PageHeader title="Aparelho nao encontrado" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Editar Aparelho" subtitle={`${device.brand} ${device.model}`} />
      <DeviceForm
        isEdit
        defaultValues={{
          id: device.id,
          categoryId: device.categoryId,
          brand: device.brand,
          model: device.model,
          attributes: (device.attributes as Record<string, string> | null) ?? undefined,
        }}
      />
    </div>
  );
}
