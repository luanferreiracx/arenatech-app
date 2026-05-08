import { PageHeader } from "@/components/domain/page-header";
import { CashFlowClient } from "./_components/cash-flow-client";

export default function CashFlowPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Fluxo de Caixa"
        subtitle="Visão de receitas e despesas por período"
      />
      <CashFlowClient />
    </div>
  );
}
