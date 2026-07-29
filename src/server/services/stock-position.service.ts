import type { Prisma } from "@prisma/client";
import { resolveCurrentStockByProduct } from "@/server/services/stock-item.service";

/**
 * Saldo de estoque para os relatórios de Posição e Estoque Mínimo.
 *
 * Existe para acabar com a duplicação que gerou o EST-1: o procedure
 * `stock.reportPosicao` resolvia o saldo pelos três regimes
 * (`resolveCurrentStockByProduct`), e a rota que gera o **PDF** dos mesmos
 * relatórios lia `product.currentStock` cru. Para produto serializado e produto
 * com variações esse campo não é a fonte da verdade — em produção o PDF sumia
 * com 34 aparelhos e 596 unidades.
 *
 * Quem precisar dos mesmos números agora chama daqui.
 */
export interface StockPositionRow {
  id: string;
  name: string;
  sku: string | null;
  categoryName: string | null;
  /** Saldo pelo regime correto do produto. */
  currentStock: number;
  minStock: number;
  costPrice: Prisma.Decimal;
  salePrice: Prisma.Decimal;
  unit: string | null;
}

export async function loadStockPositionRows(
  tx: Prisma.TransactionClient,
  options: { categoryId?: string } = {},
): Promise<StockPositionRow[]> {
  const products = await tx.product.findMany({
    where: {
      deletedAt: null,
      active: true,
      ...(options.categoryId ? { categoryId: options.categoryId } : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      sku: true,
      currentStock: true,
      minStock: true,
      costPrice: true,
      salePrice: true,
      unit: true,
      isSerialized: true,
      hasVariations: true,
      category: { select: { name: true } },
    },
  });

  const stockByProduct = await resolveCurrentStockByProduct(tx, products);

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    categoryName: p.category?.name ?? null,
    currentStock: stockByProduct.get(p.id) ?? 0,
    minStock: p.minStock,
    costPrice: p.costPrice,
    salePrice: p.salePrice,
    unit: p.unit,
  }));
}

/**
 * Produtos abaixo do mínimo, pelo saldo real.
 *
 * O filtro é o ponto mais sensível do EST-1: filtrar por `currentStock` cru fazia
 * produto CHEIO aparecer como em falta — o relatório mandava comprar o que já
 * estava na prateleira.
 */
export async function loadLowStockRows(
  tx: Prisma.TransactionClient,
): Promise<StockPositionRow[]> {
  const rows = await loadStockPositionRows(tx);
  return rows.filter((r) => r.minStock > 0 && r.currentStock < r.minStock);
}
