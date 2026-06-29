"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, Loader2, Pencil, Plus, ShieldOff, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { FormSection } from "@/components/domain/forms/form-section";
import { LoadingState } from "@/components/domain/loading-state";
import { CpfInput } from "@/components/inputs/cpf-input";
import { PhoneInput } from "@/components/inputs/phone-input";
import { toast } from "@/lib/toast";
import {
  createTenantUserSchema,
  updateTenantSchema,
  updateTenantUserSchema,
  type CreateTenantUserInput,
  type UpdateTenantInput,
  type UpdateTenantUserInput,
} from "@/lib/validators/admin";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  operator: "Operador",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  operator: "bg-blue-500/10 text-blue-500 border-blue-500/20",
};

type TenantUser = {
  userId: string;
  tenantId: string;
  role: string;
  isTechnician?: boolean;
  isCashier?: boolean;
  user: {
    id: string;
    name: string;
    // NO-KYC não tem CPF (ADR 0050).
    cpf: string | null;
    email: string | null;
    phone: string | null;
    mustChangePassword: boolean;
  };
};

type UserTarget = {
  userId: string;
  name: string;
};

type PasswordResult = UserTarget & {
  tempPassword: string;
};

function formatCpf(cpf: string | null): string {
  if (!cpf) return "—";
  if (cpf.length !== 11) return cpf;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

export function TenantDetail({ tenantId }: { tenantId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editUser, setEditUser] = useState<TenantUser | null>(null);
  const [resetTarget, setResetTarget] = useState<UserTarget | null>(null);
  const [twoFactorTarget, setTwoFactorTarget] = useState<UserTarget | null>(null);
  const [removeTarget, setRemoveTarget] = useState<UserTarget | null>(null);
  const [passwordResult, setPasswordResult] = useState<PasswordResult | null>(null);

  const tenantQuery = useQuery(trpc.admin.getTenant.queryOptions({ id: tenantId }));
  const plansQuery = useQuery(trpc.admin.listPlans.queryOptions({ status: "ACTIVE" }));
  const updateTenantMutation = useMutation(trpc.admin.updateTenant.mutationOptions());
  const createUserMutation = useMutation(trpc.admin.createTenantUser.mutationOptions());
  const updateUserMutation = useMutation(trpc.admin.updateTenantUser.mutationOptions());
  const removeUserMutation = useMutation(trpc.admin.removeTenantUser.mutationOptions());
  const resetPasswordMutation = useMutation(trpc.admin.resetTenantUserPassword.mutationOptions());
  const resetTwoFactorMutation = useMutation(trpc.admin.resetTenantUserTwoFactor.mutationOptions());

  const tenant = tenantQuery.data;
  const walletOnlyPlans = plansQuery.data?.filter(
    (plan) => plan.modules.length === 1 && plan.modules[0] === "wallet",
  ) ?? [];
  const hasCurrentPlanInOptions = tenant?.plan
    ? walletOnlyPlans.some((plan) => plan.id === tenant.plan)
    : true;

  const tenantForm = useForm<UpdateTenantInput>({
    resolver: zodResolver(updateTenantSchema),
    values: tenant ? { id: tenant.id, name: tenant.name, status: tenant.status as UpdateTenantInput["status"], plan: tenant.plan, apiAccessEnabled: tenant.apiAccessEnabled } : undefined,
  });
  const createUserForm = useForm<CreateTenantUserInput>({
    resolver: zodResolver(createTenantUserSchema),
    defaultValues: {
      tenantId,
      name: "",
      cpf: "",
      email: "",
      phone: "",
      role: "operator",
      isTechnician: false,
      isCashier: false,
    },
  });
  const editUserForm = useForm<UpdateTenantUserInput>({
    resolver: zodResolver(updateTenantUserSchema),
    defaultValues: {
      tenantId,
      userId: "",
      name: "",
      email: "",
      phone: "",
      role: "operator",
      isTechnician: false,
      isCashier: false,
    },
  });
  const tenantStatus = useWatch({ control: tenantForm.control, name: "status" });
  const tenantPlan = useWatch({ control: tenantForm.control, name: "plan" });
  const tenantApiAccess = useWatch({ control: tenantForm.control, name: "apiAccessEnabled" });

  if (tenantQuery.isLoading) return <LoadingState />;
  if (!tenant) return <p className="text-muted-foreground">Tenant nao encontrado</p>;

  const invalidateTenant = () =>
    queryClient.invalidateQueries({ queryKey: trpc.admin.getTenant.queryKey({ id: tenantId }) });

  const onTenantSubmit = (data: UpdateTenantInput) => {
    updateTenantMutation.mutate(data, {
      onSuccess: () => {
        toast.success("Tenant atualizado");
        invalidateTenant();
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const onCreateUser = (data: CreateTenantUserInput) => {
    createUserMutation.mutate(data, {
      onSuccess: (result) => {
        toast.success(result.tempPassword ? "Usuario criado" : "Usuario existente vinculado ao tenant");
        invalidateTenant();
        setShowCreateDialog(false);
        createUserForm.reset({
          tenantId,
          name: "",
          cpf: "",
          email: "",
          phone: "",
          role: "operator",
          isTechnician: false,
          isCashier: false,
        });
        if (result.tempPassword) {
          setPasswordResult({
            userId: result.user.id,
            name: result.user.name,
            tempPassword: result.tempPassword,
          });
        }
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const openEditUser = (user: TenantUser) => {
    setEditUser(user);
    editUserForm.reset({
      tenantId,
      userId: user.userId,
      name: user.user.name,
      email: user.user.email ?? "",
      phone: user.user.phone ?? "",
      role: (user.role === "admin" ? "admin" : "operator") as UpdateTenantUserInput["role"],
      isTechnician: user.isTechnician ?? false,
      isCashier: user.isCashier ?? false,
    });
  };

  const onUpdateUser = (data: UpdateTenantUserInput) => {
    updateUserMutation.mutate(data, {
      onSuccess: () => {
        toast.success("Usuario atualizado");
        invalidateTenant();
        setEditUser(null);
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const confirmRemoveUser = () => {
    if (!removeTarget) return;
    removeUserMutation.mutate(
      { tenantId, userId: removeTarget.userId },
      {
        onSuccess: () => {
          toast.success("Usuario removido do tenant");
          invalidateTenant();
          setRemoveTarget(null);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const confirmPasswordReset = () => {
    if (!resetTarget) return;
    resetPasswordMutation.mutate(
      { tenantId, userId: resetTarget.userId },
      {
        onSuccess: (result) => {
          setResetTarget(null);
          setPasswordResult({
            userId: result.user.id,
            name: result.user.name,
            tempPassword: result.tempPassword,
          });
          toast.success("Senha temporaria gerada");
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const confirmTwoFactorReset = () => {
    if (!twoFactorTarget) return;
    resetTwoFactorMutation.mutate(
      { tenantId, userId: twoFactorTarget.userId },
      {
        onSuccess: (result) => {
          setTwoFactorTarget(null);
          invalidateTenant();
          toast.success(`2FA de ${result.user.name} desativado`);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const copyTemporaryPassword = async () => {
    if (!passwordResult) return;
    try {
      await navigator.clipboard.writeText(passwordResult.tempPassword);
      toast.success("Senha copiada");
    } catch {
      toast.error("Nao foi possivel copiar automaticamente");
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <form onSubmit={tenantForm.handleSubmit(onTenantSubmit)} className="space-y-4">
        <FormSection title="Dados do Tenant">
          <div className="space-y-4">
            <div><Label>Nome</Label><Input {...tenantForm.register("name")} /></div>
            <div>
              <Label>Status</Label>
              <Select value={tenantStatus} onValueChange={(v) => tenantForm.setValue("status", v as UpdateTenantInput["status"])}>
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
                onValueChange={(v) => tenantForm.setValue("plan", v === "__wallet_only__" ? null : v)}
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
          <div className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div className="min-w-0">
              <Label>API externa (parceiros)</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Libera o admin deste tenant a emitir e usar API-keys de parceiro (ADR 0057).
                Desligado, a aba &quot;API de Parceiros&quot; não aparece e as keys param de funcionar.
              </p>
            </div>
            <Switch
              checked={tenantApiAccess === true}
              onCheckedChange={(v) => tenantForm.setValue("apiAccessEnabled", v)}
            />
          </div>
        </FormSection>
        <div className="flex gap-2">
          <Button type="submit" disabled={updateTenantMutation.isPending}>Salvar</Button>
          <Button type="button" variant="outline" onClick={() => router.push("/admin/tenants")}>Voltar</Button>
        </div>
      </form>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Usuarios do tenant</CardTitle>
          <Button type="button" onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo usuario
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {tenant.users.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Nenhum usuario vinculado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Acesso</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenant.users.map((tenantUser) => (
                  <TableRow key={tenantUser.userId}>
                    <TableCell>
                      <p className="font-medium">{tenantUser.user.name}</p>
                      {tenantUser.user.email && (
                        <p className="text-xs text-muted-foreground">{tenantUser.user.email}</p>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{formatCpf(tenantUser.user.cpf)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline" className={ROLE_COLORS[tenantUser.role] ?? ""}>
                          {ROLE_LABELS[tenantUser.role] ?? tenantUser.role}
                        </Badge>
                        {tenantUser.isTechnician && <Badge variant="outline" className="bg-cyan-500/10 text-cyan-500 border-cyan-500/20">Técnico</Badge>}
                        {tenantUser.isCashier && <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">Caixa</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {tenantUser.user.mustChangePassword ? (
                        <Badge variant="outline">Troca obrigatoria</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">Ativo</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => openEditUser(tenantUser)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          title="Resetar senha"
                          onClick={() => setResetTarget({ userId: tenantUser.userId, name: tenantUser.user.name })}
                          disabled={resetPasswordMutation.isPending}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          title="Resetar 2FA"
                          onClick={() => setTwoFactorTarget({ userId: tenantUser.userId, name: tenantUser.user.name })}
                          disabled={resetTwoFactorMutation.isPending}
                        >
                          <ShieldOff className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          title="Remover do tenant"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setRemoveTarget({ userId: tenantUser.userId, name: tenantUser.user.name })}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo usuario do tenant</DialogTitle>
            <DialogDescription>
              O usuario sera vinculado a este tenant. Se for uma conta nova, uma senha temporaria sera gerada.
            </DialogDescription>
          </DialogHeader>
          <Form {...createUserForm}>
            <form onSubmit={createUserForm.handleSubmit(onCreateUser)} className="space-y-4">
              <FormField
                control={createUserForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome completo</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createUserForm.control}
                name="cpf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF</FormLabel>
                    <FormControl><CpfInput value={field.value} onValueChange={field.onChange} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createUserForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} type="email" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createUserForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>WhatsApp</FormLabel>
                    <FormControl><PhoneInput value={field.value ?? ""} onValueChange={field.onChange} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createUserForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de acesso</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {Object.entries(ROLE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-2">
                <FormLabel className="text-xs text-muted-foreground">Funções (independentes do tipo de acesso)</FormLabel>
                <FormField control={createUserForm.control} name="isTechnician" render={({ field }) => (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} /> É técnico
                  </label>
                )} />
                <FormField control={createUserForm.control} name="isCashier" render={({ field }) => (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} /> É caixa
                  </label>
                )} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
                <Button type="submit" disabled={createUserMutation.isPending}>
                  {createUserMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Cadastrar
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={editUser !== null} onOpenChange={(open) => { if (!open) setEditUser(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuario do tenant</DialogTitle>
            <DialogDescription>{editUser ? formatCpf(editUser.user.cpf) : ""}</DialogDescription>
          </DialogHeader>
          <Form {...editUserForm}>
            <form onSubmit={editUserForm.handleSubmit(onUpdateUser)} className="space-y-4">
              <FormField
                control={editUserForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome completo</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editUserForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} type="email" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editUserForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>WhatsApp</FormLabel>
                    <FormControl><PhoneInput value={field.value ?? ""} onValueChange={field.onChange} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editUserForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de acesso</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {Object.entries(ROLE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-2">
                <FormLabel className="text-xs text-muted-foreground">Funções (independentes do tipo de acesso)</FormLabel>
                <FormField control={editUserForm.control} name="isTechnician" render={({ field }) => (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} /> É técnico
                  </label>
                )} />
                <FormField control={editUserForm.control} name="isCashier" render={({ field }) => (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} /> É caixa
                  </label>
                )} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditUser(null)}>Cancelar</Button>
                <Button type="submit" disabled={updateUserMutation.isPending}>
                  {updateUserMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={resetTarget !== null}
        onOpenChange={(open) => {
          if (!open && !resetPasswordMutation.isPending) setResetTarget(null);
        }}
        title="Resetar senha"
        description={`Gerar uma nova senha temporaria para ${resetTarget?.name ?? "este usuario"}? A senha atual deixara de funcionar.`}
        confirmLabel="Gerar senha"
        onConfirm={confirmPasswordReset}
        isLoading={resetPasswordMutation.isPending}
      />

      <ConfirmDialog
        open={twoFactorTarget !== null}
        onOpenChange={(open) => {
          if (!open && !resetTwoFactorMutation.isPending) setTwoFactorTarget(null);
        }}
        title="Resetar 2FA"
        description={`Desativar a verificação em duas etapas de ${twoFactorTarget?.name ?? "este usuario"}? Ele poderá entrar só com a senha e configurar o 2FA de novo se quiser.`}
        confirmLabel="Resetar 2FA"
        variant="destructive"
        onConfirm={confirmTwoFactorReset}
        isLoading={resetTwoFactorMutation.isPending}
      />

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open && !removeUserMutation.isPending) setRemoveTarget(null);
        }}
        title="Remover usuario"
        description={`${removeTarget?.name ?? "Este usuario"} perdera acesso a este tenant. A conta global nao sera excluida.`}
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={confirmRemoveUser}
        isLoading={removeUserMutation.isPending}
      />

      <Dialog open={passwordResult !== null} onOpenChange={(open) => { if (!open) setPasswordResult(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Senha temporaria</DialogTitle>
            <DialogDescription>
              Informe esta senha para {passwordResult?.name ?? "o usuario"}. A troca sera exigida no primeiro acesso.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Senha</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input value={passwordResult?.tempPassword ?? ""} readOnly className="font-mono" />
              <Button type="button" variant="outline" onClick={copyTemporaryPassword} className="sm:w-auto">
                <Copy className="mr-2 h-4 w-4" />
                Copiar
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setPasswordResult(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
