import { PageHeader } from "@/components/domain/page-header";
import { ChecklistFlow } from "./_components/checklist-flow";

export const metadata = {
  title: "Checklist de Avaliacao | Arena Tech",
};

export default function ChecklistPage() {
  return (
    <div>
      <PageHeader
        title="Checklist de Avaliacao"
        subtitle="Avaliacao tecnica de aparelhos para compra"
      />
      <ChecklistFlow />
    </div>
  );
}
