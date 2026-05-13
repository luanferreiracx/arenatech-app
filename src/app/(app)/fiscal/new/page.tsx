import { PageHeader } from "@/components/domain/page-header";
import { InvoiceForm } from "../_components/invoice-form";

export const metadata = {
  title: "Emitir Nota Fiscal | Arena Tech",
};

export default function NewInvoicePage() {
  return (
    <div>
      <PageHeader title="Emitir Nota Fiscal" subtitle="Preencha os dados da nota fiscal" />
      <InvoiceForm />
    </div>
  );
}
