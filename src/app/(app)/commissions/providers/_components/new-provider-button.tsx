"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsTenantAdmin } from "@/lib/auth/use-tenant-admin";

/**
 * Botao "Novo prestador" — so admin do tenant pode criar/editar comissoes
 * (a mutation e `tenantAdminProcedure`). Para operador comum, esconde o botao
 * em vez de mostrar um CTA que daria FORBIDDEN.
 */
export function NewProviderButton() {
  const isAdmin = useIsTenantAdmin();
  if (!isAdmin) return null;

  return (
    <Button asChild>
      <Link href="/commissions/providers/new">
        <Plus className="mr-2 h-4 w-4" />
        Novo prestador
      </Link>
    </Button>
  );
}
