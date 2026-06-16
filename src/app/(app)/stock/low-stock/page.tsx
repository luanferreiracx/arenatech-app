import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";
import { LowStockTable } from "./_components/low-stock-table";

export const metadata = {
  title: "Estoque Baixo | Arena Tech",
};

export default function LowStockPage() {
  return (
    <div>
      <PageHeader
        title="Estoque Baixo"
        subtitle="Produtos no ou abaixo do estoque minimo — priorize a reposicao"
        actions={
          <Button variant="outline" asChild>
            <Link href="/stock">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar ao estoque
            </Link>
          </Button>
        }
      />
      <LowStockTable />
    </div>
  );
}
