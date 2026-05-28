"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { type ColumnDef } from "@tanstack/react-table";
import { FileText, Send, Check, RefreshCw, Eye } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DataTable } from "@/components/domain/data-table";
import { DataTableToolbar } from "@/components/domain/data-table/data-table-toolbar";
import { StatusBadge } from "@/components/domain/status-badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { toast } from "@/lib/toast";
import { deviceConditionLabels } from "@/lib/validators/stock";

interface PurchaseRow {
  id: string;
  imei: string | null;
  serial: string | null;
  brand: string | null;
  model: string | null;
  condition: string;
  batteryHealth: number | null;
  notes: string | null;
  purchasePrice: { toNumber?: () => number } | number | string;
  salePrice: { toNumber?: () => number } | number | string | null;
  createdAt: string | Date;
  product: { id: string; name: string } | null;
  termSigned: boolean;
  termSignedVia: string | null;
  autentiqueDocumentId: string | null;
}

function formatCurrency(value: PurchaseRow["purchasePrice"] | null): string {
  if (value == null) return "-";
  let num: number;
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    num = (value as { toNumber: () => number }).toNumber();
  } else {
    num = Number(value);
  }
  return num.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function PurchasesTable() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [confirmPhysicalId, setConfirmPhysicalId] = useState<string | null>(null);

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: trpc.stock.listPurchases.queryKey() });

  const sendAutentiqueMut = useMutation(
    trpc.stock.sendPurchaseTermAutentique.mutationOptions({
      onSuccess: (data: { signatureLink?: string | null }) => {
        toast.success("Termo enviado para Autentique.");
        if (data.signatureLink) window.open(data.signatureLink, "_blank");
        invalidate();
      },
      onError: (e: { message: string }) => toast.error(e.message),
    }),
  );

  const confirmPhysicalMut = useMutation(
    trpc.stock.confirmPurchasePhysicalSignature.mutationOptions({
      onSuccess: () => {
        toast.success("Assinatura fisica confirmada.");
        invalidate();
      },
      onError: (e: { message: string }) => toast.error(e.message),
    }),
  );

  const checkStatusMut = useMutation(
    trpc.stock.checkPurchaseSignatureStatus.mutationOptions({
      onSuccess: (data: { signed: boolean }) => {
        toast.success(data.signed ? "Termo assinado!" : "Ainda nao assinado.");
        invalidate();
      },
      onError: (e: { message: string }) => toast.error(e.message),
    }),
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(0);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, []);

  const { data, isLoading } = useQuery(
    trpc.stock.listPurchases.queryOptions({
      search: debouncedSearch || undefined,
      page,
      pageSize,
    }),
  );

  const columns: ColumnDef<PurchaseRow>[] = [
    {
      accessorKey: "createdAt",
      header: "Data",
      cell: ({ row }) => (
        <span className="text-sm">{formatDate(row.original.createdAt)}</span>
      ),
    },
    {
      id: "device",
      header: "Aparelho",
      cell: ({ row }) => (
        <div>
          {row.original.brand && row.original.model ? (
            <span className="font-medium">{row.original.brand} {row.original.model}</span>
          ) : row.original.product ? (
            <span className="font-medium">{row.original.product.name}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
          {row.original.imei && (
            <span className="block text-xs text-muted-foreground">
              IMEI: {row.original.imei}
            </span>
          )}
          {row.original.serial && !row.original.imei && (
            <span className="block text-xs text-muted-foreground">
              S/N: {row.original.serial}
            </span>
          )}
          {row.original.notes && (
            <span
              className="block text-xs italic text-muted-foreground/80 mt-0.5 max-w-[220px] truncate"
              title={row.original.notes}
            >
              Obs: {row.original.notes}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "condition",
      header: "Condicao",
      cell: ({ row }) => (
        <StatusBadge
          variant={
            row.original.condition === "NEW"
              ? "success"
              : row.original.condition === "DEFECTIVE"
                ? "destructive"
                : "warning"
          }
        >
          {deviceConditionLabels[row.original.condition] ?? row.original.condition}
        </StatusBadge>
      ),
    },
    {
      accessorKey: "batteryHealth",
      header: "Bateria",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.batteryHealth != null ? `${row.original.batteryHealth}%` : "-"}
        </span>
      ),
    },
    {
      accessorKey: "purchasePrice",
      header: "Preco Compra",
      cell: ({ row }) => (
        <span className="font-mono text-sm">{formatCurrency(row.original.purchasePrice)}</span>
      ),
    },
    {
      accessorKey: "salePrice",
      header: "Preco Venda",
      cell: ({ row }) => (
        <span className="font-mono text-sm">{formatCurrency(row.original.salePrice)}</span>
      ),
    },
    {
      id: "open",
      header: "",
      cell: ({ row }) => (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          asChild
          title="Abrir detalhe"
          aria-label="Abrir detalhe da compra"
        >
          <Link href={`/stock/purchases/${row.original.id}`}>
            <Eye className="h-3.5 w-3.5" />
          </Link>
        </Button>
      ),
    },
    {
      id: "term",
      header: "Termo",
      cell: ({ row }) => {
        const r = row.original;
        if (r.termSigned) {
          return (
            <StatusBadge variant="success">
              Assinado{r.termSignedVia === "autentique" ? " (digital)" : " (fisico)"}
            </StatusBadge>
          );
        }
        return (
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              asChild
              title="Baixar PDF do termo"
              aria-label="Baixar PDF do termo de responsabilidade"
            >
              <Link href={`/api/purchases/${r.id}/termo-responsabilidade`} target="_blank">
                <FileText className="h-3.5 w-3.5" />
              </Link>
            </Button>
            {!r.autentiqueDocumentId ? (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Enviar para Autentique"
                aria-label="Enviar termo para Autentique"
                disabled={sendAutentiqueMut.isPending}
                onClick={() => sendAutentiqueMut.mutate({ id: r.id })}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Verificar status no Autentique"
                aria-label="Verificar status da assinatura no Autentique"
                disabled={checkStatusMut.isPending}
                onClick={() => checkStatusMut.mutate({ id: r.id })}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-success"
              title="Confirmar assinatura fisica"
              aria-label="Confirmar assinatura fisica do termo"
              disabled={confirmPhysicalMut.isPending}
              onClick={() => setConfirmPhysicalId(r.id)}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
    <DataTable
      columns={columns}
      data={(data?.data ?? []) as PurchaseRow[]}
      pageCount={data?.pageCount ?? 0}
      pageIndex={page}
      pageSize={pageSize}
      onPageChange={setPage}
      onPageSizeChange={(size) => {
        setPageSize(size);
        setPage(0);
      }}
      isLoading={isLoading}
      emptyMessage="Nenhuma compra registrada."
      toolbar={
        <DataTableToolbar
          searchValue={search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="Buscar por IMEI, marca ou modelo..."
        />
      }
    />

    <ConfirmDialog
      open={confirmPhysicalId !== null}
      onOpenChange={(open) => { if (!open) setConfirmPhysicalId(null); }}
      title="Confirmar assinatura fisica do termo?"
      description="Marca o termo como assinado fisicamente pelo vendedor."
      confirmLabel="Confirmar"
      onConfirm={() => {
        if (confirmPhysicalId) {
          confirmPhysicalMut.mutate({ id: confirmPhysicalId });
          setConfirmPhysicalId(null);
        }
      }}
      isLoading={confirmPhysicalMut.isPending}
    />
    </>
  );
}
