import { PageHeader } from "@/components/domain/page-header";
import { ProvidersTable } from "./_components/providers-table";

export default function ProvidersPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Prestadores de Serviço"
        subtitle="Gerencie técnicos, consultores e parceiros externos"
      />
      <ProvidersTable />
    </div>
  );
}
