import { PageHeader } from "@/components/domain/page-header";
import { StockReportClient } from "./_components/stock-report-client";

export default function StockReportPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Relatório de Inventário"
        subtitle="Visão geral do estoque e valores"
      />
      <StockReportClient />
    </div>
  );
}
