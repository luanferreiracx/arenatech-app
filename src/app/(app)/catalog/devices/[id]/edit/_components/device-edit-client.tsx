"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { LoadingState } from "@/components/domain/loading-state";
import { DeviceForm } from "../../../_components/device-form";

interface Props {
  id: string;
}

export function DeviceEditClient({ id }: Props) {
  const trpc = useTRPC();
  const { data: device, isLoading } = useQuery(
    trpc.catalog.getDevice.queryOptions({ id }),
  );

  if (isLoading) return <LoadingState variant="form" />;
  if (!device) return <p className="text-muted-foreground">Aparelho não encontrado.</p>;

  return (
    <DeviceForm
      mode="edit"
      defaultValues={{
        id: device.id,
        brand: device.brand,
        model: device.model,
        categoryId: device.categoryId ?? undefined,
        attributes: device.attributes ? JSON.stringify(device.attributes, null, 2) : undefined,
        active: device.active,
      }}
    />
  );
}
