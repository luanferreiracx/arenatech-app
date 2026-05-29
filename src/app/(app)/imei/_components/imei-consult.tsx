"use client";

import { useState } from "react";
import {
  Search,
  Smartphone,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/domain/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import { isValidDeviceIdentifier } from "@/lib/validators/imei";

interface DeviceResult {
  success: boolean;
  tipoConsulta: "IMEI" | "Serial";
  identificador: string;
  error?: string;
  message?: string;
  infoBasica?: {
    modelo: string | null;
    modeloCodigo: string | null;
    imei: string | null;
    serial: string | null;
    meid: string | null;
    fabricante: string;
  };
  garantia?: {
    status: string | null;
    ativa: boolean;
    dataExpiracao: string | null;
    paisCompra: string | null;
  };
  seguranca?: {
    icloudLock: string;
    bloqueioOperadora: string | null;
    blacklist: string;
    blacklistBloqueado: boolean;
  };
  status?: {
    ativado: string | null;
    recondicionado: string | null;
    appleCareElegivel: string | null;
  };
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span className="text-sm text-muted-foreground">{label}: </span>
      <span className="font-medium">{value ?? "-"}</span>
    </div>
  );
}

export function ImeiConsult() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [identificador, setIdentificador] = useState("");
  const [result, setResult] = useState<DeviceResult | null>(null);
  const [page, setPage] = useState(0);

  const queryMutation = useMutation(trpc.imei.query.mutationOptions());
  const historyQuery = useQuery(trpc.imei.history.queryOptions({ page, pageSize: 10 }));

  const handleSearch = () => {
    const cleaned = identificador.trim().toUpperCase();
    if (!isValidDeviceIdentifier(cleaned)) {
      toast.error("Informe um IMEI (15 digitos) ou Serial Apple (8-17 caracteres)");
      return;
    }
    queryMutation.mutate(
      { identificador: cleaned },
      {
        onSuccess: (data) => {
          setResult(data as unknown as DeviceResult);
          if (!data.success) {
            toast.error(data.message ?? data.error ?? "Consulta sem resultado");
          }
          queryClient.invalidateQueries({ queryKey: trpc.imei.history.queryKey() });
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const historyColumns = [
    { accessorKey: "imei", header: "IMEI / Serial" },
    {
      accessorKey: "result",
      header: "Dispositivo",
      cell: ({ row }: { row: { original: { result: unknown } } }) => {
        const r = row.original.result as { infoBasica?: { modelo?: string | null } } | null;
        return r?.infoBasica?.modelo ?? "-";
      },
    },
    { accessorKey: "status", header: "Status" },
    {
      accessorKey: "createdAt",
      header: "Data",
      cell: ({ row }: { row: { original: { createdAt: string | Date } } }) =>
        new Date(row.original.createdAt).toLocaleDateString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
    },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Input
              value={identificador}
              onChange={(e) => setIdentificador(e.target.value.toUpperCase().slice(0, 17))}
              placeholder="IMEI (15 digitos) ou Serial Apple"
              className="flex-1 text-lg font-mono"
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={queryMutation.isPending}>
              <Search className="mr-2 h-4 w-4" />
              {queryMutation.isPending ? "Consultando..." : "Consultar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Erro de consulta */}
      {result && !result.success && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 flex items-start gap-3">
            <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-destructive">
                {result.error ?? "Consulta sem resultado"}
              </p>
              {result.message && (
                <p className="text-sm text-muted-foreground mt-1">{result.message}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {result?.success && result.infoBasica && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              {result.infoBasica.modelo ?? "Dispositivo"}
              {result.infoBasica.modeloCodigo && (
                <span className="text-sm font-normal text-muted-foreground">
                  ({result.infoBasica.modeloCodigo})
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Info basica */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fabricante" value={result.infoBasica.fabricante} />
              <Field label="Tipo" value={result.tipoConsulta} />
              {result.infoBasica.imei && <Field label="IMEI" value={result.infoBasica.imei} />}
              {result.infoBasica.serial && <Field label="Serial" value={result.infoBasica.serial} />}
              {result.infoBasica.meid && <Field label="MEID" value={result.infoBasica.meid} />}
            </div>

            {/* Garantia */}
            {result.garantia && (
              <div className="border-t pt-4 space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Garantia
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Status:</span>
                    <span className={`font-medium ${result.garantia.ativa ? "text-green-500" : "text-yellow-500"}`}>
                      {result.garantia.status ?? (result.garantia.ativa ? "Ativa" : "Expirada")}
                    </span>
                  </div>
                  {result.garantia.dataExpiracao && (
                    <Field label="Expira em" value={result.garantia.dataExpiracao} />
                  )}
                  {result.garantia.paisCompra && (
                    <Field label="Pais de compra" value={result.garantia.paisCompra} />
                  )}
                </div>
              </div>
            )}

            {/* Seguranca */}
            {result.seguranca && (
              <div className="border-t pt-4 space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Seguranca
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Blacklist:</span>
                    {result.seguranca.blacklistBloqueado ? (
                      <span className="flex items-center gap-1 text-destructive font-medium">
                        <XCircle className="h-4 w-4" /> {result.seguranca.blacklist}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-green-500 font-medium">
                        <CheckCircle className="h-4 w-4" /> Sem restricoes
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">iCloud:</span>
                    {result.seguranca.icloudLock === "Ligado" ? (
                      <span className="flex items-center gap-1 text-destructive font-medium">
                        <AlertTriangle className="h-4 w-4" /> Ligado
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-green-500 font-medium">
                        <CheckCircle className="h-4 w-4" /> Desligado
                      </span>
                    )}
                  </div>
                  <Field label="Operadora" value={result.seguranca.bloqueioOperadora} />
                </div>
              </div>
            )}

            {/* Status do dispositivo */}
            {result.status && (
              <div className="border-t pt-4 space-y-2">
                <h4 className="text-sm font-semibold">Status do dispositivo</h4>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Ativado" value={result.status.ativado} />
                  <Field label="Recondicionado" value={result.status.recondicionado} />
                  <Field label="AppleCare elegivel" value={result.status.appleCareElegivel} />
                </div>
              </div>
            )}
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
