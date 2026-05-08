import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { SalesHistoryTable } from "../_components/sales-history-table";

export default function SalesHistoryPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Historico de Vendas"
        subtitle="Todas as vendas realizadas"
        actions={
          <Button size="sm" asChild>
            <Link href="/pdv">Nova Venda</Link>
          </Button>
        }
      />
      <SalesHistoryTable />
    </div>
  );
}
