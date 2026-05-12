"use client";

import { use } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { ProductForm } from "../../_components/product-form";

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const trpc = useTRPC();
  const { data: product, isLoading } = useQuery(
    trpc.stock.getById.queryOptions({ id }),
  );

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Editar Produto" />
        <LoadingState variant="form" rows={6} />
      </div>
    );
  }

  if (!product) {
    return (
      <div>
        <PageHeader title="Produto nao encontrado" />
      </div>
    );
  }

  // Convert Decimal to centavos for MoneyInput
  const costPriceNum = typeof product.costPrice === "object" && "toNumber" in product.costPrice
    ? (product.costPrice as { toNumber: () => number }).toNumber()
    : Number(product.costPrice);

  const salePriceNum = typeof product.salePrice === "object" && "toNumber" in product.salePrice
    ? (product.salePrice as { toNumber: () => number }).toNumber()
    : Number(product.salePrice);

  return (
    <div>
      <PageHeader title="Editar Produto" subtitle={product.name} />
      <ProductForm
        isEdit
        defaultValues={{
          id: product.id,
          sku: product.sku ?? "",
          barcode: product.barcode ?? "",
          name: product.name,
          description: product.description ?? "",
          costPrice: Math.round(costPriceNum * 100),
          salePrice: Math.round(salePriceNum * 100),
          minStock: product.minStock,
          unit: product.unit,
          active: product.active,
        }}
      />
    </div>
  );
}
