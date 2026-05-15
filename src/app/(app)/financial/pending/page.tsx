import { PageHeader } from "@/components/domain/page-header";
import { PendingTable } from "./_components/pending-table";

export const metadata = {
  title: "Valores Pendentes | Arena Tech",
};

export default function PendingPage() {
  return (
    <div>
      <PageHeader
        title="Valores Pendentes"
        subtitle="Contas a receber pendentes de pagamento"
      />
      <PendingTable />
    </div>
  );
}
