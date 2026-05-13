import { PageHeader } from "@/components/domain/page-header";
import { CommissionReport } from "./_components/commission-report";

export const metadata = {
  title: "Relatorio de Comissoes | Arena Tech",
};

export default function CommissionReportPage() {
  return (
    <div>
      <PageHeader title="Relatorio de Comissoes" subtitle="Relatorio mensal por colaborador" />
      <CommissionReport />
    </div>
  );
}
