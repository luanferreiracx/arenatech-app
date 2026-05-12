import { PageHeader } from "@/components/domain/page-header";
import { DiagnosticTemplateForm } from "../_components/diagnostic-template-form";

export const metadata = {
  title: "Novo Template | Arena Tech",
};

export default function NewDiagnosticTemplatePage() {
  return (
    <div>
      <PageHeader title="Novo Template de Diagnostico" subtitle="Cadastre um novo template" />
      <DiagnosticTemplateForm />
    </div>
  );
}
