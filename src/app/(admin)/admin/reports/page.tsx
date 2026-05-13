import { PageHeader } from "@/components/domain/page-header";
import { AdminReports } from "./_components/admin-reports";

export const metadata = {
  title: "Relatorios | Arena Tech Admin",
};

export default function ReportsPage() {
  return (
    <div>
      <PageHeader title="Relatorios" subtitle="Visao geral cross-tenant" />
      <AdminReports />
    </div>
  );
}
