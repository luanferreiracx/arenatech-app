import { Suspense } from "react";
import Link from "next/link";
import { Plus, BarChart3, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { ProductsTable } from "./_components/products-table";
import { StockDashboardCards } from "./_components/stock-dashboard-cards";

export const metadata = {
  title: "Estoque | Arena Tech",
};

export default function StockPage() {
  return (
    <div>
      <PageHeader
        title="Estoque"
        subtitle="Gerencie produtos e controle de estoque"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/stock/reports">
                <BarChart3 className="mr-2 h-4 w-4" />
                Relatorios
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/stock/import">
                <Download className="mr-2 h-4 w-4" />
                Importar CSV
              </Link>
            </Button>
            <Button asChild>
              <Link href="/stock/new">
                <Plus className="mr-2 h-4 w-4" />
                Novo Produto
              </Link>
            </Button>
          </div>
        }
      />
      <Suspense fallback={<LoadingState variant="card" />}>
        <StockDashboardCards />
      </Suspense>
      <Suspense fallback={<LoadingState variant="table" />}>
        <ProductsTable />
      </Suspense>
    </div>
  );
}
