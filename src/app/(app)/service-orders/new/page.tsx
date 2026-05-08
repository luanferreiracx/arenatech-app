import { PageHeader } from "@/components/domain/page-header";
import { ServiceOrderWizard } from "../_components/service-order-wizard";

export default function NewServiceOrderPage() {
  return (
    <div>
      <PageHeader
        title="Nova Ordem de Serviço"
        subtitle="Preencha os dados em 5 etapas"
      />
      <ServiceOrderWizard />
    </div>
  );
}
