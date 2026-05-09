import { PageHeader } from "@/components/domain/page-header";
import { PreRegistrationsTable } from "./_components/pre-registrations-table";

export default function PreRegistrationsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Pre-cadastros"
        subtitle="Gerencie as solicitacoes de cadastro de novas lojas"
      />
      <PreRegistrationsTable />
    </div>
  );
}
