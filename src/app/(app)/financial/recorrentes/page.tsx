import { PageHeader } from "@/components/domain/page-header";
import { RecurringExpensesManager } from "./_components/recurring-expenses-manager";

export default function RecurringExpensesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Contas Recorrentes"
        subtitle="Contas fixas (aluguel, salário, internet) geradas automaticamente todo mês"
      />
      <RecurringExpensesManager />
    </div>
  );
}
