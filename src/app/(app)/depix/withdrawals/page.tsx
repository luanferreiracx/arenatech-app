import Link from "next/link";
import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import { WithdrawalsContent } from "./_components/withdrawals-content";

export const metadata = {
  title: "Saques DePix | Arena Tech",
};

export default function DepixWithdrawalsPage() {
  return (
    <div>
      <PageHeader
        title="Saques DePix"
        subtitle="Saques via PIX descentralizado"
        actions={
          <Button asChild>
            <Link href="/depix/withdrawals/new">Novo Saque</Link>
          </Button>
        }
      />
      <WithdrawalsContent />
    </div>
  );
}
