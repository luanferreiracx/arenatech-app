"use client";

import Link from "next/link";
import { Plus, BarChart3, Download, MinusCircle, ListChecks, FileText, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsTenantAdmin } from "@/lib/auth/use-tenant-admin";
import { LabelsExportMenu } from "./labels-export-menu";

/**
 * Acoes do cabecalho da tela de Estoque. As acoes que mutam catalogo/saldo
 * (baixa, ajuste em massa, importar CSV, novo produto) exigem admin no backend —
 * escondidas para operador. Relatorios e NF-e ficam visiveis para todos.
 */
export function StockPageActions() {
  const isAdmin = useIsTenantAdmin();

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" asChild>
        <Link href="/stock/reports">
          <BarChart3 className="mr-2 h-4 w-4" />
          Relatorios
        </Link>
      </Button>
      <Button variant="outline" asChild>
        <Link href="/stock/low-stock">
          <TriangleAlert className="mr-2 h-4 w-4" />
          Estoque baixo
        </Link>
      </Button>
      {isAdmin && (
        <Button variant="outline" asChild>
          <Link href="/stock/bulk-adjust">
            <ListChecks className="mr-2 h-4 w-4" />
            Ajuste em massa
          </Link>
        </Button>
      )}
      {isAdmin && (
        <Button variant="outline" asChild>
          <Link href="/stock/exit">
            <MinusCircle className="mr-2 h-4 w-4" />
            Baixa
          </Link>
        </Button>
      )}
      {/* Exporta produtos ativos (.xlsx p/ app Niimbot). Menu permite escolher
          1 etiqueta por produto ou repetir conforme o saldo em estoque. */}
      <LabelsExportMenu buttonLabel="Etiquetas Niimbot" />
      <Button variant="outline" asChild>
        <Link href="/stock/nfe">
          <FileText className="mr-2 h-4 w-4" />
          NF-e
        </Link>
      </Button>
      {isAdmin && (
        <Button variant="outline" asChild>
          <Link href="/stock/import">
            <Download className="mr-2 h-4 w-4" />
            Importar CSV
          </Link>
        </Button>
      )}
      {isAdmin && (
        <Button asChild>
          <Link href="/stock/new">
            <Plus className="mr-2 h-4 w-4" />
            Novo Produto
          </Link>
        </Button>
      )}
    </div>
  );
}
