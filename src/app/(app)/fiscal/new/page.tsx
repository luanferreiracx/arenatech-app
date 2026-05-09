import { PageHeader } from "@/components/domain/page-header";
import { InvoiceForm } from "../_components/invoice-form";

export default function NewInvoicePage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Emitir Nota Fiscal"
        subtitle="Criação manual de nota fiscal eletrônica"
      />
      <InvoiceForm />
    </div>
  );
}
