"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/domain/data-table";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import type { ColumnDef } from "@tanstack/react-table";

interface DeviceRow {
  id: string;
  brand: string;
  model: string;
  active: boolean;
  category: { id: string; name: string } | null;
}

export function DevicesTable() {
  const trpc = useTRPC();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [page, setPage] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, refetch } = useQuery(
    trpc.catalog.listDevices.queryOptions({ search, categoryId, page, pageSize: 20 }),
  );

  const { data: categories = [] } = useQuery(
    trpc.catalog.listDeviceCategories.queryOptions(),
  );

  const deleteMutation = useMutation(
    trpc.catalog.deleteDevice.mutationOptions({
      onSuccess: () => {
        toast.success("Aparelho removido.");
        setDeleteId(null);
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const columns: ColumnDef<DeviceRow>[] = [
    { accessorKey: "brand", header: "Marca" },
    { accessorKey: "model", header: "Modelo" },
    {
      id: "category",
      header: "Categoria",
      cell: ({ row }) => row.original.category?.name ?? "—",
    },
    {
      accessorKey: "active",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.getValue("active") ? "default" : "secondary"}>
          {row.getValue("active") ? "Ativo" : "Inativo"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => router.push(`/catalog/devices/${row.original.id}/edit`)}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteId(row.original.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remover
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={(data?.items ?? []) as DeviceRow[]}
        pageCount={data?.pageCount}
        pageIndex={page}
        pageSize={20}
        onPageChange={setPage}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Buscar aparelhos..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="max-w-xs"
            />
            <Select
              value={categoryId ?? "all"}
              onValueChange={(v) => {
                setCategoryId(v === "all" ? undefined : v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Todas categorias" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas categorias</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" asChild>
              <Link href="/catalog/devices/new">Novo Aparelho</Link>
            </Button>
          </div>
        }
      />
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Remover aparelho?"
        description="O aparelho será marcado como removido."
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}
