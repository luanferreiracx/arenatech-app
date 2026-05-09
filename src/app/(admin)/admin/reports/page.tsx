import { PageHeader } from "@/components/domain/page-header";
import { AdminReports } from "./_components/admin-reports";

export default function ReportsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Relatorios"
        subtitle="Relatorios cross-tenant: OS, vendas e receita por tenant"
      />
      <AdminReports />
    </div>
  );
}
