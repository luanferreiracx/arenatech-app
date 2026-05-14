import { Suspense } from "react";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { ServicesCatalog } from "./_components/services-catalog";

export const metadata = {
  title: "Servicos | Arena Tech",
};

export default function ServicesPage() {
  return (
    <div>
      <PageHeader
        title="Catalogo de Servicos"
        subtitle="Consulte precos e envie orcamentos para clientes"
      />
      <Suspense fallback={<LoadingState variant="table" />}>
        <ServicesCatalog />
      </Suspense>
    </div>
  );
}
