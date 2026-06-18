"use client";

import { Tag, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type LabelsExportMenuProps = {
  /** Se informado, exporta apenas estes produtos; senão, os produtos ativos. */
  ids?: string[];
  buttonLabel: string;
  size?: "sm" | "default";
};

/**
 * Monta a URL de download das etiquetas. `withStockQty` repete cada linha pela
 * quantidade em estoque (qty=stock + expand) — no app mobile Niimbot a coluna
 * Quantidade não multiplica cópias sozinha, então repetir linhas é o que de fato
 * imprime N etiquetas por produto.
 */
function buildLabelsUrl(ids: string[] | undefined, withStockQty: boolean): string {
  const params = new URLSearchParams();
  if (ids && ids.length > 0) params.set("ids", ids.join(","));
  if (withStockQty) {
    params.set("qty", "stock");
    params.set("expand", "true");
  }
  const qs = params.toString();
  return `/api/stock/labels${qs ? `?${qs}` : ""}`;
}

export function LabelsExportMenu({ ids, buttonLabel, size = "default" }: LabelsExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size}>
          <Tag className="mr-2 h-4 w-4" />
          {buttonLabel}
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Etiquetas Niimbot (.xlsx)</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer">
          <a href={buildLabelsUrl(ids, false)}>
            <span className="flex flex-col">
              <span>1 etiqueta por produto</span>
              <span className="text-xs text-muted-foreground">
                Coluna Quantidade = 1 (edite na planilha se quiser mais)
              </span>
            </span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer">
          <a href={buildLabelsUrl(ids, true)}>
            <span className="flex flex-col">
              <span>Quantidade conforme estoque</span>
              <span className="text-xs text-muted-foreground">
                Repete cada etiqueta pelo saldo em estoque
              </span>
            </span>
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
