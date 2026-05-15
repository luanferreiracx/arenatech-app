import { PageHeader } from "@/components/domain/page-header";
import { ReceivablesTable } from "./_components/receivables-table";

export const metadata = {
  title: "Recebimentos | Arena Tech",
};

export default function ReceivablesPage() {
  return (
    <div>
      <PageHeader
        title="Recebimentos"
        subtitle="Recebimentos realizados (contas a receber pagas)"
      />
      <ReceivablesTable />
    </div>
  );
}
