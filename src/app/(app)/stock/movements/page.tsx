import { Suspense } from "react";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { MovementsTable } from "./_components/movements-table";

export const metadata = {
  title: "Movimentacoes de Estoque | Arena Tech",
};

export default function MovementsPage() {
  return (
    <div>
      <PageHeader
        title="Movimentacoes de Estoque"
        subtitle="Historico de entradas, saidas e ajustes"
      />
      <Suspense fallback={<LoadingState variant="table" />}>
        <MovementsTable />
      </Suspense>
    </div>
  );
}
