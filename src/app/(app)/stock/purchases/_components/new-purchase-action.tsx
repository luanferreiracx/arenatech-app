"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsTenantAdmin } from "@/lib/auth/use-tenant-admin";

/**
 * Botao "Nova Compra" — createPurchase exige admin no backend, entao escondido
 * para operador.
 */
export function NewPurchaseAction() {
  const isAdmin = useIsTenantAdmin();
  if (!isAdmin) return null;
  return (
    <Button asChild>
      <Link href="/stock/purchases/new">
        <Plus className="mr-2 h-4 w-4" />
        Nova Compra
      </Link>
    </Button>
  );
}
