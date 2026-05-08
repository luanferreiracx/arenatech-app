import { PageHeader } from "@/components/domain/page-header";
import { CustomerForm } from "../_components/customer-form";

export default function NewCustomerPage() {
  return (
    <div>
      <PageHeader title="Novo Cliente" subtitle="Cadastre um novo cliente" />
      <CustomerForm mode="create" />
    </div>
  );
}
