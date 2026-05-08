import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CommissionReport } from "./_components/commission-report";

export default function CommissionReportPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Relatório de Comissões"
        subtitle="Resumo mensal de comissões por colaborador"
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link href="/commissions">Voltar para Comissões</Link>
          </Button>
        }
      />
      <CommissionReport />
    </div>
  );
}
