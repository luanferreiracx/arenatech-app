"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable } from "@/components/domain/data-table";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import type { ColumnDef } from "@tanstack/react-table";

interface TemplateRow {
  id: string;
  title: string;
  category: string | null;
  active: boolean;
}

export function DiagnosticTemplatesTable() {
  const trpc = useTRPC();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, refetch } = useQuery(
    trpc.catalog.listDiagnosticTemplates.queryOptions({ search, page, pageSize: 20 }),
  );

  const deleteMutation = useMutation(
    trpc.catalog.deleteDiagnosticTemplate.mutationOptions({
      onSuccess: () => {
        toast.success("Template removido.");
        setDeleteId(null);
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const columns: ColumnDef<TemplateRow>[] = [
    { accessorKey: "title", header: "Título" },
    {
      accessorKey: "category",
      header: "Categoria",
      cell: ({ row }) => row.getValue("category") ?? "—",
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
                onClick={() => router.push(`/catalog/diagnostic-templates/${row.original.id}/edit`)}
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
        data={(data?.items ?? []) as TemplateRow[]}
        pageCount={data?.pageCount}
        pageIndex={page}
        pageSize={20}
        onPageChange={setPage}
        toolbar={
          <div className="flex items-center gap-2">
            <Input
              placeholder="Buscar templates..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="max-w-xs"
            />
            <Button size="sm" asChild>
              <Link href="/catalog/diagnostic-templates/new">Novo Template</Link>
            </Button>
          </div>
        }
      />
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Remover template?"
        description="O template será removido permanentemente."
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}
