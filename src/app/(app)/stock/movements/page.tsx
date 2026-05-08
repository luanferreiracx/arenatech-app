import { PageHeader } from "@/components/domain/page-header";
import { MovementsTable } from "./_components/movements-table";

export default function StockMovementsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Movimentações de Estoque"
        subtitle="Histórico geral de entradas, saídas e ajustes"
      />
      <MovementsTable />
    </div>
  );
}
