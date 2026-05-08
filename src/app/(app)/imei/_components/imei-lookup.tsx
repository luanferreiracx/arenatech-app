"use client";

import { useState } from "react";
import {
  Search,
  Smartphone,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/domain/status-badge";
import { DataTable } from "@/components/domain/data-table/data-table";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import type { ColumnDef } from "@tanstack/react-table";
import type { ImeiResult } from "@/lib/validators/imei";

interface ImeiQueryRow {
  id: string;
  imei: string;
  status: string;
  result: unknown;
  errorMessage: string | null;
  createdAt: Date;
}

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  success: "Sucesso",
  error: "Erro",
};

function getStatusVariant(status: string) {
  const map: Record<string, "default" | "success" | "warning" | "destructive"> = {
    pending: "warning",
    success: "success",
    error: "destructive",
  };
  return map[status] ?? "default";
}

export function ImeiLookup() {
  const trpc = useTRPC();
  const [imei, setImei] = useState("");
  const [result, setResult] = useState<ImeiResult | null>(null);
  const [page, setPage] = useState(0);

  const { data: quota } = useQuery(trpc.imei.getQuota.queryOptions());

  const { data: history, refetch: refetchHistory } = useQuery(
    trpc.imei.history.queryOptions({ page, pageSize: 10 }),
  );

  const queryMutation = useMutation(
    trpc.imei.query.mutationOptions({
      onSuccess: (data) => {
        const parsed = data.result as ImeiResult | null;
        if (parsed) {
          setResult(parsed);
        }
        void refetchHistory();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = imei.replace(/\D/g, "");
    if (cleaned.length !== 15) {
      toast.error("IMEI deve ter 15 dígitos");
      return;
    }
    setResult(null);
    queryMutation.mutate({ imei: cleaned });
  }

  const historyColumns: ColumnDef<ImeiQueryRow>[] = [
    {
      accessorKey: "imei",
      header: "IMEI",
      cell: ({ row }) => <span className="font-mono text-sm">{row.getValue("imei")}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status") as string;
        return (
          <StatusBadge variant={getStatusVariant(status)}>
            {statusLabels[status] ?? status}
          </StatusBadge>
        );
      },
    },
    {
      id: "device",
      header: "Dispositivo",
      cell: ({ row }) => {
        const res = row.original.result as ImeiResult | null;
        if (!res) return "—";
        return `${res.brand} ${res.model}`;
      },
    },
    {
      id: "blacklisted",
      header: "Blacklist",
      cell: ({ row }) => {
        const res = row.original.result as ImeiResult | null;
        if (!res) return "—";
        return res.blacklisted ? (
          <Badge variant="destructive">Sim</Badge>
        ) : (
          <Badge variant="secondary">Não</Badge>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "Data",
      cell: ({ row }) =>
        (row.getValue("createdAt") as Date).toLocaleString("pt-BR"),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Quota indicator */}
      {quota && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Search className="h-4 w-4" />
          <span>
            {quota.used}/{quota.limit} consultas usadas este mês
          </span>
          {quota.used >= quota.limit && (
            <Badge variant="destructive" className="ml-2">
              Limite atingido
            </Badge>
          )}
        </div>
      )}

      {/* IMEI Input */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <div className="flex-1">
              <Input
                placeholder="Digite o IMEI (15 dígitos)"
                value={imei}
                onChange={(e) => setImei(e.target.value.replace(/\D/g, "").slice(0, 15))}
                className="text-lg font-mono tracking-wider h-12"
                maxLength={15}
              />
            </div>
            <Button
              type="submit"
              size="lg"
              disabled={queryMutation.isPending || imei.replace(/\D/g, "").length !== 15}
            >
              {queryMutation.isPending ? "Consultando..." : "Consultar"}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground mt-2">
            Dica: Disque *#06# no dispositivo para visualizar o IMEI
          </p>
        </CardContent>
      </Card>

      {/* Result */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Resultado da Consulta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Device Info */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground">Dispositivo</h4>
                <div className="space-y-1">
                  <p className="text-lg font-semibold">
                    {result.brand} {result.model}
                  </p>
                  <p className="text-sm font-mono text-muted-foreground">IMEI: {result.imei}</p>
                  {result.serial && (
                    <p className="text-sm font-mono text-muted-foreground">Serial: {result.serial}</p>
                  )}
                  <p className="text-sm text-muted-foreground">Operadora: {result.carrier}</p>
                </div>
              </div>

              {/* Blacklist Status */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground">Segurança</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {result.blacklisted ? (
                      <>
                        <ShieldAlert className="h-5 w-5 text-destructive" />
                        <span className="text-destructive font-medium">Blacklist: Bloqueado</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-5 w-5 text-success" />
                        <span className="text-success font-medium">Blacklist: Limpo</span>
                      </>
                    )}
                  </div>
                  {result.icloudLock !== undefined && (
                    <div className="flex items-center gap-2">
                      {result.icloudLock ? (
                        <>
                          <AlertTriangle className="h-4 w-4 text-warning" />
                          <span className="text-sm">iCloud: Bloqueado</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-success" />
                          <span className="text-sm">iCloud: Desbloqueado</span>
                        </>
                      )}
                    </div>
                  )}
                  {result.activationStatus && (
                    <p className="text-sm text-muted-foreground">
                      Ativação: {result.activationStatus}
                    </p>
                  )}
                </div>
              </div>

              {/* Warranty */}
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground">Garantia</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {result.warranty.status === "active" ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-success" />
                        <span className="font-medium text-success">Ativa</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-5 w-5 text-muted-foreground" />
                        <span className="font-medium">Expirada</span>
                      </>
                    )}
                  </div>
                  {result.warranty.expiry && (
                    <p className="text-sm text-muted-foreground">
                      Expira em: {new Date(result.warranty.expiry).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* History */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Histórico de Consultas</h3>
        <DataTable
          columns={historyColumns}
          data={(history?.items as ImeiQueryRow[]) ?? []}
          pageCount={history?.pageCount ?? 0}
          pageIndex={page}
          pageSize={10}
          onPageChange={setPage}
          emptyMessage="Nenhuma consulta realizada ainda."
        />
      </div>
    </div>
  );
}
