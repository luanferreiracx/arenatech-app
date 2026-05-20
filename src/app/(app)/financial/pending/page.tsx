import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
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
        actions={
          <Button variant="outline" asChild>
            <a href="/api/financial/export?type=transactions&txType=RECEIVABLE&status=PENDING">
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </a>
          </Button>
        }
      />
      <PendingTable />
    </div>
  );
}
