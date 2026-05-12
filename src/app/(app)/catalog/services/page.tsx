import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { ServicesTable } from "./_components/services-table";

export const metadata = {
  title: "Servicos | Arena Tech",
};

export default function ServicesPage() {
  return (
    <div>
      <PageHeader
        title="Servicos"
        subtitle="Gerencie os servicos oferecidos pela assistencia"
        actions={
          <Button asChild>
            <Link href="/catalog/services/new">
              <Plus className="mr-2 h-4 w-4" />
              Novo Servico
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<LoadingState variant="table" />}>
        <ServicesTable />
      </Suspense>
    </div>
  );
}
