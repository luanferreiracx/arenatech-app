import { PageHeader } from "@/components/domain/page-header";
import { CommissionRules } from "./_components/commission-rules";

export const metadata = {
  title: "Regras de Comissao | Arena Tech",
};

export default function CommissionRulesPage() {
  return (
    <div>
      <PageHeader title="Regras de Comissao" subtitle="Configure as regras de calculo de comissoes" />
      <CommissionRules />
    </div>
  );
}
