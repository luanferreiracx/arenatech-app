import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { PurchasesTable } from "./_components/purchases-table";

export const metadata = {
  title: "Compras de Aparelhos | Arena Tech",
};

export default function PurchasesPage() {
  return (
    <div>
      <PageHeader
        title="Compras de Aparelhos"
        subtitle="Registro de aparelhos comprados de clientes ou fornecedores"
        actions={
          <Button asChild>
            <Link href="/stock/purchases/new">
              <Plus className="mr-2 h-4 w-4" />
              Nova Compra
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<LoadingState variant="table" />}>
        <PurchasesTable />
      </Suspense>
    </div>
  );
}
