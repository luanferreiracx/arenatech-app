import { PageHeader } from "@/components/domain/page-header";
import { TemplatesManager } from "../_components/templates-manager";

export default function TemplatesPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Templates de Mensagem"
        subtitle="Gerencie os templates de mensagem para WhatsApp e E-mail"
      />
      <TemplatesManager />
    </div>
  );
}
