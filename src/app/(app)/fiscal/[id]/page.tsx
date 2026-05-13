import { PageHeader } from "@/components/domain/page-header";
import { InvoiceDetail } from "../_components/invoice-detail";

export const metadata = {
  title: "Detalhe da Nota Fiscal | Arena Tech",
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div>
      <PageHeader title="Nota Fiscal" subtitle="Detalhes e acoes da nota fiscal" />
      <InvoiceDetail invoiceId={id} />
    </div>
  );
}
