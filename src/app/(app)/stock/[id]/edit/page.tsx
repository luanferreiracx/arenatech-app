"use client";

import { use } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { ProductForm } from "../../_components/product-form";

/** Provedores de imagem que o schema aceita. A coluna é texto livre no banco. */
const IMAGE_PROVIDERS = ["cloudinary", "minio", "external"] as const;
type ImageProvider = (typeof IMAGE_PROVIDERS)[number];

/**
 * Estreita o texto do banco para o union do schema. Valor desconhecido (dado
 * legado) vira `null` em vez de quebrar o form inteiro na validação.
 */
function toImageProvider(value: string | null): ImageProvider | null {
  return IMAGE_PROVIDERS.includes(value as ImageProvider) ? (value as ImageProvider) : null;
}

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
          brandId: product.brandId ?? null,
          newBrandName: null,
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
          attributeConfigIds: product.attributeConfigs.map((cfg) => cfg.attributeId),
          // As variações precisam vir preenchidas, COM o `id` de cada uma.
          // Antes o form abria com a lista vazia e o editor de variações
          // aparecia zerado: salvar mandava `variations: []` (ou só as novas) e
          // o backend apagava as existentes — junto com o saldo delas.
          // Auditoria de estoque 2026-08-04, P0-1.
          variations: product.variations.map((variation) => ({
            id: variation.id,
            sku: variation.sku ?? "",
            barcode: variation.barcode ?? "",
            costPrice: variation.costPrice == null ? null : Math.round(Number(variation.costPrice) * 100),
            salePrice: variation.salePrice == null ? null : Math.round(Number(variation.salePrice) * 100),
            promotionalPrice:
              variation.promotionalPrice == null
                ? null
                : Math.round(Number(variation.promotionalPrice) * 100),
            minStock: variation.minStock,
            imageUrl: variation.imageUrl ?? null,
            imageProvider: toImageProvider(variation.imageProvider),
            imageProviderPublicId: variation.imageProviderPublicId ?? null,
            active: variation.active,
            attributeValueIds: variation.attributeValues.map((av) => av.attributeValueId),
          })),
        }}
      />
    </div>
  );
}
