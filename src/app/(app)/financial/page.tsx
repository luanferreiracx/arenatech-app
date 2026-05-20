import { PageHeader } from "@/components/domain/page-header";
import Link from "next/link";
import { Plus, TrendingUp, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FinancialDashboard } from "./_components/financial-dashboard";

export const metadata = {
  title: "Financeiro | Arena Tech",
};

export default function FinancialPage() {
  return (
    <div>
      <PageHeader
        title="Financeiro"
        subtitle="Gerencie contas a pagar e a receber"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <a href="/api/financial/export?type=transactions">
                <Download className="mr-2 h-4 w-4" />
                Exportar CSV
              </a>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/financial/cash-flow">
                <TrendingUp className="mr-2 h-4 w-4" />
                Fluxo de Caixa
              </Link>
            </Button>
            <Button asChild>
              <Link href="/financial/new">
                <Plus className="mr-2 h-4 w-4" />
                Nova Transacao
              </Link>
            </Button>
          </div>
        }
      />
      <FinancialDashboard />
    </div>
  );
}
