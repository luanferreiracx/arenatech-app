"use client";

import { use } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/domain/page-header";
import { CustomerForm } from "../../_components/customer-form";
import { Skeleton } from "@/components/ui/skeleton";
import type { CreateCustomerInput } from "@/lib/validators/customer";

export default function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const trpc = useTRPC();
  const { data: customer, isLoading } = useQuery(
    trpc.customer.byId.queryOptions({ id }),
  );

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!customer) {
    return <div className="p-6">Cliente não encontrado.</div>;
  }

  const defaultValues: Partial<CreateCustomerInput> = {
    type: customer.type,
    name: customer.name,
    cpf: customer.cpf ?? undefined,
    cnpj: customer.cnpj ?? undefined,
    tradeName: customer.tradeName ?? undefined,
    birthDate: customer.birthDate ? new Date(customer.birthDate).toISOString().split("T")[0] : undefined,
    phone: customer.phone,
    phoneSecondary: customer.phoneSecondary ?? undefined,
    email: customer.email ?? undefined,
    zipCode: customer.zipCode ?? undefined,
    street: customer.street ?? undefined,
    streetNumber: customer.streetNumber ?? undefined,
    complement: customer.complement ?? undefined,
    neighborhood: customer.neighborhood ?? undefined,
    city: customer.city ?? undefined,
    state: customer.state ?? undefined,
    notes: customer.notes ?? undefined,
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Editar cliente" />
      <CustomerForm mode="edit" customerId={id} defaultValues={defaultValues} />
    </div>
  );
}
