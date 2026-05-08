import { PageHeader } from "@/components/domain/page-header";
import { DeviceEditClient } from "./_components/device-edit-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditDevicePage({ params }: Props) {
  const { id } = await params;
  return (
    <div>
      <PageHeader title="Editar Aparelho" />
      <DeviceEditClient id={id} />
    </div>
  );
}
