import { PageHeader } from "@/components/domain/page-header";
import { TenantsTable } from "./_components/tenants-table";

export const metadata = {
  title: "Tenants | Arena Tech Admin",
};

export default function TenantsPage() {
  return (
    <div>
      <PageHeader title="Tenants" subtitle="Gerencie as lojas cadastradas na plataforma" />
      <TenantsTable />
    </div>
  );
}
