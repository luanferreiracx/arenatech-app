"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { LoadingState } from "@/components/domain/loading-state";
import { ProductForm } from "../../../_components/product-form";

interface Props {
  id: string;
}

export function ProductEditClient({ id }: Props) {
  const trpc = useTRPC();
  const { data: product, isLoading } = useQuery(
    trpc.stock.getProduct.queryOptions({ id }),
  );

  if (isLoading) return <LoadingState variant="form" />;
  if (!product) return <p className="text-muted-foreground">Produto não encontrado.</p>;

  return (
    <ProductForm
      mode="edit"
      defaultValues={{
        id: product.id,
        sku: product.sku ?? undefined,
        barcode: product.barcode ?? undefined,
        name: product.name,
        description: product.description ?? undefined,
        costPrice: Number(product.costPrice),
        salePrice: Number(product.salePrice),
        currentStock: product.currentStock,
        minStock: product.minStock,
        unit: product.unit,
        active: product.active,
      }}
    />
  );
}
