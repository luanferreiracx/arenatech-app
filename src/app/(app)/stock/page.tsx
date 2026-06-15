import { Suspense } from "react";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { ProductsTable } from "./_components/products-table";
import { StockDashboardCards } from "./_components/stock-dashboard-cards";
import { StockPageActions } from "./_components/stock-page-actions";

export const metadata = {
  title: "Estoque | Arena Tech",
};

export default function StockPage() {
  return (
    <div>
      <PageHeader
        title="Estoque"
        subtitle="Gerencie produtos e controle de estoque"
        actions={<StockPageActions />}
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
