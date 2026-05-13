import { PageHeader } from "@/components/domain/page-header";
import { PreRegistrationsTable } from "./_components/pre-registrations-table";

export const metadata = {
  title: "Pre-cadastros | Arena Tech Admin",
};

export default function PreRegistrationsPage() {
  return (
    <div>
      <PageHeader title="Pre-cadastros" subtitle="Gerencie solicitacoes de novas lojas" />
      <PreRegistrationsTable />
    </div>
  );
}
