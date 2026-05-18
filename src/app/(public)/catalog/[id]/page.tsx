import { Suspense } from "react"
import Link from "next/link"
import { ArrowLeft, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { withAdmin } from "@/server/db"

export const metadata = {
  title: "Produto | Arena Tech",
}

async function getProduct(id: string) {
  const tenantId = process.env.DEFAULT_TENANT_ID
  if (!tenantId) return null

  return withAdmin(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id, tenantId, active: true, deletedAt: null },
      include: {
        category: { select: { name: true } },
        photos: { orderBy: { isPrimary: "desc" } },
      },
    })
    return product
  })
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const product = await getProduct(id)

  if (!product) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Package className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
          <h1 className="text-2xl font-bold mb-2">Produto nao encontrado</h1>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/catalog">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar ao catalogo
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  const salePrice = Number(product.salePrice ?? 0)
  const promotionalPrice = product.promotionalPrice ? Number(product.promotionalPrice) : null
  const currentPrice = promotionalPrice ?? salePrice
  const inStock = product.isSerialized ? true : product.currentStock > 0

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Button asChild variant="ghost" className="mb-6">
          <Link href="/catalog">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar ao catalogo
          </Link>
        </Button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Images */}
          <div className="space-y-4">
            <div className="aspect-square bg-muted rounded-lg flex items-center justify-center overflow-hidden">
              {product.photos.length > 0 ? (
                <img
                  src={product.photos[0]!.url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Package className="h-24 w-24 text-muted-foreground/30" />
              )}
            </div>
            {product.photos.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {product.photos.slice(1, 5).map((photo) => (
                  <div key={photo.id} className="aspect-square bg-muted rounded overflow-hidden">
                    <img src={photo.url} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div>
            {product.category && (
              <span className="text-sm text-muted-foreground">
                {product.category.name}
              </span>
            )}
            <h1 className="text-2xl font-bold mt-1 mb-4">{product.name}</h1>

            {product.description && (
              <p className="text-muted-foreground mb-6">{product.description}</p>
            )}

            <div className="mb-6">
              {promotionalPrice ? (
                <div className="flex items-baseline gap-3">
                  <span className="text-sm text-muted-foreground line-through">
                    {formatCurrency(salePrice)}
                  </span>
                  <span className="text-3xl font-bold text-primary">
                    {formatCurrency(promotionalPrice)}
                  </span>
                </div>
              ) : (
                <span className="text-3xl font-bold text-primary">
                  {formatCurrency(salePrice)}
                </span>
              )}
            </div>

            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
              inStock
                ? "bg-green-500/10 text-green-600"
                : "bg-red-500/10 text-red-600"
            }`}>
              {inStock ? "Em estoque" : "Indisponivel"}
            </div>

            {product.sku && (
              <div className="mt-6 text-sm text-muted-foreground">
                <span className="font-medium">SKU:</span> {product.sku}
              </div>
            )}
            {product.brand && (
              <div className="text-sm text-muted-foreground">
                <span className="font-medium">Marca:</span> {product.brand}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
