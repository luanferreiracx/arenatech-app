"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Loader2, Pencil, Plus, Search, ShieldOff, UserMinus, Users } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { toast } from "@/lib/toast";
import { PageHeader } from "@/components/domain/page-header";
import { EmptyState } from "@/components/domain/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CpfInput } from "@/components/forms/cpf-input";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const ROLES = [
  { value: "admin", label: "Administrador" },
  { value: "operator", label: "Operador" },
  { value: "technician", label: "Tecnico" },
  { value: "cashier", label: "Caixa" },
] as const;

const ROLE_LABELS: Record<string, string> = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));
const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  operator: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  technician: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  cashier: "bg-green-500/10 text-green-500 border-green-500/20",
};

function formatCpf(cpf: string): string {
  if (cpf.length !== 11) return cpf;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

type UserRow = {
  userId: string;
  role: string;
  name: string;
  cpf: string;
  email: string | null;
};
type Target = { userId: string; name: string };

export function UsersManager() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const usersQuery = useQuery(trpc.settings.listUsers.queryOptions({ search, pageSize: 50 }));
  const canManage = usersQuery.data?.canManage ?? false;
  const users = (usersQuery.data?.data ?? []) as UserRow[];

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.settings.listUsers.queryKey() });

  // ── Create / edit form state ──
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [form, setForm] = useState({ name: "", cpf: "", email: "", phone: "", role: "operator" });

  // ── Confirm / result state ──
  const [removeTarget, setRemoveTarget] = useState<Target | null>(null);
  const [resetPwTarget, setResetPwTarget] = useState<Target | null>(null);
  const [reset2faTarget, setReset2faTarget] = useState<Target | null>(null);
  const [tempPassword, setTempPassword] = useState<{ name: string; password: string } | null>(null);

  const createMutation = useMutation(
    trpc.settings.createUser.mutationOptions({
      onSuccess: (res) => {
        setShowCreate(false);
        invalidate();
        if (res.tempPassword) setTempPassword({ name: res.user.name, password: res.tempPassword });
        else toast.success("Usuario vinculado ao tenant");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const updateMutation = useMutation(
    trpc.settings.updateUser.mutationOptions({
      onSuccess: () => {
        setEditTarget(null);
        invalidate();
        toast.success("Usuario atualizado");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const removeMutation = useMutation(
    trpc.settings.removeUser.mutationOptions({
      onSuccess: () => {
        setRemoveTarget(null);
        invalidate();
        toast.success("Usuario removido do tenant");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const resetPwMutation = useMutation(
    trpc.settings.resetUserPassword.mutationOptions({
      onSuccess: (res) => {
        setResetPwTarget(null);
        setTempPassword({ name: res.user.name, password: res.tempPassword });
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const reset2faMutation = useMutation(
    trpc.settings.resetUserTwoFactor.mutationOptions({
      onSuccess: () => {
        setReset2faTarget(null);
        invalidate();
        toast.success("2FA desativado");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  function openCreate() {
    setForm({ name: "", cpf: "", email: "", phone: "", role: "operator" });
    setShowCreate(true);
  }
  function openEdit(u: UserRow) {
    setEditTarget(u);
    setForm({ name: u.name, cpf: u.cpf, email: u.email ?? "", phone: "", role: u.role });
  }

  const submitCreate = () =>
    createMutation.mutate({
      name: form.name.trim(),
      cpf: form.cpf.replace(/\D/g, ""),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      role: form.role as "admin" | "operator" | "technician" | "cashier",
    });
  const submitEdit = () => {
    if (!editTarget) return;
    updateMutation.mutate({
      userId: editTarget.userId,
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      role: form.role as "admin" | "operator" | "technician" | "cashier",
    });
  };

  if (usersQuery.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Usuarios" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Usuarios"
          subtitle="Gerencie as contas de acesso desta loja"
        />
        {canManage && (
          <Button type="button" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Novo usuario
          </Button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou CPF..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {users.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum usuario" description="Nenhuma conta vinculada a esta loja." />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Perfil</TableHead>
                {canManage && <TableHead className="text-right">Acoes</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.userId}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="font-mono text-sm">{formatCpf(u.cpf)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={ROLE_COLORS[u.role] ?? ""}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="ghost" size="sm" title="Editar" onClick={() => openEdit(u)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" title="Resetar senha" onClick={() => setResetPwTarget({ userId: u.userId, name: u.name })}>
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" title="Resetar 2FA" onClick={() => setReset2faTarget({ userId: u.userId, name: u.name })}>
                          <ShieldOff className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" title="Remover do tenant" className="text-destructive hover:text-destructive" onClick={() => setRemoveTarget({ userId: u.userId, name: u.name })}>
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Criar / editar */}
      <Dialog
        open={showCreate || editTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreate(false);
            setEditTarget(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? "Editar usuario" : "Novo usuario"}</DialogTitle>
            <DialogDescription>
              {editTarget
                ? "Atualize os dados e o perfil de acesso."
                : "Crie uma conta nova ou vincule um CPF existente a esta loja."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="u-name">Nome</Label>
              <Input id="u-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            {!editTarget && (
              <div className="space-y-1.5">
                <Label htmlFor="u-cpf">CPF</Label>
                <CpfInput id="u-cpf" value={form.cpf} onValueChange={(v) => setForm((f) => ({ ...f, cpf: v }))} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="u-email">Email (opcional)</Label>
              <Input id="u-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-phone">Telefone (opcional)</Label>
              <Input id="u-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Perfil</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              disabled={createMutation.isPending || updateMutation.isPending || !form.name.trim() || (!editTarget && form.cpf.replace(/\D/g, "").length !== 11)}
              onClick={editTarget ? submitEdit : submitCreate}
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editTarget ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => { if (!open && !removeMutation.isPending) setRemoveTarget(null); }}
        title="Remover usuario"
        description={`${removeTarget?.name ?? "Este usuario"} perdera acesso a esta loja. A conta global nao e excluida.`}
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={() => {
          if (removeTarget) removeMutation.mutate({ userId: removeTarget.userId });
        }}
        isLoading={removeMutation.isPending}
      />

      <ConfirmDialog
        open={resetPwTarget !== null}
        onOpenChange={(open) => { if (!open && !resetPwMutation.isPending) setResetPwTarget(null); }}
        title="Resetar senha"
        description={`Gerar uma senha temporaria para ${resetPwTarget?.name ?? "este usuario"}? A senha atual deixara de funcionar.`}
        confirmLabel="Gerar senha"
        onConfirm={() => {
          if (resetPwTarget) resetPwMutation.mutate({ userId: resetPwTarget.userId });
        }}
        isLoading={resetPwMutation.isPending}
      />

      <ConfirmDialog
        open={reset2faTarget !== null}
        onOpenChange={(open) => { if (!open && !reset2faMutation.isPending) setReset2faTarget(null); }}
        title="Resetar 2FA"
        description={`Desativar a verificacao em duas etapas de ${reset2faTarget?.name ?? "este usuario"}? Ele podera entrar so com a senha.`}
        confirmLabel="Resetar 2FA"
        variant="destructive"
        onConfirm={() => {
          if (reset2faTarget) reset2faMutation.mutate({ userId: reset2faTarget.userId });
        }}
        isLoading={reset2faMutation.isPending}
      />

      {/* Senha temporaria gerada */}
      <Dialog open={tempPassword !== null} onOpenChange={(open) => { if (!open) setTempPassword(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Senha temporaria</DialogTitle>
            <DialogDescription>
              Informe esta senha para {tempPassword?.name ?? "o usuario"}. A troca sera exigida no primeiro acesso.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={tempPassword?.password ?? ""} readOnly className="font-mono" />
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                if (tempPassword) {
                  await navigator.clipboard.writeText(tempPassword.password);
                  toast.success("Senha copiada");
                }
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copiar
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setTempPassword(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
