import { PageHeader } from "@/components/domain/page-header";
import { DiagnosticForm } from "../_components/diagnostic-form";

export default function NewDiagnosticTemplatePage() {
  return (
    <div>
      <PageHeader title="Novo Template de Diagnóstico" />
      <DiagnosticForm mode="create" />
    </div>
  );
}
