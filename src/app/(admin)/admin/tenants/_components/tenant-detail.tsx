"use client";

import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormSection } from "@/components/domain/forms/form-section";
import { LoadingState } from "@/components/domain/loading-state";
import { toast } from "@/lib/toast";
import { updateTenantSchema, type UpdateTenantInput } from "@/lib/validators/admin";

export function TenantDetail({ tenantId }: { tenantId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();

  const tenantQuery = useQuery(trpc.admin.getTenant.queryOptions({ id: tenantId }));
  const plansQuery = useQuery(trpc.admin.listPlans.queryOptions({ status: "ACTIVE" }));
  const updateMutation = useMutation(trpc.admin.updateTenant.mutationOptions());

  const tenant = tenantQuery.data;
  const walletOnlyPlans = plansQuery.data?.filter(
    (plan) => plan.modules.length === 1 && plan.modules[0] === "wallet",
  ) ?? [];
  const hasCurrentPlanInOptions = tenant?.plan
    ? walletOnlyPlans.some((plan) => plan.id === tenant.plan)
    : true;

  const form = useForm<UpdateTenantInput>({
    resolver: zodResolver(updateTenantSchema),
    values: tenant ? { id: tenant.id, name: tenant.name, status: tenant.status as UpdateTenantInput["status"], plan: tenant.plan } : undefined,
  });
  const tenantStatus = useWatch({ control: form.control, name: "status" });
  const tenantPlan = useWatch({ control: form.control, name: "plan" });

  if (tenantQuery.isLoading) return <LoadingState />;
  if (!tenant) return <p className="text-muted-foreground">Tenant nao encontrado</p>;

  const onSubmit = (data: UpdateTenantInput) => {
    updateMutation.mutate(data, {
      onSuccess: () => {
        toast.success("Tenant atualizado");
        queryClient.invalidateQueries({ queryKey: trpc.admin.getTenant.queryKey({ id: tenantId }) });
      },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormSection title="Dados do Tenant">
          <div className="space-y-4">
            <div><Label>Nome</Label><Input {...form.register("name")} /></div>
            <div>
              <Label>Status</Label>
              <Select value={tenantStatus} onValueChange={(v) => form.setValue("status", v as UpdateTenantInput["status"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Ativo</SelectItem>
                  <SelectItem value="PENDING">Pendente</SelectItem>
                  <SelectItem value="SUSPENDED">Suspenso</SelectItem>
                  <SelectItem value="CANCELLED">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Plano</Label>
              <Select
                value={tenantPlan ?? "__wallet_only__"}
                onValueChange={(v) => form.setValue("plan", v === "__wallet_only__" ? null : v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__wallet_only__">Sem plano - somente Carteira DePix</SelectItem>
                  {tenant?.plan && !hasCurrentPlanInOptions && (
                    <SelectItem value={tenant.plan}>Plano atual - fora do onboarding wallet-only</SelectItem>
                  )}
                  {walletOnlyPlans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </FormSection>
        <div className="flex gap-2">
          <Button type="submit" disabled={updateMutation.isPending}>Salvar</Button>
          <Button type="button" variant="outline" onClick={() => router.push("/admin/tenants")}>Voltar</Button>
        </div>
      </form>

      {/* Users */}
      <Card>
        <CardHeader><CardTitle>Usuarios</CardTitle></CardHeader>
        <CardContent>
          {tenant.users.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum usuario</p>
          ) : (
            <div className="space-y-2">
              {tenant.users.map((ut) => (
                <div key={ut.userId} className="flex justify-between text-sm border-b pb-2 last:border-0">
                  <span>{ut.user.name}</span>
                  <span className="text-muted-foreground">{ut.user.cpf} | {ut.role}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
