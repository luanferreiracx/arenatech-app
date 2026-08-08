"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Eye } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/domain/status-badge";
import { EmptyState } from "@/components/domain/empty-state";
import { DataTable } from "@/components/domain/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { PRE_REGISTRATION_STATUS_LABELS, PRE_REGISTRATION_STATUS_VARIANT } from "@/lib/validators/admin";

export function PreRegistrationsTable() {
  const trpc = useTRPC();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const listQuery = useQuery(
    trpc.admin.listPreRegistrations.queryOptions({
      page,
      pageSize: 20,
      search: search || undefined,
      status: statusFilter ? (statusFilter as "PENDING" | "APPROVED" | "REJECTED") : undefined,
    }),
  );

  // ADM-1 (Etapa 9, M18): a ordem era
  // Nome Fantasia|Responsavel|Email|Tipo|Status|Data. A tabela media **1199px**
  // numa área de 270 a 320px — a mais larga da etapa —, e SEIS das sete colunas
  // nasciam fora de vista. `Status` começava em **982px**.
  //
  // Esta é a fila de aprovação de novas lojas: o superadmin abre para decidir
  // quem entra, e "pendente/aprovado/rejeitado" era justamente o que não se via.
  //
  // Quinta ocorrência da mesma classe nesta etapa (CMU-9/M8, CMN-1/M10,
  // INT-1/M11, QSL-2/M15).
  //
  // Reordenar sozinho não bastaria: "Nome Fantasia" consumia 277px porque texto
  // livre sem teto estica a coluna. Daí o `max-w-*` + `truncate` nas três de
  // texto — com `title` para o valor inteiro ficar acessível no hover.
  const columns = [
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }: { row: { original: { status: string } } }) => (
        <StatusBadge variant={PRE_REGISTRATION_STATUS_VARIANT[row.original.status] ?? "default"}>
          {PRE_REGISTRATION_STATUS_LABELS[row.original.status] ?? row.original.status}
        </StatusBadge>
      ),
    },
    {
      accessorKey: "tradeName",
      header: "Nome Fantasia",
      cell: ({ row }: { row: { original: { tradeName: string } } }) => (
        <span className="block max-w-[14rem] truncate" title={row.original.tradeName}>
          {row.original.tradeName}
        </span>
      ),
    },
    {
      id: "tipo",
      header: "Tipo",
      // Tipo inferido pela presença de documento (ADR 0050): sem CPF = NO-KYC.
      cell: ({ row }: { row: { original: { ownerCpf: string | null } } }) => (
        <StatusBadge variant={row.original.ownerCpf ? "default" : "info"}>
          {row.original.ownerCpf ? "KYC" : "NO-KYC"}
        </StatusBadge>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Data",
      cell: ({ row }: { row: { original: { createdAt: string | Date } } }) =>
        new Date(row.original.createdAt).toLocaleDateString("pt-BR"),
    },
    {
      accessorKey: "ownerName",
      header: "Responsavel",
      cell: ({ row }: { row: { original: { ownerName: string } } }) => (
        <span className="block max-w-[12rem] truncate" title={row.original.ownerName}>
          {row.original.ownerName}
        </span>
      ),
    },
    {
      accessorKey: "ownerEmail",
      header: "Email",
      cell: ({ row }: { row: { original: { ownerEmail: string } } }) => (
        <span className="block max-w-[14rem] truncate" title={row.original.ownerEmail}>
          {row.original.ownerEmail}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }: { row: { original: { id: string } } }) => (
        <Button size="sm" variant="ghost" onClick={() => router.push(`/admin/pre-registrations/${row.original.id}`)}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Input
          placeholder="Buscar..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="max-w-sm"
        />
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(0); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="PENDING">Pendente</SelectItem>
            <SelectItem value="APPROVED">Aprovado</SelectItem>
            <SelectItem value="REJECTED">Rejeitado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {listQuery.data ? (
        listQuery.data.data.length === 0 ? (
          <EmptyState icon={UserPlus} title="Nenhum pre-cadastro" description="Nenhuma solicitacao" />
        ) : (
          <DataTable
            columns={columns}
            data={listQuery.data.data}
            pageCount={listQuery.data.pageCount}
            pageIndex={page}
            onPageChange={setPage}
          />
        )
      ) : (
        <Skeleton className="h-96" />
      )}
    </div>
  );
}
