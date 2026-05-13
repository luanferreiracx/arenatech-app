import { PageHeader } from "@/components/domain/page-header";
import { PartnerCommission } from "./_components/partner-commission";

export const metadata = {
  title: "Comissao Socia | Arena Tech",
};

export default function PartnerCommissionPage() {
  return (
    <div>
      <PageHeader
        title="Comissao da Socia"
        subtitle="Apuracao de comissoes com categorias e periodos flexiveis"
      />
      <PartnerCommission />
    </div>
  );
}
