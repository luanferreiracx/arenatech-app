import { NextRequest, NextResponse } from "next/server"
import { withAdmin } from "@/server/db"
import { logger } from "@/lib/logger"

/**
 * GET /api/catalog/public
 *
 * Public product catalog API — no auth required.
 * Faithful to Laravel CatalogoController::index().
 * Returns active products with stock, sorted by name.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get("search") ?? ""
    const category = searchParams.get("category") ?? ""
    const sort = searchParams.get("sort") ?? "name"
    const tenantSlug = searchParams.get("tenant") ?? process.env.DEFAULT_TENANT_SLUG ?? ""

    // For public catalog, use the default tenant or specified tenant
    const tenantId = process.env.DEFAULT_TENANT_ID

    if (!tenantId) {
      return NextResponse.json({ products: [], total: 0 })
    }

    const products = await withAdmin(async (tx) => {
      const where: Record<string, unknown> = {
        tenantId,
        active: true,
        deletedAt: null,
        isSerialized: false,
        currentStock: { gt: 0 },
      }

      if (search.trim()) {
        const term = search.trim()
        where.OR = [
          { name: { contains: term, mode: "insensitive" } },
          { sku: { contains: term, mode: "insensitive" } },
          { barcode: { contains: term, mode: "insensitive" } },
        ]
      }

      if (category) {
        where.categoryId = category
      }

      // Determine sort
      let orderBy: Record<string, string> = { name: "asc" }
      if (sort === "preco_asc") orderBy = { salePrice: "asc" }
      else if (sort === "preco_desc") orderBy = { salePrice: "desc" }
      else if (sort === "recentes") orderBy = { createdAt: "desc" }

      const items = await tx.product.findMany({
        where,
        select: {
          id: true,
          name: true,
          sku: true,
          salePrice: true,
          promotionalPrice: true,
          currentStock: true,
          category: { select: { name: true } },
          photos: {
            where: { isPrimary: true },
            take: 1,
            select: { url: true, thumbUrl: true, mediumUrl: true },
          },
        },
        orderBy,
        take: 48,
      })

      return items.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        salePrice: Math.round(Number(p.salePrice ?? 0) * 100),
        promotionalPrice: p.promotionalPrice ? Math.round(Number(p.promotionalPrice) * 100) : null,
        imageUrl: p.photos[0]?.thumbUrl ?? p.photos[0]?.mediumUrl ?? p.photos[0]?.url ?? null,
        categoryName: p.category?.name ?? null,
        inStock: p.currentStock > 0,
      }))
    })

    return NextResponse.json({ products, total: products.length })
  } catch (err) {
    logger.error("Public catalog error:", { err: String(err) })
    return NextResponse.json({ products: [], total: 0, error: "Internal error" }, { status: 500 })
  }
}
