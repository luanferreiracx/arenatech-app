import Link from "next/link";
import { Settings, BarChart3, Users, UserCircle, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";
import { CommissionsList } from "./_components/commissions-list";

export const metadata = {
  title: "Comissoes | Arena Tech",
};

export default function CommissionsPage() {
  return (
    <div>
      <PageHeader
        title="Comissoes"
        subtitle="Gerenciamento de comissoes de vendas e servicos"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/commissions/my">
                <UserCircle className="mr-2 h-4 w-4" />
                Minha Comissao
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/commissions/partner">
                <Heart className="mr-2 h-4 w-4" />
                Comissao Socia
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/commissions/providers">
                <Users className="mr-2 h-4 w-4" />
                Prestadores
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/commissions/report">
                <BarChart3 className="mr-2 h-4 w-4" />
                Relatorio
              </Link>
            </Button>
            <Button asChild>
              <Link href="/commissions/rules">
                <Settings className="mr-2 h-4 w-4" />
                Regras
              </Link>
            </Button>
          </div>
        }
      />
      <CommissionsList />
    </div>
  );
}
