"use client";

import { useState } from "react";
import Link from "next/link";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/domain/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingState } from "@/components/domain/loading-state";
import { toast } from "@/lib/toast";
import { useRouter } from "next/navigation";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  PROCESSING: "Processando",
  PROCESSED: "Importada",
  ERROR: "Erro",
  CANCELLED: "Cancelada",
};
const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "default"> = {
  PENDING: "warning",
  PROCESSING: "default",
  PROCESSED: "success",
  ERROR: "destructive",
  CANCELLED: "destructive",
};

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("pt-BR");
}

export default function NfeImportListPage() {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const listQuery = useQuery(
    trpc.nfeImport.list.queryOptions({ search, status: status as never }),
  );
  const data = listQuery.data?.data ?? [];

  const processMutation = useMutation(
    trpc.nfeImport.processXml.mutationOptions({
      onSuccess: (res) => {
        toast.success("XML processado");
        queryClient.invalidateQueries({ queryKey: trpc.nfeImport.list.queryKey() });
        router.push(`/stock/nfe/${res.id}`);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const processFile = async (file: File) => {
    setUploading(true);
    try {
      const xmlContent = await file.text();
      processMutation.mutate({ xmlContent });
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!/\.xml$/i.test(file.name)) {
      toast.error("Selecione um arquivo .xml");
      return;
    }
    processFile(file);
  };

  return (
    <div>
      <PageHeader
        title="Importacao de NF-e"
        subtitle="Upload de XML para registrar entradas de estoque"
        actions={
          <Button variant="outline" asChild>
            <Link href="/stock">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Importar nova NF-e
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              isDragging ? "border-primary bg-primary/5" : "border-border"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <Upload
              className={`h-10 w-10 mx-auto mb-3 ${isDragging ? "text-primary" : "text-muted-foreground"}`}
            />
            <p className="text-sm text-muted-foreground mb-3">
              {isDragging ? "Solte o XML aqui" : "Arraste o XML da NF-e ou clique para selecionar"}
            </p>
            <input
              type="file"
              accept=".xml"
              className="mx-auto"
              disabled={uploading || processMutation.isPending}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) processFile(f);
              }}
            />
            {(uploading || processMutation.isPending) && (
              <p className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Processando XML...
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-48">
              <Label className="text-xs">Buscar</Label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Numero, CNPJ ou nome do emissor..."
              />
            </div>
            <div className="w-44">
              <Label className="text-xs">Status</Label>
              <Select value={status ?? "all"} onValueChange={(v) => setStatus(v === "all" ? undefined : v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="PENDING">Pendente</SelectItem>
                  <SelectItem value="PROCESSED">Importada</SelectItem>
                  <SelectItem value="ERROR">Erro</SelectItem>
                  <SelectItem value="CANCELLED">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {listQuery.isLoading ? (
            <LoadingState variant="table" />
          ) : data.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhuma NF-e encontrada
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-sm">
              <thead>
                <tr className="border-b border-primary/20 bg-muted/50">
                  <th className="text-left px-4 py-2 font-semibold uppercase text-xs">Numero</th>
                  <th className="text-left px-4 py-2 font-semibold uppercase text-xs">Emissor</th>
                  <th className="text-left px-4 py-2 font-semibold uppercase text-xs">Data</th>
                  <th className="text-right px-4 py-2 font-semibold uppercase text-xs">Itens</th>
                  <th className="text-right px-4 py-2 font-semibold uppercase text-xs">Total</th>
                  <th className="text-left px-4 py-2 font-semibold uppercase text-xs">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((nf) => (
                  <tr
                    key={nf.id as string}
                    className="border-b border-border hover:bg-muted/30 cursor-pointer"
                    onClick={() => router.push(`/stock/nfe/${nf.id as string}`)}
                  >
                    <td className="px-4 py-2 font-medium">{nf.nfNumber as string}</td>
                    <td className="px-4 py-2">
                      <div>{(nf.issuerName as string) ?? "-"}</div>
                      <div className="text-xs text-muted-foreground">
                        {(nf.issuerCnpj as string) ?? ""}
                      </div>
                    </td>
                    <td className="px-4 py-2">{formatDate(nf.entryDate as string | Date)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{nf.itemCount as number}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatCurrency(nf.totalProductsValue as number)}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge variant={STATUS_VARIANT[nf.status as string] ?? "default"}>
                        {STATUS_LABEL[nf.status as string] ?? (nf.status as string)}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
