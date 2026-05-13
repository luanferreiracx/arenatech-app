import { PageHeader } from "@/components/domain/page-header";
import { DeliveryPersonsTab } from "@/app/(app)/operation/_components/delivery-persons-tab";

export const metadata = {
  title: "Entregadores | Arena Tech",
};

export default function DeliveryPersonsPage() {
  return (
    <div>
      <PageHeader title="Entregadores" subtitle="Gerencie os entregadores da loja" />
      <DeliveryPersonsTab />
    </div>
  );
}
