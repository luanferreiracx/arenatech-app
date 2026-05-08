import { PageHeader } from "@/components/domain/page-header";
import { ServiceEditClient } from "./_components/service-edit-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditServicePage({ params }: Props) {
  const { id } = await params;
  return (
    <div>
      <PageHeader title="Editar Serviço" />
      <ServiceEditClient id={id} />
    </div>
  );
}
