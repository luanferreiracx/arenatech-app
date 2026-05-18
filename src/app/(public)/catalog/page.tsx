import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { CatalogList } from "./_components/catalog-list"

export const metadata = {
  title: "Catalogo | Arena Tech",
  description: "Produtos disponiveis para compra",
}

function CatalogFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-lg" />
        ))}
      </div>
    </div>
  )
}

export default function CatalogPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-2">Catalogo de Produtos</h1>
        <p className="text-muted-foreground mb-8">Confira nossos produtos disponiveis</p>
        <Suspense fallback={<CatalogFallback />}>
          <CatalogList />
        </Suspense>
      </div>
    </div>
  )
}
