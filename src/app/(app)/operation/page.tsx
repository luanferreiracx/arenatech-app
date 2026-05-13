import { PageHeader } from "@/components/domain/page-header";
import { OperationDashboard } from "./_components/operation-dashboard";

export const metadata = {
  title: "Operacao | Arena Tech",
};

export default function OperationPage() {
  return (
    <div>
      <PageHeader title="Operacao" subtitle="Entregadores, laboratorios externos e prestadores" />
      <OperationDashboard />
    </div>
  );
}
