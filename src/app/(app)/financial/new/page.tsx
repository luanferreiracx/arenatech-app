import { PageHeader } from "@/components/domain/page-header";
import { TransactionForm } from "./_components/transaction-form";

export default function NewTransactionPage() {
  return (
    <div>
      <PageHeader title="Nova Transação" subtitle="Registre uma conta a pagar ou a receber" />
      <TransactionForm />
    </div>
  );
}
