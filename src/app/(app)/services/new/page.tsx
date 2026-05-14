import { PageHeader } from "@/components/domain/page-header";
import { ServiceForm } from "../_components/service-form";

export const metadata = {
  title: "Novo Servico | Arena Tech",
};

export default function NewServicePage() {
  return (
    <div>
      <PageHeader title="Novo Servico" subtitle="Cadastre um novo servico no catalogo" />
      <ServiceForm />
    </div>
  );
}
