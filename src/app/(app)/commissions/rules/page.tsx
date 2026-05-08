import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { RulesTable } from "./_components/rules-table";

export default function CommissionRulesPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Regras de Comissão"
        subtitle="Configure as regras de cálculo de comissões"
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link href="/commissions">Voltar para Comissões</Link>
          </Button>
        }
      />
      <RulesTable />
    </div>
  );
}
