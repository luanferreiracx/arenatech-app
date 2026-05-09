import { PageHeader } from "@/components/domain/page-header";
import { TenantsTable } from "./_components/tenants-table";

export default function TenantsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Tenants"
        subtitle="Gerencie as lojas cadastradas na plataforma"
      />
      <TenantsTable />
    </div>
  );
}
