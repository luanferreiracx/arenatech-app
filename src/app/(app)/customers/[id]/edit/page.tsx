"use client";

import { use } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/domain/page-header";
import { CustomerForm } from "../../_components/customer-form";
import { Skeleton } from "@/components/ui/skeleton";
import type { CreateCustomerInput, AddressData } from "@/lib/validators/customer";

function EditPageFallback() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-[600px] w-full max-w-3xl" />
    </div>
  );
}

export default function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const trpc = useTRPC();

  const { data: customer, isLoading } = useQuery(
    trpc.customer.byId.queryOptions({ id }),
  );

  if (isLoading || !customer) {
    return <EditPageFallback />;
  }

  const address = customer.address as AddressData | null;

  const defaultValues: CreateCustomerInput & { id: string } = {
    id: customer.id,
    type: customer.type,
    name: customer.name,
    cpf: customer.cpf ?? "",
    cnpj: customer.cnpj ?? "",
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    phone2: customer.phone2 ?? "",
    birthDate: customer.birthDate
      ? new Date(customer.birthDate).toISOString()
      : "",
    address: {
      cep: address?.cep ?? "",
      logradouro: address?.logradouro ?? "",
      numero: address?.numero ?? "",
      complemento: address?.complemento ?? "",
      bairro: address?.bairro ?? "",
      cidade: address?.cidade ?? "",
      uf: address?.uf ?? "",
    },
    notes: customer.notes ?? "",
    consentLgpd: customer.consentAt !== null,
  };

  return (
    <div>
      <PageHeader
        title="Editar Cliente"
        subtitle={customer.name}
      />
      <div className="max-w-3xl">
        <CustomerForm defaultValues={defaultValues} isEdit />
      </div>
    </div>
  );
}
