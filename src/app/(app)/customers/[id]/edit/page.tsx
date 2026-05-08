import { PageHeader } from "@/components/domain/page-header";
import { CustomerEditClient } from "./_components/customer-edit-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditCustomerPage({ params }: Props) {
  const { id } = await params;
  return (
    <div>
      <PageHeader title="Editar Cliente" />
      <CustomerEditClient id={id} />
    </div>
  );
}
