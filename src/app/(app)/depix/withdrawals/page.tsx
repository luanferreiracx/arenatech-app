import Link from "next/link";
import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import { WithdrawalsContent } from "./_components/withdrawals-content";

export const metadata = {
  title: "Arquivo de Saques DePix Legado | Arena Tech",
};

export default function DepixWithdrawalsPage() {
  return (
    <div>
      <PageHeader
        title="Arquivo de Saques DePix Legado"
        subtitle="Consulta somente leitura de saques antigos. Novos saques devem ser feitos pela DePix Wallet."
        actions={
          <Button asChild>
            <Link href="/depix-wallet/withdraw">Sacar pela Wallet</Link>
          </Button>
        }
      />
      <WithdrawalsContent />
    </div>
  );
}
