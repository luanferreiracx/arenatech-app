import { Suspense } from "react";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { DeviceCategoriesList } from "./_components/device-categories-list";

export const metadata = {
  title: "Categorias de Aparelhos | Arena Tech",
};

export default function DeviceCategoriesPage() {
  return (
    <div>
      <PageHeader
        title="Categorias de Aparelhos"
        subtitle="Organize os aparelhos em categorias"
      />
      <Suspense fallback={<LoadingState variant="list" rows={6} />}>
        <DeviceCategoriesList />
      </Suspense>
    </div>
  );
}
