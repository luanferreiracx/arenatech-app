import { PageHeader } from "@/components/domain/page-header";
import { ValuationsList } from "./_components/valuations-list";

export const metadata = {
  title: "Avaliacoes de Aparelhos | Arena Tech",
};

export default function ValuationsPage() {
  return (
    <div>
      <PageHeader
        title="Avaliacoes de Aparelhos"
        subtitle="Tabela de precos para compra de aparelhos usados"
      />
      <ValuationsList />
    </div>
  );
}
