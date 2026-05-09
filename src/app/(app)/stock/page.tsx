import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ProductsTable } from "./_components/products-table";
import { createMetadata } from "@/lib/metadata";

export const metadata = createMetadata("Estoque");

export default function StockPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Estoque"
        subtitle="Gerencie os produtos e controle de estoque"
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href="/stock/movements">Movimentações</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/stock/report">Relatório</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/stock/new">Novo Produto</Link>
            </Button>
          </div>
        }
      />
      <ProductsTable />
    </div>
  );
}
