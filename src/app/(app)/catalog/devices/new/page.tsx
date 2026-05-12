import { PageHeader } from "@/components/domain/page-header";
import { DeviceForm } from "../_components/device-form";

export const metadata = {
  title: "Novo Aparelho | Arena Tech",
};

export default function NewDevicePage() {
  return (
    <div>
      <PageHeader title="Novo Aparelho" subtitle="Cadastre um novo aparelho" />
      <DeviceForm />
    </div>
  );
}
