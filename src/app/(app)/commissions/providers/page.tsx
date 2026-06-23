import Link from "next/link";
import { Plus } from "lucide-react";
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
          <Button asChild>
            <Link href="/commissions/providers/new">
              <Plus className="mr-2 h-4 w-4" />
              Novo Prestador
            </Link>
          </Button>
        }
      />
      <ProvidersList />
    </div>
  );
}
