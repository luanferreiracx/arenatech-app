"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCan } from "@/lib/auth/use-capabilities";

/**
 * Botao "Nova Compra" — registrar compra de aparelho é do dia a dia do operador
 * (ADR 0053).
 */
export function NewPurchaseAction() {
  const canRegisterPurchase = useCan("registerPurchase");
  if (!canRegisterPurchase) return null;
  return (
    <Button asChild>
      <Link href="/stock/purchases/new">
        <Plus className="mr-2 h-4 w-4" />
        Nova Compra
      </Link>
    </Button>
  );
}
