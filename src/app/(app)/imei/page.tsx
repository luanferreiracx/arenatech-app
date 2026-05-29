import { PageHeader } from "@/components/domain/page-header";
import { ConsultaPanel } from "./_components/consulta-panel";

export const metadata = {
  title: "Consultas | Arena Tech",
};

export default function ConsultaPage() {
  return (
    <div>
      <PageHeader
        title="Consultas"
        subtitle="Consulte dispositivos Apple por IMEI/Serial e baixe o DANFE de uma NF-e pela chave de acesso"
      />
      <ConsultaPanel />
    </div>
  );
}
