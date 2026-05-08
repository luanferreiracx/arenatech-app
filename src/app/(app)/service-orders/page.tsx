import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ServiceOrdersTable } from "./_components/service-orders-table";

export default function ServiceOrdersPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Ordens de Serviço"
        subtitle="Gerencie as ordens de serviço da loja"
        actions={
          <Button size="sm" asChild>
            <Link href="/service-orders/new">Nova OS</Link>
          </Button>
        }
      />
      <ServiceOrdersTable />
    </div>
  );
}
