import { PageHeader } from "@/components/domain/page-header";
import { LabOrdersTable } from "./_components/lab-orders-table";

export default function LabOrdersPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Envios para Laboratório"
        subtitle="Acompanhe os envios de equipamentos para laboratórios externos"
      />
      <LabOrdersTable />
    </div>
  );
}
