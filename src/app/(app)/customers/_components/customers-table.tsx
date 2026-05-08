"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MoreHorizontal, Pencil, Trash2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { DataTable } from "@/components/domain/data-table";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import type { ColumnDef } from "@tanstack/react-table";

interface CustomerRow {
  id: string;
  name: string;
  type: "PF" | "PJ";
  cpf: string | null;
  cnpj: string | null;
  phone: string | null;
  createdAt: Date | string;
}

function formatDocument(row: CustomerRow): string {
  if (row.type === "PF" && row.cpf) {
    const d = row.cpf.replace(/\D/g, "");
    if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    return row.cpf;
  }
  if (row.type === "PJ" && row.cnpj) {
    const d = row.cnpj.replace(/\D/g, "");
    if (d.length === 14)
      return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
    return row.cnpj;
  }
  return "—";
}

export function CustomersTable() {
  const trpc = useTRPC();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"PF" | "PJ" | "all">("all");
  const [page, setPage] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, refetch } = useQuery(
    trpc.customers.list.queryOptions({
      search,
      type: type === "all" ? undefined : type,
      page,
      pageSize: 20,
    }),
  );

  const deleteMutation = useMutation(
    trpc.customers.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Cliente removido.");
        setDeleteId(null);
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const columns: ColumnDef<CustomerRow>[] = [
    { accessorKey: "name", header: "Nome" },
    {
      accessorKey: "type",
      header: "Tipo",
      cell: ({ row }) => (
        <Badge variant="outline">{row.getValue("type")}</Badge>
      ),
    },
    {
      id: "document",
      header: "CPF / CNPJ",
      cell: ({ row }) => (
        <span className="font-mono text-sm">{formatDocument(row.original)}</span>
      ),
    },
    {
      accessorKey: "phone",
      header: "Telefone",
      cell: ({ row }) => row.getValue("phone") ?? "—",
    },
    {
      accessorKey: "createdAt",
      header: "Cadastro",
      cell: ({ row }) => {
        const val = row.getValue("createdAt");
        return new Date(val as string).toLocaleDateString("pt-BR");
      },
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
                onClick={() => router.push(`/customers/${row.original.id}`)}
              >
                <Eye className="mr-2 h-4 w-4" />
                Ver detalhe
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => router.push(`/customers/${row.original.id}/edit`)}
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
        data={(data?.items ?? []) as CustomerRow[]}
        pageCount={data?.pageCount}
        pageIndex={page}
        pageSize={20}
        onPageChange={setPage}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Buscar por nome, CPF, CNPJ ou telefone..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="max-w-sm"
            />
            <Select
              value={type}
              onValueChange={(v) => {
                setType(v as "PF" | "PJ" | "all");
                setPage(0);
              }}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="PF">Pessoa Física</SelectItem>
                <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" asChild>
              <Link href="/customers/new">Novo Cliente</Link>
            </Button>
          </div>
        }
      />
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Remover cliente?"
        description="O cliente será desativado mas pode ser restaurado posteriormente."
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}
