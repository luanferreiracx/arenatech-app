import { PageHeader } from "@/components/domain/page-header";
import { ValuationsList } from "./_components/valuations-list";

export const metadata = {
  title: "Avaliações de Aparelhos | Arena Tech",
};

export default function ValuationsPage() {
  return (
    <div>
      <PageHeader
        title="Avaliações de Aparelhos"
        subtitle="Tabela de preços para compra de aparelhos usados"
      />
      <ValuationsList />
    </div>
  );
}
