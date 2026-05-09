import { createMetadata } from "@/lib/metadata";
import { PageHeader } from "@/components/domain/page-header";

export const metadata = createMetadata("Fiscal");
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { InvoicesTable } from "./_components/invoices-table";

export default function FiscalPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Fiscal"
        subtitle="Gerencie as notas fiscais eletrônicas"
        actions={
          <Button size="sm" asChild>
            <Link href="/fiscal/new">Emitir NF-e</Link>
          </Button>
        }
      />
      <InvoicesTable />
    </div>
  );
}
