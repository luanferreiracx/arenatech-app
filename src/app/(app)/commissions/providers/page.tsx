import Link from "next/link";
import { Plus, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";
import { ProvidersList } from "./_components/providers-list";

export const metadata = {
  title: "Prestadores | Arena Tech",
};

export default function ProvidersPage() {
  return (
    <div>
      <PageHeader
        title="Prestadores de Servico"
        subtitle="Gestao de prestadores MEI/CLT com contratos e comissoes"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/commissions">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Link>
            </Button>
            <Button asChild>
              <Link href="/commissions/providers/new">
                <Plus className="mr-2 h-4 w-4" />
                Novo Prestador
              </Link>
            </Button>
          </div>
        }
      />
      <ProvidersList />
    </div>
  );
}
