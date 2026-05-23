"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/domain/page-header";
import { LoadingState } from "@/components/domain/loading-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Package, BarChart3, AlertTriangle, Download } from "lucide-react";
import { PosicaoEstoqueTab } from "./_components/posicao-estoque-tab";
import { MovimentacoesTab } from "./_components/movimentacoes-tab";
import { CurvaAbcTab } from "./_components/curva-abc-tab";
import { EstoqueMinTab } from "./_components/estoque-min-tab";
import { VendasPeriodoTab } from "./_components/vendas-periodo-tab";
import { VendasProdutoTab } from "./_components/vendas-produto-tab";
import { VendasVendedorTab } from "./_components/vendas-vendedor-tab";
import { UpgradesTab } from "./_components/upgrades-tab";

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

const PDF_TYPE_MAP: Record<string, string> = {
  posicao: "posicao-estoque",
  "estoque-min": "estoque-minimo",
  "vendas-periodo": "vendas-periodo",
  "vendas-produto": "vendas-produto",
  "vendas-vendedor": "vendas-vendedor",
  "curva-abc": "curva-abc",
};

export default function StockReportsPage() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0]!;
  });
  const [dateTo, setDateTo] = useState(
    () => new Date().toISOString().split("T")[0]!,
  );
  const [activeTab, setActiveTab] = useState("posicao");

  const pdfType = PDF_TYPE_MAP[activeTab];
  const pdfUrl = pdfType
    ? `/api/reports/stock/${pdfType}?dateFrom=${dateFrom}&dateTo=${dateTo}`
    : null;

  const trpc = useTRPC();
  const { data: summary, isLoading } = useQuery(
    trpc.stock.reportsSummary.queryOptions({ dateFrom, dateTo }),
  );

  return (
    <div>
      <PageHeader
        title="Relatorios"
        subtitle="Analise de estoque e vendas"
        actions={
          pdfUrl ? (
            <Button variant="outline" asChild>
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                <Download className="mr-2 h-4 w-4" />
                Baixar PDF
              </a>
            </Button>
          ) : null
        }
      />

      {/* Period filter */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Data Inicio</label>
              <input
                type="date"
                className="border rounded-md px-3 py-2 text-sm bg-background"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Data Fim</label>
              <input
                type="date"
                className="border rounded-md px-3 py-2 text-sm bg-background"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      {isLoading ? (
        <LoadingState variant="card" />
      ) : summary ? (
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Vendas no Periodo</CardTitle>
              <ShoppingCart className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.vendas.quantidade}</div>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(summary.vendas.valorTotal)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Entradas Estoque</CardTitle>
              <Package className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.estoque.entradas}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Saidas Estoque</CardTitle>
              <AlertTriangle className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.estoque.saidas}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Upgrades</CardTitle>
              <BarChart3 className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.upgrades}</div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Tabs for each report type */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="posicao">Posicao de Estoque</TabsTrigger>
          <TabsTrigger value="movimentacoes">Movimentacoes</TabsTrigger>
          <TabsTrigger value="curva-abc">Curva ABC</TabsTrigger>
          <TabsTrigger value="estoque-min">Estoque Minimo</TabsTrigger>
          <TabsTrigger value="vendas-periodo">Vendas/Periodo</TabsTrigger>
          <TabsTrigger value="vendas-produto">Vendas/Produto</TabsTrigger>
          <TabsTrigger value="vendas-vendedor">Vendas/Vendedor</TabsTrigger>
          <TabsTrigger value="upgrades">Upgrades</TabsTrigger>
        </TabsList>

        <TabsContent value="posicao">
          <PosicaoEstoqueTab />
        </TabsContent>
        <TabsContent value="movimentacoes">
          <MovimentacoesTab dateFrom={dateFrom} dateTo={dateTo} />
        </TabsContent>
        <TabsContent value="curva-abc">
          <CurvaAbcTab dateFrom={dateFrom} dateTo={dateTo} />
        </TabsContent>
        <TabsContent value="estoque-min">
          <EstoqueMinTab />
        </TabsContent>
        <TabsContent value="vendas-periodo">
          <VendasPeriodoTab dateFrom={dateFrom} dateTo={dateTo} />
        </TabsContent>
        <TabsContent value="vendas-produto">
          <VendasProdutoTab dateFrom={dateFrom} dateTo={dateTo} />
        </TabsContent>
        <TabsContent value="vendas-vendedor">
          <VendasVendedorTab dateFrom={dateFrom} dateTo={dateTo} />
        </TabsContent>
        <TabsContent value="upgrades">
          <UpgradesTab dateFrom={dateFrom} dateTo={dateTo} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
