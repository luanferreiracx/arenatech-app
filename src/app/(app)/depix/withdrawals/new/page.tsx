import Link from "next/link";
import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { NewWithdrawForm } from "./_components/new-withdraw-form";

export const metadata = {
  title: "Novo Saque DePix | Arena Tech",
};

export default function NewWithdrawPage() {
  return (
    <div>
      <PageHeader
        title="Novo Saque DePix"
        subtitle="Solicitar saque via PIX descentralizado"
        actions={
          <Button variant="outline" asChild>
            <Link href="/depix/withdrawals"><ArrowLeft className="w-4 h-4 mr-2" />Voltar</Link>
          </Button>
        }
      />
      <NewWithdrawForm />
    </div>
  );
}
