import { PageHeader } from "@/components/domain/page-header";
import Link from "next/link";
import { Clock, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CashierDashboard } from "./_components/cashier-dashboard";

export const metadata = {
  title: "Caixa | Arena Tech",
};

export default function CashierPage() {
  return (
    <div>
      <PageHeader
        title="Caixa"
        subtitle="Gerencie a abertura, movimentacoes e fechamento do caixa"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/cashier/reviews">
                <CheckSquare className="mr-2 h-4 w-4" />
                Conferencias
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/cashier/history">
                <Clock className="mr-2 h-4 w-4" />
                Historico
              </Link>
            </Button>
          </div>
        }
      />
      <CashierDashboard />
    </div>
  );
}
