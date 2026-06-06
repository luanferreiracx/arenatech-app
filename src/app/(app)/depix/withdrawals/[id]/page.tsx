import Link from "next/link";
import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { WithdrawDetail } from "./_components/withdraw-detail";

export const metadata = {
  title: "Detalhe do Saque Legado | Arena Tech",
};

export default async function WithdrawDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return (
    <div>
      <PageHeader
        title="Detalhe do Saque Legado"
        actions={
          <Button variant="outline" asChild>
            <Link href="/depix/withdrawals"><ArrowLeft className="w-4 h-4 mr-2" />Voltar</Link>
          </Button>
        }
      />
      <WithdrawDetail id={params.id} />
    </div>
  );
}
