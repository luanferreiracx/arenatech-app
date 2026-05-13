"use client";

import { useState } from "react";
import { Search, Smartphone, Shield, AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/domain/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";

export function ImeiConsult() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [imei, setImei] = useState("");
  const [result, setResult] = useState<{
    imei: string;
    brand: string;
    model: string;
    blacklisted: boolean;
    warranty: { status: string; expiry: string | null };
    carrier: string;
    icloudLock?: string;
  } | null>(null);
  const [page, setPage] = useState(0);

  const queryMutation = useMutation(trpc.imei.query.mutationOptions());

  const historyQuery = useQuery(
    trpc.imei.history.queryOptions({ page, pageSize: 10 }),
  );

  const quotaQuery = useQuery(trpc.imei.getQuota.queryOptions());

  const handleSearch = () => {
    const cleaned = imei.replace(/\D/g, "");
    if (cleaned.length !== 15) {
      toast.error("IMEI deve ter 15 digitos");
      return;
    }

    queryMutation.mutate(
      { imei: cleaned },
      {
        onSuccess: (data) => {
          setResult(data as unknown as typeof result);
          queryClient.invalidateQueries({ queryKey: trpc.imei.history.queryKey() });
          queryClient.invalidateQueries({ queryKey: trpc.imei.getQuota.queryKey() });
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const quota = quotaQuery.data;

  const historyColumns = [
    { accessorKey: "imei", header: "IMEI" },
    {
      accessorKey: "result",
      header: "Dispositivo",
      cell: ({ row }: { row: { original: { result: unknown } } }) => {
        const r = row.original.result as Record<string, unknown> | null;
        if (!r) return "-";
        return `${r.brand ?? ""} ${r.model ?? ""}`;
      },
    },
    { accessorKey: "status", header: "Status" },
    {
      accessorKey: "createdAt",
      header: "Data",
      cell: ({ row }: { row: { original: { createdAt: string | Date } } }) =>
        new Date(row.original.createdAt).toLocaleDateString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Input
              value={imei}
              onChange={(e) => setImei(e.target.value.replace(/\D/g, "").slice(0, 15))}
              placeholder="Digite o IMEI (15 digitos)"
              className="flex-1 text-lg font-mono"
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={queryMutation.isPending}>
              <Search className="mr-2 h-4 w-4" />
              {queryMutation.isPending ? "Consultando..." : "Consultar"}
            </Button>
          </div>
          {quota && (
            <p className="text-xs text-muted-foreground mt-2">
              Consultas: {quota.usedCount}/{quota.monthlyLimit} este mes
            </p>
          )}
        </CardContent>
      </Card>

      {/* Result */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              {result.brand} {result.model}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Blacklist:</span>
                {result.blacklisted ? (
                  <span className="flex items-center gap-1 text-destructive font-medium">
                    <XCircle className="h-4 w-4" /> Sim
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-green-500 font-medium">
                    <CheckCircle className="h-4 w-4" /> Nao
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Garantia:</span>
                <span className={`font-medium ${result.warranty.status === "active" ? "text-green-500" : "text-yellow-500"}`}>
                  {result.warranty.status === "active" ? "Ativa" : "Expirada"}
                  {result.warranty.expiry && ` (ate ${new Date(result.warranty.expiry).toLocaleDateString("pt-BR")})`}
                </span>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Operadora: </span>
                <span className="font-medium">{result.carrier}</span>
              </div>
              {result.icloudLock !== undefined && (
                <div className="flex items-center gap-2">
                  {result.icloudLock === "ON" ? (
                    <span className="flex items-center gap-1 text-destructive font-medium">
                      <AlertTriangle className="h-4 w-4" /> iCloud: Ativado
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-green-500 font-medium">
                      <CheckCircle className="h-4 w-4" /> iCloud: Desativado
                    </span>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>Historico de Consultas</CardTitle>
        </CardHeader>
        <CardContent>
          {historyQuery.data ? (
            <DataTable
              columns={historyColumns}
              data={historyQuery.data.data}
              pageCount={historyQuery.data.pageCount}
              pageIndex={page}
              onPageChange={setPage}
            />
          ) : (
            <Skeleton className="h-48" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
