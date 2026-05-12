import { PageHeader } from "@/components/domain/page-header";
import { CustomerForm } from "../_components/customer-form";

export const metadata = {
  title: "Novo Cliente | Arena Tech",
};

export default function NewCustomerPage() {
  return (
    <div>
      <PageHeader title="Novo Cliente" subtitle="Cadastrar um novo cliente" />
      <div className="max-w-3xl">
        <CustomerForm />
      </div>
    </div>
  );
}
