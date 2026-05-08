import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CustomersTable } from "./_components/customers-table";

export default function CustomersPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Clientes"
        subtitle="Gerencie os clientes da loja"
        actions={
          <Button size="sm" asChild>
            <Link href="/customers/new">Novo Cliente</Link>
          </Button>
        }
      />
      <CustomersTable />
    </div>
  );
}
