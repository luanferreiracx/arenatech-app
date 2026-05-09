import { createMetadata } from "@/lib/metadata";
import { PageHeader } from "@/components/domain/page-header";

export const metadata = createMetadata("Comissoes");
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CommissionsTable } from "./_components/commissions-table";

export default function CommissionsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Comissões"
        subtitle="Gerencie as comissões dos colaboradores"
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href="/commissions/rules">Regras</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/commissions/report">Relatório</Link>
            </Button>
          </div>
        }
      />
      <CommissionsTable />
    </div>
  );
}
