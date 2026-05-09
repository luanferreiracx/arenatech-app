import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { TransactionsClient } from "./_components/transactions-client";
import { createMetadata } from "@/lib/metadata";

export const metadata = createMetadata("Financeiro");

export default function FinancialPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Financeiro"
        subtitle="Contas a pagar e a receber"
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href="/financial/cash-flow">Fluxo de Caixa</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/financial/new">Nova Transação</Link>
            </Button>
          </div>
        }
      />
      <TransactionsClient />
    </div>
  );
}
