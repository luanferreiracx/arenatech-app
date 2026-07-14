"use client";

import { use } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/domain/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const trpc = useTRPC();
  const query = useQuery(trpc.stock.getSupplier.queryOptions({ id }));

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const supplier = query.data;
  if (!supplier) return <p className="text-muted-foreground">Fornecedor nao encontrado</p>;

  const address = { street: supplier.street, number: supplier.streetNumber, complement: supplier.complement, neighborhood: supplier.neighborhood, city: supplier.city, state: supplier.state, zipCode: supplier.zipCode };

  return (
    <div>
      <PageHeader
        title={supplier.tradeName || supplier.name}
        subtitle={(supplier.cpf || supplier.cnpj) || (supplier.type === "PF" ? "Pessoa Fisica" : "Pessoa Juridica")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href={`/stock/suppliers/${id}/edit`}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/stock/suppliers">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados do Fornecedor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Tipo</span>
              <span>{supplier.type === "PF" ? "Pessoa Fisica" : "Pessoa Juridica"}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">CPF/CNPJ</span>
              <span>{supplier.cpf || supplier.cnpj || "-"}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Razao Social</span>
              <span>{supplier.name}</span>
            </div>
            {supplier.tradeName && (
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Nome Fantasia</span>
                <span>{supplier.tradeName}</span>
              </div>
            )}
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Telefone</span>
              <span>{supplier.phone || "-"}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Email</span>
              <span>{supplier.email || "-"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <StatusBadge variant={supplier.active ? "success" : "default"}>
                {supplier.active ? "Ativo" : "Inativo"}
              </StatusBadge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Endereco</CardTitle>
          </CardHeader>
          <CardContent>
            {address && (address.street || address.city) ? (
              <div className="space-y-1">
                <p>
                  {address.street}
                  {address.number ? `, ${address.number}` : ""}
                  {address.complement ? ` - ${address.complement}` : ""}
                </p>
                <p>{address.neighborhood}</p>
                <p>
                  {address.city}
                  {address.state ? `/${address.state}` : ""}
                </p>
                {address.zipCode && (
                  <p className="text-muted-foreground text-sm">CEP: {address.zipCode}</p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">Endereco nao informado</p>
            )}
          </CardContent>
        </Card>
      </div>

      {supplier.notes && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Observacoes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{supplier.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
