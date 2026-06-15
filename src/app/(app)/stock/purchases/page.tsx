import { Suspense } from "react";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { PurchasesTable } from "./_components/purchases-table";
import { NewPurchaseAction } from "./_components/new-purchase-action";

export const metadata = {
  title: "Compras de Aparelhos | Arena Tech",
};

export default function PurchasesPage() {
  return (
    <div>
      <PageHeader
        title="Compras de Aparelhos"
        subtitle="Registro de aparelhos comprados de clientes ou fornecedores"
        actions={<NewPurchaseAction />}
      />
      <Suspense fallback={<LoadingState variant="table" />}>
        <PurchasesTable />
      </Suspense>
    </div>
  );
}
