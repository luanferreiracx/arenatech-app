"use client";

import { useState } from "react";
import Link from "next/link";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import {
  CreditCard,
  Plus,
  Eye,
  ShoppingBag,
  Clock,
  CheckCircle,
  DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/domain/page-header";
import { EmptyState } from "@/components/domain/empty-state";
import { LoadingState } from "@/components/domain/loading-state";
import { QUICK_SALE_STATUS_LABELS } from "@/lib/validators/quick-sale";
import type { QuickSaleStatus } from "@/lib/validators/quick-sale";

const STATUS_COLORS: Record<string, string> = {
  AWAITING_PAYMENT: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  PAID: "bg-green-500/10 text-green-500 border-green-500/20",
  CANCELLED: "bg-red-500/10 text-red-500 border-red-500/20",
  REFUNDED: "bg-orange-500/10 text-orange-500 border-orange-500/20",
};

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function QuickSalesPage() {
  const trpc = useTRPC();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const { data: stats } = useQuery(trpc.quickSale.stats.queryOptions());
  const { data, isLoading } = useQuery(
    trpc.quickSale.list.queryOptions({
      search: search || undefined,
      status: (statusFilter || undefined) as QuickSaleStatus | undefined,
      pageSize: 50,
    })
  );

  const sales = data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendas Avulsas (DEPIX)"
        subtitle="Gestao de cobrancas via PIX descentralizado"
        actions={
          <Button asChild>
            <Link href="/quick-sales/new">
              <Plus className="w-4 h-4 mr-2" />
              Nova Venda
            </Link>
          </Button>
        }
      />

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <ShoppingBag className="h-8 w-8 text-blue-500 opacity-60" />
              <div>
                <p className="text-xs text-muted-foreground">Total de Vendas</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="h-8 w-8 text-yellow-500 opacity-60" />
              <div>
                <p className="text-xs text-muted-foreground">Aguardando</p>
                <p className="text-2xl font-bold">{stats.awaiting}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-500 opacity-60" />
              <div>
                <p className="text-xs text-muted-foreground">Pagas</p>
                <p className="text-2xl font-bold">{stats.paid}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <DollarSign className="h-8 w-8 text-purple-500 opacity-60" />
              <div>
                <p className="text-xs text-muted-foreground">Valor Total Pago</p>
                <p className="text-xl font-bold">{formatCurrency(stats.totalPaidAmount)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          placeholder="Buscar por nome, CPF, descricao..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(QUICK_SALE_STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <LoadingState />
      ) : sales.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Nenhuma venda avulsa encontrada"
          description="Crie uma nova venda para gerar cobranca PIX."
          action={
            <Button asChild>
              <Link href="/quick-sales/new">
                <Plus className="w-4 h-4 mr-2" />
                Nova Venda
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{data?.total ?? 0} vendas</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numero</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Pagador</TableHead>
                  <TableHead>CPF/CNPJ</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((sale: Record<string, unknown>) => {
                  const status = sale.status as string;
                  const cpf = sale.cpfCnpj as string | null;
                  return (
                    <TableRow key={sale.id as string}>
                      <TableCell className="font-mono font-semibold">{sale.number as string}</TableCell>
                      <TableCell className="text-sm">
                        {new Date(sale.createdAt as string).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell className="font-medium">{(sale.buyerName as string) || "-"}</TableCell>
                      <TableCell className="font-mono text-sm">{cpf || "-"}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(sale.totalAmount as number)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_COLORS[status] ?? ""}>
                          {QUICK_SALE_STATUS_LABELS[status] ?? status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/quick-sales/${sale.id}`}>
                            <Eye className="w-4 h-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
