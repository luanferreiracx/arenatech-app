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

  const promotionalPriceNum = product.promotionalPrice == null
    ? null
    : typeof product.promotionalPrice === "object" && "toNumber" in product.promotionalPrice
      ? (product.promotionalPrice as { toNumber: () => number }).toNumber()
      : Number(product.promotionalPrice);

  const defaultMarginNum = product.defaultMargin == null
    ? null
    : typeof product.defaultMargin === "object" && "toNumber" in product.defaultMargin
      ? (product.defaultMargin as { toNumber: () => number }).toNumber()
      : Number(product.defaultMargin);

  const icmsDifferentialRateNum = product.icmsDifferentialRate == null
    ? null
    : typeof product.icmsDifferentialRate === "object" && "toNumber" in product.icmsDifferentialRate
      ? (product.icmsDifferentialRate as { toNumber: () => number }).toNumber()
      : Number(product.icmsDifferentialRate);

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
          brand: product.brand ?? "",
          ncm: product.ncm ?? null,
          cest: product.cest ?? null,
          isSerialized: product.isSerialized,
          isPremium: product.isPremium,
          isDevice: product.isDevice,
          hasVariations: product.hasVariations,
          icmsDifferentialRate: icmsDifferentialRateNum,
          costPrice: Math.round(costPriceNum * 100),
          salePrice: Math.round(salePriceNum * 100),
          promotionalPrice: promotionalPriceNum == null ? null : Math.round(promotionalPriceNum * 100),
          defaultMargin: defaultMarginNum,
          minStock: product.minStock,
          unit: product.unit,
          active: product.active,
          categoryId: product.categoryId,
          categoryIds: product.categories.map((item) => item.categoryId),
        }}
      />
    </div>
  );
}
