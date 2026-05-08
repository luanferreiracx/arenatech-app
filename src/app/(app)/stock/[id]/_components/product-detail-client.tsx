"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2, ArrowDownUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/domain/page-header";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { LoadingState } from "@/components/domain/loading-state";
import { DataTable } from "@/components/domain/data-table";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import type { ColumnDef } from "@tanstack/react-table";

interface Props {
  id: string;
}

function formatMoney(value: unknown): string {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface MovementRow {
  id: string;
  type: string;
  quantity: number;
  unitCost: unknown;
  reason: string | null;
  createdAt: Date | string;
}

const movementTypeLabels: Record<string, string> = {
  ENTRY: "Entrada",
  EXIT: "Saída",
  ADJUSTMENT: "Ajuste",
  SALE: "Venda",
  RETURN: "Devolução",
  TRANSFER: "Transferência",
};

const movementTypeVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ENTRY: "default",
  EXIT: "destructive",
  ADJUSTMENT: "secondary",
  SALE: "destructive",
  RETURN: "default",
  TRANSFER: "outline",
};

export function ProductDetailClient({ id }: Props) {
  const trpc = useTRPC();
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustType, setAdjustType] = useState<"ENTRY" | "EXIT" | "ADJUSTMENT">("ENTRY");
  const [adjustQty, setAdjustQty] = useState(1);
  const [adjustReason, setAdjustReason] = useState("");
  const [movPage, setMovPage] = useState(0);

  const { data: product, isLoading, refetch: refetchProduct } = useQuery(
    trpc.stock.getProduct.queryOptions({ id }),
  );

  const { data: movementsData, refetch: refetchMovements } = useQuery(
    trpc.stock.listMovements.queryOptions({
      productId: id,
      page: movPage,
      pageSize: 10,
    }),
  );

  const deleteMutation = useMutation(
    trpc.stock.deleteProduct.mutationOptions({
      onSuccess: () => {
        toast.success("Produto removido.");
        router.push("/stock");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const adjustMutation = useMutation(
    trpc.stock.adjustStock.mutationOptions({
      onSuccess: () => {
        toast.success("Estoque ajustado com sucesso!");
        setAdjustOpen(false);
        setAdjustQty(1);
        setAdjustReason("");
        void refetchProduct();
        void refetchMovements();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  if (isLoading) return <LoadingState variant="card" />;
  if (!product) return <p className="text-muted-foreground">Produto não encontrado.</p>;

  const totalStockValue = product.currentStock * Number(product.costPrice);

  const movementColumns: ColumnDef<MovementRow>[] = [
    {
      accessorKey: "createdAt",
      header: "Data",
      cell: ({ row }) => new Date(row.getValue("createdAt") as string).toLocaleString("pt-BR"),
    },
    {
      accessorKey: "type",
      header: "Tipo",
      cell: ({ row }) => {
        const type = row.getValue("type") as string;
        return (
          <Badge variant={movementTypeVariants[type] ?? "outline"}>
            {movementTypeLabels[type] ?? type}
          </Badge>
        );
      },
    },
    { accessorKey: "quantity", header: "Quantidade" },
    {
      accessorKey: "unitCost",
      header: "Custo Unit.",
      cell: ({ row }) => {
        const val = row.getValue("unitCost");
        return val ? formatMoney(val as number) : "—";
      },
    },
    {
      accessorKey: "reason",
      header: "Motivo",
      cell: ({ row }) => row.getValue("reason") ?? "—",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name}
        subtitle={product.sku ? `SKU: ${product.sku}` : undefined}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setAdjustOpen(true)}>
              <ArrowDownUp className="mr-1 h-4 w-4" />
              Ajustar Estoque
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href={`/stock/${id}/edit`}>
                <Pencil className="mr-1 h-4 w-4" />
                Editar
              </Link>
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-1 h-4 w-4" />
              Remover
            </Button>
          </div>
        }
      />

      {/* Cards resumo */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Estoque Atual</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold">{product.currentStock} {product.unit}</p>
              {product.currentStock <= product.minStock && (
                <Badge variant="destructive" className="text-[10px]">Baixo</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Mínimo: {product.minStock}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Preço de Custo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(product.costPrice)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Preço de Venda</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(product.salePrice)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Valor em Estoque</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(totalStockValue)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Movimentações recentes */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Movimentações Recentes</h3>
        <DataTable
          columns={movementColumns}
          data={(movementsData?.items ?? []) as MovementRow[]}
          pageCount={movementsData?.pageCount}
          pageIndex={movPage}
          pageSize={10}
          onPageChange={setMovPage}
        />
      </div>

      {/* Dialog Ajustar Estoque */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar Estoque</DialogTitle>
            <DialogDescription>
              Registre uma entrada, saída ou ajuste no estoque de {product.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Tipo</label>
              <Select value={adjustType} onValueChange={(v) => setAdjustType(v as "ENTRY" | "EXIT" | "ADJUSTMENT")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ENTRY">Entrada</SelectItem>
                  <SelectItem value="EXIT">Saída</SelectItem>
                  <SelectItem value="ADJUSTMENT">Ajuste (novo total)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Quantidade</label>
              <Input
                type="number"
                min={1}
                value={adjustQty}
                onChange={(e) => setAdjustQty(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Motivo</label>
              <Textarea
                placeholder="Motivo do ajuste..."
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={adjustMutation.isPending || adjustQty < 1}
              onClick={() =>
                adjustMutation.mutate({
                  productId: id,
                  type: adjustType,
                  quantity: adjustQty,
                  reason: adjustReason || undefined,
                })
              }
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Remover produto?"
        description="O produto será marcado como removido."
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={() => deleteMutation.mutate({ id })}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
