import { PageHeader } from "@/components/domain/page-header";
import { ServiceOrderEditClient } from "./_components/service-order-edit-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ServiceOrderEditPage({ params }: Props) {
  const { id } = await params;
  return (
    <div>
      <PageHeader title="Editar OS" subtitle="Altere os dados da ordem de serviço" />
      <ServiceOrderEditClient id={id} />
    </div>
  );
}
