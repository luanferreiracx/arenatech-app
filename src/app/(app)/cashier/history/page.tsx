import { PageHeader } from "@/components/domain/page-header";
import { CashHistoryTable } from "./_components/cash-history-table";

export default function CashHistoryPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Histórico de Caixas"
        subtitle="Caixas fechados anteriormente"
      />
      <CashHistoryTable />
    </div>
  );
}
