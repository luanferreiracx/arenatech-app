import { PageHeader } from "@/components/domain/page-header";
import { DevicePurchaseForm } from "./_components/device-purchase-form";

export default function NewDevicePurchasePage() {
  return (
    <div>
      <PageHeader title="Registrar Compra de Aparelho" subtitle="Registre um aparelho comprado de cliente" />
      <DevicePurchaseForm />
    </div>
  );
}
