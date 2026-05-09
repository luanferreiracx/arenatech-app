"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { PageHeader } from "@/components/domain/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { tenantStatusValues, tenantStatusLabels } from "@/lib/validators/admin";
import { ArrowLeft } from "lucide-react";

function getStatusVariant(status: string) {
  const map: Record<string, "default" | "success" | "warning" | "destructive" | "info"> = {
    PENDING: "warning",
    ACTIVE: "success",
    SUSPENDED: "destructive",
    CANCELLED: "default",
  };
  return map[status] ?? "default";
}

export default function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const trpc = useTRPC();
  const router = useRouter();

  const { data: tenant, isLoading, refetch } = useQuery(
    trpc.admin.getTenant.queryOptions({ id }),
  );

  const statusMutation = useMutation(
    trpc.admin.updateTenantStatus.mutationOptions({
      onSuccess: () => {
        toast.success("Status atualizado!");
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  if (isLoading) return <LoadingState variant="card" />;
  if (!tenant) return <p>Tenant nao encontrado</p>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={tenant.name}
        subtitle={`Slug: ${tenant.slug}`}
        actions={
          <Button variant="outline" size="sm" onClick={() => router.push("/admin/tenants")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Informacoes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">CNPJ</span>
              <span>{tenant.cnpj ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plano</span>
              <span>{tenant.plan ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Criado em</span>
              <span>{new Date(tenant.createdAt).toLocaleDateString("pt-BR")}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Status</span>
              <StatusBadge variant={getStatusVariant(tenant.status)}>
                {tenantStatusLabels[tenant.status] ?? tenant.status}
              </StatusBadge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alterar Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select
              value={tenant.status}
              onValueChange={(v) =>
                statusMutation.mutate({ id, status: v as typeof tenantStatusValues[number] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tenantStatusValues.map((s) => (
                  <SelectItem key={s} value={s}>
                    {tenantStatusLabels[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usuarios ({tenant.users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {tenant.users.length === 0 ? (
            <p className="text-muted-foreground">Nenhum usuario</p>
          ) : (
            <div className="divide-y">
              {tenant.users.map((ut) => (
                <div key={ut.userId} className="py-2 flex justify-between">
                  <div>
                    <p className="font-medium">{ut.user.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {ut.user.cpf} | {ut.user.email ?? "sem email"}
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground">{ut.role}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
