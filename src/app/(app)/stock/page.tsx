import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { ProductsTable } from "./_components/products-table";

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
          <Button asChild>
            <Link href="/stock/new">
              <Plus className="mr-2 h-4 w-4" />
              Novo Produto
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<LoadingState variant="table" />}>
        <ProductsTable />
      </Suspense>
    </div>
  );
}
