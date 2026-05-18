"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Search, Package } from "lucide-react"

/**
 * Public catalog list — displays products available for purchase.
 * Faithful to Laravel CatalogoController::index().
 * Uses direct fetch to public API (no tRPC auth needed).
 */

interface CatalogProduct {
  id: string
  name: string
  sku: string | null
  salePrice: number
  promotionalPrice: number | null
  imageUrl: string | null
  categoryName: string | null
  inStock: boolean
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

export function CatalogList() {
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const didFetch = useRef(false)

  useEffect(() => {
    if (didFetch.current) return
    didFetch.current = true
    fetch("/api/catalog/public?" + new URLSearchParams({
      ...(search ? { search } : {}),
      ...(category ? { category } : {}),
    }))
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((data: { products: CatalogProduct[] }) => {
        setProducts(data.products)
      })
      .catch(() => {
        setError("Erro ao carregar produtos")
      })
      .finally(() => {
        setLoading(false)
      })
  })

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products
    const term = search.toLowerCase()
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.sku?.toLowerCase().includes(term) ?? false)
    )
  }, [products, search])

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Carregando produtos...
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12 text-destructive">{error}</div>
    )
  }

  return (
    <div>
      {/* Search */}
      <div className="relative max-w-md mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou codigo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Products grid */}
      {filteredProducts.length === 0 ? (
        <div className="text-center py-12">
          <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">Nenhum produto encontrado</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredProducts.map((product) => (
            <Link key={product.id} href={`/catalog/${product.id}`}>
              <Card className="h-full hover:shadow-md transition-shadow cursor-pointer overflow-hidden">
                {/* Image placeholder */}
                <div className="aspect-square bg-muted flex items-center justify-center">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package className="h-12 w-12 text-muted-foreground/30" />
                  )}
                </div>
                <CardContent className="p-3">
                  <h3 className="font-medium text-sm line-clamp-2 mb-1">
                    {product.name}
                  </h3>
                  {product.categoryName && (
                    <p className="text-xs text-muted-foreground mb-2">
                      {product.categoryName}
                    </p>
                  )}
                  <div className="flex items-baseline gap-2">
                    {product.promotionalPrice ? (
                      <>
                        <span className="text-xs text-muted-foreground line-through">
                          {formatCurrency(product.salePrice)}
                        </span>
                        <span className="text-sm font-bold text-primary">
                          {formatCurrency(product.promotionalPrice)}
                        </span>
                      </>
                    ) : (
                      <span className="text-sm font-bold text-primary">
                        {formatCurrency(product.salePrice)}
                      </span>
                    )}
                  </div>
                  {!product.inStock && (
                    <span className="text-xs text-destructive mt-1 block">
                      Indisponivel
                    </span>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
