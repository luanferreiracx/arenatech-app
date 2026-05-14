import { PageHeader } from "@/components/domain/page-header";
import { NfReportContent } from "./_components/nf-report-content";

export const metadata = {
  title: "Relatorio de NF | Arena Tech",
};

export default function ReportsPage() {
  return (
    <div>
      <PageHeader
        title="Relatorio de NF"
        subtitle="Vendas do PDV e OS do periodo com a flag de nota fiscal emitida"
      />
      <NfReportContent />
    </div>
  );
}
