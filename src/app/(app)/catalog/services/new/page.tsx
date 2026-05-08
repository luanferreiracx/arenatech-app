import { PageHeader } from "@/components/domain/page-header";
import { ServiceForm } from "../_components/service-form";

export default function NewServicePage() {
  return (
    <div>
      <PageHeader title="Novo Serviço" subtitle="Adicione um novo serviço ao catálogo" />
      <ServiceForm mode="create" />
    </div>
  );
}
