import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
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
        actions={
          <Button variant="outline" asChild>
            <a href="/api/financial/export?type=transactions&txType=RECEIVABLE&status=PAID">
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </a>
          </Button>
        }
      />
      <ReceivablesTable />
    </div>
  );
}
