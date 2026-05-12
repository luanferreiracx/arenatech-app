import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { DiagnosticTemplatesTable } from "./_components/diagnostic-templates-table";

export const metadata = {
  title: "Templates de Diagnostico | Arena Tech",
};

export default function DiagnosticTemplatesPage() {
  return (
    <div>
      <PageHeader
        title="Templates de Diagnostico"
        subtitle="Modelos reutilizaveis para diagnosticos de aparelhos"
        actions={
          <Button asChild>
            <Link href="/catalog/diagnostic-templates/new">
              <Plus className="mr-2 h-4 w-4" />
              Novo Template
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<LoadingState variant="table" />}>
        <DiagnosticTemplatesTable />
      </Suspense>
    </div>
  );
}
