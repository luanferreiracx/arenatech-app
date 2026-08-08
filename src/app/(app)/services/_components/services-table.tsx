"use client";
import { formatCentsBRL as formatCurrency } from "@/lib/format";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import {
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Plus,
  TrendingUp,
  TrendingDown,
  Copy,
  Type,
  Trash,
} from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DataTable } from "@/components/domain/data-table";
import { DataTableToolbar } from "@/components/domain/data-table/data-table-toolbar";
import { StatusBadge } from "@/components/domain/status-badge";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { Button } from "@/components/ui/button";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast";
import { BulkActionDialog, type BulkAction } from "./bulk-action-dialog";
import { useIsTenantAdmin } from "@/lib/auth/use-tenant-admin";

interface ServiceRow {
  id: string;
  name: string;
  serviceType: string | null;
  deviceModel: string | null;
  description: string | null;
  basePrice: number;
  estimatedTime: string | null;
  active: boolean;
}


export function ServicesManageTable() {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [serviceTypeIdFilter, setServiceTypeIdFilter] = useState<string>("");
  const [deviceModelFilter, setDeviceModelFilter] = useState<string>("");
  // Reajustar/excluir EM MASSA é ação de admin no servidor (auditoria
  // 2026-07-25). Esconder aqui evita o operador clicar e tomar FORBIDDEN.
  const isAdmin = useIsTenantAdmin();
  const [bulkAction, setBulkAction] = useState<{
    action: BulkAction;
    serviceTypeId: string;
    serviceTypeName: string;
  } | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(0);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, []);

  const { data: serviceTypes } = useQuery(
    trpc.catalog.listServiceTypes.queryOptions(),
  );

  const { data: deviceModels } = useQuery(
    trpc.catalog.listDeviceModels.queryOptions(
      serviceTypeIdFilter ? { serviceTypeId: serviceTypeIdFilter } : undefined,
    ),
  );

  const { data, isLoading } = useQuery(
    trpc.catalog.listServices.queryOptions({
      search: debouncedSearch || undefined,
      serviceTypeId: serviceTypeIdFilter || undefined,
      deviceModel: deviceModelFilter || undefined,
      page,
      pageSize,
    }),
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [["catalog"]] });

  const deleteMutation = useMutation(
    trpc.catalog.deleteService.mutationOptions({
      onSuccess: () => {
        toast.success("Servico excluido com sucesso!");
        invalidate();
        setDeleteTarget(null);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const toggleMutation = useMutation(
    trpc.catalog.toggleServiceActive.mutationOptions({
      onSuccess: () => {
        toast.success("Status alterado!");
        invalidate();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const duplicateMutation = useMutation(
    trpc.catalog.duplicateService.mutationOptions({
      onSuccess: (created) => {
        toast.success("Servico duplicado — edite a copia.");
        invalidate();
        router.push(`/services/${created.id}/edit`);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const columns: ColumnDef<ServiceRow>[] = [
    // VAR-3 (varredura final): `Status` nascia fora de vista (tabela de 370px em
    // 270). Serviço inativo não entra na OS — é o que decide se a linha vale.
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => (
        <StatusBadge variant={row.original.active ? "success" : "destructive"}>
          {row.original.active ? "Ativo" : "Inativo"}
        </StatusBadge>
      ),
    },
    {
      accessorKey: "serviceType",
      header: "Tipo de Servico",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.serviceType ?? "-"}</span>
      ),
    },
    {
      accessorKey: "deviceModel",
      header: "Modelo",
      cell: ({ row }) => (
        <span>{row.original.deviceModel ?? "-"}</span>
      ),
    },
    {
      accessorKey: "basePrice",
      header: "Preco",
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium text-success">
          {formatCurrency(row.original.basePrice)}
        </span>
      ),
    },
    {
      accessorKey: "estimatedTime",
      header: "Tempo",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.estimatedTime || "-"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            asChild
            aria-label={`Editar servico ${row.original.name}`}
          >
            <Link href={`/services/${row.original.id}/edit`}>
              <Pencil className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={duplicateMutation.isPending}
            onClick={() => duplicateMutation.mutate({ id: row.original.id })}
            title="Duplicar"
            aria-label={`Duplicar servico ${row.original.name}`}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => toggleMutation.mutate({ id: row.original.id })}
            title={row.original.active ? "Desativar" : "Ativar"}
            aria-label={
              row.original.active
                ? `Desativar servico ${row.original.name}`
                : `Ativar servico ${row.original.name}`
            }
          >
            {row.original.active ? (
              <ToggleRight className="h-4 w-4 text-success" />
            ) : (
              <ToggleLeft className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            aria-label={`Excluir servico ${row.original.name}`}
            onClick={() => setDeleteTarget(row.original.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const tipos = serviceTypes ?? [];
  const tipoSelecionado = tipos.find((t) => t.id === serviceTypeIdFilter) ?? null;

  return (
    <>
      <DataTable
        columns={columns}
        data={(data?.data ?? []) as ServiceRow[]}
        pageCount={data?.pageCount ?? 0}
        pageIndex={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(0);
        }}
        isLoading={isLoading}
        emptyMessage="Nenhum servico encontrado."
        toolbar={
          <div className="flex flex-wrap items-center gap-3 w-full">
            <div className="flex-1 min-w-[200px]">
              <DataTableToolbar
                searchValue={search}
                onSearchChange={handleSearchChange}
                searchPlaceholder="Buscar servico..."
              />
            </div>

            <Select
              value={serviceTypeIdFilter}
              onValueChange={(v) => {
                setServiceTypeIdFilter(v === "__all__" ? "" : v);
                setDeviceModelFilter("");
                setPage(0);
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os tipos</SelectItem>
                {serviceTypes?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={deviceModelFilter}
              onValueChange={(v) => {
                setDeviceModelFilter(v === "__all__" ? "" : v);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Modelo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os modelos</SelectItem>
                {deviceModels?.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Bulk actions dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={tipos.length === 0}>
                  Acoes em Massa
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {tipoSelecionado && (
                  <>
                    {isAdmin && (
                      <>
                    <DropdownMenuItem
                      onClick={() =>
                        setBulkAction({
                          action: "adjust-up",
                          serviceTypeId: serviceTypeIdFilter,
                          serviceTypeName: tipoSelecionado?.name ?? "",
                        })
                      }
                    >
                      <TrendingUp className="mr-2 h-4 w-4" />
                      Aumentar valores ({tipoSelecionado?.name})
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        setBulkAction({
                          action: "adjust-down",
                          serviceTypeId: serviceTypeIdFilter,
                          serviceTypeName: tipoSelecionado?.name ?? "",
                        })
                      }
                    >
                      <TrendingDown className="mr-2 h-4 w-4" />
                      Diminuir valores ({tipoSelecionado?.name})
                    </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuItem
                      onClick={() =>
                        setBulkAction({
                          action: "duplicate",
                          serviceTypeId: serviceTypeIdFilter,
                          serviceTypeName: tipoSelecionado?.name ?? "",
                        })
                      }
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Duplicar tipo ({tipoSelecionado?.name})
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        setBulkAction({
                          action: "rename",
                          serviceTypeId: serviceTypeIdFilter,
                          serviceTypeName: tipoSelecionado?.name ?? "",
                        })
                      }
                    >
                      <Type className="mr-2 h-4 w-4" />
                      Renomear tipo ({tipoSelecionado?.name})
                    </DropdownMenuItem>
                    {isAdmin && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() =>
                            setBulkAction({
                          action: "delete-type",
                          serviceTypeId: serviceTypeIdFilter,
                          serviceTypeName: tipoSelecionado?.name ?? "",
                        })
                          }
                        >
                          <Trash className="mr-2 h-4 w-4" />
                          Excluir tipo ({tipoSelecionado?.name})
                        </DropdownMenuItem>
                      </>
                    )}
                  </>
                )}
                {!tipoSelecionado && (
                  <DropdownMenuItem disabled>
                    Selecione um tipo para acoes em massa
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button asChild>
              <Link href="/services/new">
                <Plus className="mr-2 h-4 w-4" />
                Novo Servico
              </Link>
            </Button>
          </div>
        }
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Excluir Servico"
        description="Tem certeza que deseja excluir este servico? Esta acao nao pode ser desfeita."
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate({ id: deleteTarget });
        }}
      />

      <BulkActionDialog
        action={bulkAction}
        onClose={() => setBulkAction(null)}
      />
    </>
  );
}
