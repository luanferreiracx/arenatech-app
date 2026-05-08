import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { DevicePurchasesTable } from "./_components/device-purchases-table";

export default function DevicePurchasesPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Compras de Aparelhos"
        subtitle="Registro de aparelhos comprados de clientes"
        actions={
          <Button size="sm" asChild>
            <Link href="/stock/purchases/new">Registrar Compra</Link>
          </Button>
        }
      />
      <DevicePurchasesTable />
    </div>
  );
}
