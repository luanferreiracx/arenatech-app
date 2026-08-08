"use client";

import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/domain/status-badge";

export function AdminReports() {
  const trpc = useTRPC();
  const reportsQuery = useQuery(trpc.admin.reports.queryOptions());
  const tenants = reportsQuery.data;

  if (!tenants) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Tenants por Status</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b">
                {/* ADM-1: `Status` começava em 391px numa área de 270 a 320px.
                    Num relatório chamado "Tenants por Status", era a coluna que
                    dá nome ao quadro e a única que não se via. */}
                <th className="text-left py-2">Status</th>
                <th className="text-left py-2">Nome</th>
                <th className="text-left py-2">Plano</th>
                <th className="text-right py-2">Usuarios</th>
                <th className="text-left py-2">Responsavel</th>
                <th className="text-left py-2">Slug</th>
                <th className="text-right py-2">Criado em</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="py-2">
                    <StatusBadge variant={t.status === "ACTIVE" ? "success" : t.status === "SUSPENDED" ? "destructive" : "warning"}>
                      {t.status}
                    </StatusBadge>
                  </td>
                  <td className="py-2 font-medium">
                    <span className="block max-w-[12rem] truncate" title={t.name}>{t.name}</span>
                  </td>
                  <td className="py-2">{t.plan ?? "-"}</td>
                  <td className="py-2 text-right">{t.userCount}</td>
                  <td className="py-2">
                    {t.owner ? (
                      <div className="min-w-0 max-w-[12rem]">
                        <p className="truncate">{t.owner.name}</p>
                        {t.owner.email && <p className="truncate text-xs text-muted-foreground">{t.owner.email}</p>}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-2 text-muted-foreground">{t.slug}</td>
                  <td className="py-2 text-right">{new Date(t.createdAt).toLocaleDateString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
