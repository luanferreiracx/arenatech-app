import { PageHeader } from "@/components/domain/page-header";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CashFlowReport } from "../_components/cash-flow-report";

export const metadata = {
  title: "Fluxo de Caixa | Arena Tech",
};

export default function CashFlowPage() {
  return (
    <div>
      <PageHeader
        title="Fluxo de Caixa"
        subtitle="Visualize entradas e saidas por periodo"
        actions={
          <Button variant="outline" asChild>
            <Link href="/financial">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
        }
      />
      <CashFlowReport />
    </div>
  );
}
