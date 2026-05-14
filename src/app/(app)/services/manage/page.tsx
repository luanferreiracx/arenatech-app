import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { ServicesManageTable } from "../_components/services-table";

export const metadata = {
  title: "Gerenciar Servicos | Arena Tech",
};

export default function ManageServicesPage() {
  return (
    <div>
      <PageHeader
        title="Gerenciar Servicos"
        subtitle="Administre o catalogo de servicos, precos e tipos"
        actions={
          <Button variant="outline" asChild>
            <Link href="/services">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar ao Catalogo
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<LoadingState variant="table" />}>
        <ServicesManageTable />
      </Suspense>
    </div>
  );
}
