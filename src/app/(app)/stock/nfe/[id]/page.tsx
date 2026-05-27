"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  PackagePlus,
  Trash2,
  AlertCircle,
  XCircle,
  Link2,
  Link2Off,
} from "lucide-react";
import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/domain/status-badge";
import { LoadingState } from "@/components/domain/loading-state";
import { EntitySelector } from "@/components/domain/entity-selector";
import { toast } from "@/lib/toast";

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatNumber(n: unknown): number {
  if (typeof n === "number") return n;
  if (typeof n === "string") return Number(n);
  return 0;
}

const ITEM_STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "default"> = {
  PENDING: "warning",
  LINKED: "success",
  IGNORED: "default",
  IMPORTED: "success",
};
const ITEM_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  LINKED: "Vinculado",
  IGNORED: "Ignorado",
  IMPORTED: "Importado",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function NfeDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const detailQuery = useQuery(trpc.nfeImport.getById.queryOptions({ id }));

  const linkMutation = useMutation(
    trpc.nfeImport.linkItem.mutationOptions({
      onSuccess: () => {
        toast.success("Item vinculado");
        queryClient.invalidateQueries({ queryKey: trpc.nfeImport.getById.queryKey({ id }) });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const unlinkMutation = useMutation(
    trpc.nfeImport.unlinkItem.mutationOptions({
      onSuccess: () => {
        toast.success("Item desvinculado");
        queryClient.invalidateQueries({ queryKey: trpc.nfeImport.getById.queryKey({ id }) });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const ignoreMutation = useMutation(
    trpc.nfeImport.ignoreItem.mutationOptions({
      onSuccess: () => {
        toast.success("Item ignorado");
        queryClient.invalidateQueries({ queryKey: trpc.nfeImport.getById.queryKey({ id }) });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const importMutation = useMutation(
    trpc.nfeImport.importToInventory.mutationOptions({
      onSuccess: () => {
        toast.success("NF-e importada para o estoque");
        queryClient.invalidateQueries({ queryKey: trpc.nfeImport.getById.queryKey({ id }) });
        router.push("/stock/nfe");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  if (detailQuery.isLoading) return <LoadingState />;
  if (!detailQuery.data)
    return <div className="text-center py-12 text-muted-foreground">NF-e nao encontrada</div>;

  const nf = detailQuery.data as Record<string, unknown>;
  const items = (nf.items ?? []) as Array<Record<string, unknown>>;
  const pendingCount = items.filter((i) => i.status === "PENDING").length;
  const linkedCount = items.filter((i) => i.status === "LINKED").length;
  const ignoredCount = items.filter((i) => i.status === "IGNORED").length;
  const canImport = nf.status === "PENDING" && pendingCount === 0 && linkedCount > 0;
  const isLocked = nf.status === "PROCESSED" || nf.status === "CANCELLED";

  return (
    <div>
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild aria-label="Voltar para lista de NF-e">
              <Link href="/stock/nfe">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <span>NF-e {nf.nfNumber as string}</span>
            <StatusBadge
              variant={
                nf.status === "PROCESSED"
                  ? "success"
                  : nf.status === "ERROR" || nf.status === "CANCELLED"
                    ? "destructive"
                    : "warning"
              }
            >
              {nf.status === "PROCESSED"
                ? "Importada"
                : nf.status === "ERROR"
                  ? "Erro"
                  : nf.status === "CANCELLED"
                    ? "Cancelada"
                    : "Pendente"}
            </StatusBadge>
          </div>
        }
        actions={
          canImport ? (
            <Button onClick={() => importMutation.mutate({ nfeImportId: id })} disabled={importMutation.isPending}>
              <PackagePlus className="mr-2 h-4 w-4" />
              Importar para o estoque
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4 mb-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Emissor</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p className="font-medium">{nf.issuerName as string}</p>
            {(nf.issuerTradeName as string | null) && (
              <p className="text-muted-foreground text-xs">{nf.issuerTradeName as string}</p>
            )}
            <p className="text-xs text-muted-foreground">CNPJ {nf.issuerCnpj as string}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Resumo</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Itens</span>
              <span>{items.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor dos produtos</span>
              <span>{formatCurrency(formatNumber(nf.totalProductsValue))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Frete</span>
              <span>{formatCurrency(formatNumber(nf.freightValue))}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Vinculacao</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-yellow-500">Pendentes</span>
              <span>{pendingCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-green-500">Vinculados</span>
              <span>{linkedCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ignorados</span>
              <span>{ignoredCount}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Itens da NF-e</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-primary/20 bg-muted/50">
                <th className="text-left px-2 py-2 font-semibold uppercase text-xs">#</th>
                <th className="text-left px-2 py-2 font-semibold uppercase text-xs">Descricao XML</th>
                <th className="text-right px-2 py-2 font-semibold uppercase text-xs">Qtd</th>
                <th className="text-right px-2 py-2 font-semibold uppercase text-xs">Valor</th>
                <th className="text-left px-2 py-2 font-semibold uppercase text-xs w-72">
                  Produto vinculado
                </th>
                <th className="text-left px-2 py-2 font-semibold uppercase text-xs">Status</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const itemId = item.id as string;
                const linked = item.status === "LINKED" || item.status === "IMPORTED";
                return (
                  <tr key={itemId} className="border-b border-border align-top">
                    <td className="px-2 py-2 text-muted-foreground">{item.itemNumber as number}</td>
                    <td className="px-2 py-2">
                      <div className="font-medium">{item.description as string}</div>
                      <div className="text-xs text-muted-foreground">
                        NCM {(item.ncm as string) ?? "-"}
                        {item.brand ? ` — ${item.brand as string}` : ""}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right">{item.quantity as number}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatCurrency(formatNumber(item.totalValue))}
                    </td>
                    <td className="px-2 py-2">
                      {linked ? (
                        <span className="text-green-500">
                          {(item.productName as string | null) ?? "Vinculado"}
                        </span>
                      ) : item.status === "IGNORED" ? (
                        <span className="text-muted-foreground text-xs italic">Ignorado</span>
                      ) : isLocked ? (
                        <span className="text-muted-foreground text-xs">-</span>
                      ) : (
                        <EntitySelector
                          value=""
                          onChange={() => {}}
                          onSelect={(p) =>
                            linkMutation.mutate({
                              itemId,
                              productId: (p as { id: string }).id,
                            })
                          }
                          searchFn={async (search) => {
                            return queryClient.fetchQuery(
                              trpc.stock.searchProducts.queryOptions({ search }),
                            ) as Promise<{ id: string; name: string; sku: string | null }[]>;
                          }}
                          getOptionLabel={(p) =>
                            `${(p as { name: string }).name}${
                              (p as { sku: string | null }).sku ? ` — ${(p as { sku: string }).sku}` : ""
                            }`
                          }
                          getOptionValue={(p) => (p as { id: string }).id}
                          placeholder="Buscar produto..."
                        />
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <StatusBadge variant={ITEM_STATUS_VARIANT[item.status as string] ?? "default"}>
                        {ITEM_STATUS_LABEL[item.status as string] ?? (item.status as string)}
                      </StatusBadge>
                    </td>
                    <td className="px-2 py-2">
                      {!isLocked && (
                        <div className="flex gap-1 justify-end">
                          {linked && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Desvincular item"
                              onClick={() => unlinkMutation.mutate({ itemId })}
                              title="Desvincular"
                            >
                              <Link2Off className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          )}
                          {item.status !== "IGNORED" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Ignorar item"
                              onClick={() => ignoreMutation.mutate({ itemId })}
                              title="Ignorar item"
                            >
                              <XCircle className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
