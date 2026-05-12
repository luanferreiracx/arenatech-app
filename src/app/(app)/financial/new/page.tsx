import { PageHeader } from "@/components/domain/page-header";
import { TransactionForm } from "../_components/transaction-form";

export const metadata = {
  title: "Nova Transacao | Arena Tech",
};

export default function NewTransactionPage() {
  return (
    <div>
      <PageHeader
        title="Nova Transacao"
        subtitle="Cadastre uma conta a pagar ou a receber"
      />
      <TransactionForm />
    </div>
  );
}
