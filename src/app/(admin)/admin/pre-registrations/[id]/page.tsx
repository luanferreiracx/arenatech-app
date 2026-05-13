import { PageHeader } from "@/components/domain/page-header";
import { PreRegistrationDetail } from "../_components/pre-registration-detail";

export const metadata = {
  title: "Detalhe Pre-cadastro | Arena Tech Admin",
};

export default async function PreRegistrationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <PageHeader title="Pre-cadastro" subtitle="Detalhes e acoes" />
      <PreRegistrationDetail preRegId={id} />
    </div>
  );
}
