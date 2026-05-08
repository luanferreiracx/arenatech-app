import { PageHeader } from "@/components/domain/page-header";
import { DeviceForm } from "../_components/device-form";

export default function NewDevicePage() {
  return (
    <div>
      <PageHeader title="Novo Aparelho" />
      <DeviceForm mode="create" />
    </div>
  );
}
