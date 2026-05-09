import { PageHeader } from "@/components/domain/page-header";
import { PlansTable } from "./_components/plans-table";

export default function PlansPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Planos"
        subtitle="Gerencie os planos da plataforma SaaS"
      />
      <PlansTable />
    </div>
  );
}
