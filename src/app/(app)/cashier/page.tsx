import { PageHeader } from "@/components/domain/page-header";
import Link from "next/link";
import { Clock, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { auth } from "@/server/auth";
import { cookies } from "next/headers";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";
import { isTenantAdmin } from "@/lib/auth/roles";
import { CashierDashboard } from "./_components/cashier-dashboard";

export const metadata = {
  title: "Caixa | Arena Tech",
};

export default async function CashierPage() {
  // A conferência é da gerência (`cashier.pendingReviews` recusa operador). O
  // atalho aqui era oferecido a todo mundo, então esconder o item do menu não
  // bastava: o operador clicava por esta porta e caía na mesma negativa.
  const session = await auth();
  const cookieStore = await cookies();
  const activeTenant = session
    ? resolveActiveTenant(session, cookieStore.get("x-active-tenant")?.value)
    : null;
  const canReview = !!session && isTenantAdmin(session, activeTenant?.id ?? "");

  return (
    <div>
      <PageHeader
        title="Caixa"
        subtitle="Gerencie a abertura, movimentacoes e fechamento do caixa"
        actions={
          <div className="flex flex-wrap gap-2">
            {canReview && (
              <Button variant="outline" asChild>
                <Link href="/cashier/reviews">
                  <CheckSquare className="mr-2 h-4 w-4" />
                  Conferencias
                </Link>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href="/cashier/history">
                <Clock className="mr-2 h-4 w-4" />
                Historico
              </Link>
            </Button>
          </div>
        }
      />
      <CashierDashboard />
    </div>
  );
}
