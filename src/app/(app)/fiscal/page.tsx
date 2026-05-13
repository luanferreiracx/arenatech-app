import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";
import { FiscalDashboard } from "./_components/fiscal-dashboard";

export const metadata = {
  title: "Fiscal | Arena Tech",
};

export default function FiscalPage() {
  return (
    <div>
      <PageHeader
        title="Fiscal"
        subtitle="Emissao e gerenciamento de notas fiscais"
        actions={
          <Button asChild>
            <Link href="/fiscal/new">
              <Plus className="mr-2 h-4 w-4" />
              Emitir Nota
            </Link>
          </Button>
        }
      />
      <FiscalDashboard />
    </div>
  );
}
