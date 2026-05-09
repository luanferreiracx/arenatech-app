"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Users, Clock, DollarSign } from "lucide-react";
import { PageHeader } from "@/components/domain/page-header";

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function AdminDashboardPage() {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.admin.dashboard.queryOptions());

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <span>Painel Super Admin</span>
            <Badge className="bg-warning text-warning-foreground">SUPER ADMIN</Badge>
          </div>
        }
        subtitle="Visao geral da plataforma Arena Tech SaaS"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.totalTenants ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              {data?.activeTenants ?? 0} ativos | {data?.suspendedTenants ?? 0} suspensos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Usuarios</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.totalUsers ?? 0}</div>
            <p className="text-xs text-muted-foreground">em todos os tenants</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pre-cadastros Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.pendingPreRegistrations ?? 0}</div>
            <p className="text-xs text-muted-foreground">aguardando aprovacao</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita Estimada</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatMoney(data?.estimatedRevenue ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">planos ativos/mes</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
