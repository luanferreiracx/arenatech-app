import { PageHeader } from "@/components/domain/page-header";
import { PlansList } from "./_components/plans-list";

export const metadata = {
  title: "Planos | Arena Tech Admin",
};

export default function PlansPage() {
  return (
    <div>
      <PageHeader title="Planos" subtitle="Gerencie os planos disponíveis da plataforma" />
      <PlansList />
    </div>
  );
}
