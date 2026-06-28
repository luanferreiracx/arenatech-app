import { PageHeader } from "@/components/domain/page-header";
import { ProvidersList } from "./_components/providers-list";
import { NewProviderButton } from "./_components/new-provider-button";

export const metadata = {
  title: "Prestadores | Arena Tech",
};

export default function ProvidersPage() {
  return (
    <div>
      <PageHeader
        title="Prestadores de Servico"
        subtitle="Gestao de prestadores MEI/CLT com contratos e comissoes"
        actions={<NewProviderButton />}
      />
      <ProvidersList />
    </div>
  );
}
