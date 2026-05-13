"use client";

import { Building2, Users, Clock, CreditCard } from "lucide-react";
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

  return (
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
  );
}
