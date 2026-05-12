"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { LoadingState } from "@/components/domain/loading-state";
import { CustomerForm } from "../../../_components/customer-form";

interface Props {
  id: string;
}

export function CustomerEditClient({ id }: Props) {
  const trpc = useTRPC();
  const { data: customer, isLoading } = useQuery(
    trpc.customers.byId.queryOptions({ id }),
  );

  if (isLoading) return <LoadingState variant="form" />;
  if (!customer) return <p className="text-muted-foreground">Cliente não encontrado.</p>;

  const address = customer.address as {
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    zip?: string;
  } | null;

  return (
    <CustomerForm
      mode="edit"
      defaultValues={{
        id: customer.id,
        type: customer.type,
        name: customer.name,
        cpf: customer.cpf ?? undefined,
        cnpj: customer.cnpj ?? undefined,
        email: customer.email ?? undefined,
        phone: customer.phone ?? undefined,
        phone2: customer.phone2 ?? undefined,
        birthDate: customer.birthDate ? new Date(customer.birthDate) : undefined,
        address: address ?? undefined,
        notes: customer.notes ?? undefined,
        consentAt: customer.consentAt ?? undefined,
      }}
    />
  );
}
