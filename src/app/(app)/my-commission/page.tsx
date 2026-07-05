import { PageHeader } from "@/components/domain/page-header";
import { MyCommission } from "./_components/my-commission";

export const metadata = {
  title: "Minha Comissao | Arena Tech",
};

export default function MyCommissionPage() {
  return (
    <div>
      <PageHeader
        title="Minha Comissao"
        subtitle="Sua apuracao de comissao por mes"
      />
      <MyCommission />
    </div>
  );
}
