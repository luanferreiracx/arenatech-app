import { PageHeader } from "@/components/domain/page-header";
import { DiagnosticEditClient } from "./_components/diagnostic-edit-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditDiagnosticTemplatePage({ params }: Props) {
  const { id } = await params;
  return (
    <div>
      <PageHeader title="Editar Template" />
      <DiagnosticEditClient id={id} />
    </div>
  );
}
