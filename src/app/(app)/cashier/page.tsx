import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CashierClient } from "./_components/cashier-client";
import { createMetadata } from "@/lib/metadata";

export const metadata = createMetadata("Caixa");

export default function CashierPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Caixa"
        subtitle="Controle de abertura, movimentações e fechamento"
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link href="/cashier/history">Histórico</Link>
          </Button>
        }
      />
      <CashierClient />
    </div>
  );
}
