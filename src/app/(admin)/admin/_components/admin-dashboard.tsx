"use client";

import {
  Building2,
  Users,
  Clock,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  CalendarClock,
} from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function AdminDashboard() {
  const trpc = useTRPC();
  const statsQuery = useQuery(trpc.admin.dashboard.queryOptions());
  const stats = statsQuery.data;

  if (!stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
      </div>
    );
  }

  const mrr = (stats.mrrCents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  return (
    <div className="space-y-4">
    {/* Negócio: receita e saúde das assinaturas (dado já existia, não era agregado) */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <TrendingUp className="h-8 w-8 text-success" />
          <div>
            <p className="text-2xl font-bold tabular-nums">{mrr}</p>
            <p className="text-xs text-muted-foreground">MRR (receita mensal)</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <CreditCard className="h-8 w-8 text-primary" />
          <div>
            <p className="text-2xl font-bold tabular-nums">{stats.activeSubscriptions}</p>
            <p className="text-xs text-muted-foreground">Assinaturas ativas</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <div>
            <p className="text-2xl font-bold tabular-nums">
              {stats.pastDueSubscriptions + stats.suspendedSubscriptions}
            </p>
            <p className="text-xs text-muted-foreground">Vencidas / suspensas</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <CalendarClock className="h-8 w-8 text-warning" />
          <div>
            <p className="text-2xl font-bold tabular-nums">{stats.expiringSoon}</p>
            <p className="text-xs text-muted-foreground">Vencendo em 7 dias</p>
          </div>
        </CardContent>
      </Card>
    </div>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <Building2 className="h-8 w-8 text-primary" />
          <div>
            <p className="text-2xl font-bold">{stats.tenantCount}</p>
            <p className="text-xs text-muted-foreground">Tenants</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <Users className="h-8 w-8 text-blue-500" />
          <div>
            <p className="text-2xl font-bold">{stats.userCount}</p>
            <p className="text-xs text-muted-foreground">Usuarios</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <Clock className="h-8 w-8 text-yellow-500" />
          <div>
            <p className="text-2xl font-bold">{stats.pendingPreRegs}</p>
            <p className="text-xs text-muted-foreground">Pre-cadastros Pendentes</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <CreditCard className="h-8 w-8 text-green-500" />
          <div>
            <p className="text-2xl font-bold">{stats.activePlans}</p>
            <p className="text-xs text-muted-foreground">Planos Ativos</p>
          </div>
        </CardContent>
      </Card>
    </div>
    </div>
  );
}
