import { PageHeader } from "@/components/domain/page-header";
import { DeliveryPersonsTable } from "./_components/delivery-persons-table";

export default function DeliveryPersonsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Entregadores"
        subtitle="Gerencie os entregadores da loja"
      />
      <DeliveryPersonsTable />
    </div>
  );
}
