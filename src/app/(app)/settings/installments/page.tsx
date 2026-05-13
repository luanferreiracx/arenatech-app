import { PageHeader } from "@/components/domain/page-header";
import { EmptyState } from "@/components/domain/empty-state";
import { Percent } from "lucide-react";

export const metadata = {
  title: "Taxas de Parcelamento | Arena Tech",
};

export default function InstallmentsPage() {
  return (
    <div>
      <PageHeader title="Taxas de Parcelamento" subtitle="Configure as taxas de parcelamento para servicos" />
      <EmptyState
        icon={Percent}
        title="Em breve"
        description="Configuracao de taxas de parcelamento sera implementada em uma proxima fase."
      />
    </div>
  );
}
