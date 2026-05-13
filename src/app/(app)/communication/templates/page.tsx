import { PageHeader } from "@/components/domain/page-header";
import { TemplatesList } from "./_components/templates-list";

export const metadata = {
  title: "Templates de Mensagem | Arena Tech",
};

export default function TemplatesPage() {
  return (
    <div>
      <PageHeader title="Templates de Mensagem" subtitle="Gerencie modelos de mensagem" />
      <TemplatesList />
    </div>
  );
}
