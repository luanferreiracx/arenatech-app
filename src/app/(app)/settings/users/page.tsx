"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createUserSchema,
  type CreateUserInput,
} from "@/lib/validators/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/domain/page-header";
import { EmptyState } from "@/components/domain/empty-state";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
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
import { CpfInput } from "@/components/inputs/cpf-input";
import { PhoneInput } from "@/components/inputs/phone-input";
import {
  Plus,
  Users,
  Pencil,
  Lock,
  UserMinus,
  Loader2,
  Search,
} from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  operator: "Operador",
  technician: "Tecnico",
  cashier: "Caixa",
};

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

export default function UsersPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editUser, setEditUser] = useState<{
    userId: string;
    name: string;
    role: string;
  } | null>(null);
  const [resetTarget, setResetTarget] = useState<{
    userId: string;
    name: string;
  } | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{
    userId: string;
    name: string;
  } | null>(null);

  const { data, isLoading } = useQuery(
    trpc.settings.listUsers.queryOptions({ search, pageSize: 50 })
  );

  const createForm = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: "",
      cpf: "",
      phone: "",
      role: "operator",
    },
  });

  const createMutation = useMutation(
    trpc.settings.createUser.mutationOptions({
      onSuccess: (result) => {
        toast.success(`Usuario '${result.name}' criado! Senha inicial: 123456`);
        queryClient.invalidateQueries({ queryKey: [["settings"]] });
        setShowCreateDialog(false);
        createForm.reset();
      },
      onError: (error) => toast.error(error.message),
    })
  );

  const updateMutation = useMutation(
    trpc.settings.updateUser.mutationOptions({
      onSuccess: () => {
        toast.success("Usuario atualizado!");
        queryClient.invalidateQueries({ queryKey: [["settings"]] });
        setEditUser(null);
      },
      onError: (error) => toast.error(error.message),
    })
  );

  const resetMutation = useMutation(
    trpc.settings.resetUserPassword.mutationOptions({
      onSuccess: () => {
        toast.success("Senha resetada para 123456!");
        setResetTarget(null);
      },
      onError: (error) => toast.error(error.message),
    })
  );

  const removeMutation = useMutation(
    trpc.settings.removeUser.mutationOptions({
      onSuccess: () => {
        toast.success("Usuario removido da loja!");
        queryClient.invalidateQueries({ queryKey: [["settings"]] });
        setRemoveTarget(null);
      },
      onError: (error) => toast.error(error.message),
    })
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Usuarios" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const users = data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios do Sistema"
        subtitle="Gerencie os usuarios que tem acesso a esta loja"
        actions={
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Usuario
          </Button>
        }
      />

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou CPF..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum usuario encontrado"
          description="Adicione usuarios para que possam acessar o sistema."
          action={
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar
            </Button>
          }
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {users.length} usuario{users.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.userId}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {formatCpf(user.cpf)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={ROLE_COLORS[user.role] ?? ""}
                      >
                        {ROLE_LABELS[user.role] ?? user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setEditUser({
                              userId: user.userId,
                              name: user.name,
                              role: user.role,
                            })
                          }
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setResetTarget({
                              userId: user.userId,
                              name: user.name,
                            })
                          }
                          title="Resetar senha"
                        >
                          <Lock className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() =>
                            setRemoveTarget({
                              userId: user.userId,
                              name: user.name,
                            })
                          }
                          title="Remover"
                        >
                          <UserMinus className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create user dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Usuario</DialogTitle>
          </DialogHeader>

          <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm mb-2">
            <strong className="text-yellow-600 dark:text-yellow-400">Atencao:</strong>{" "}
            A senha inicial sera <strong>123456</strong>. O usuario devera altera-la no
            primeiro acesso.
          </div>

          <Form {...createForm}>
            <form
              onSubmit={createForm.handleSubmit((data) => createMutation.mutate(data))}
              className="space-y-4"
            >
              <FormField
                control={createForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome Completo *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Nome do usuario" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="cpf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF *</FormLabel>
                    <FormControl>
                      <CpfInput
                        value={field.value}
                        onValueChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>WhatsApp</FormLabel>
                    <FormControl>
                      <PhoneInput
                        value={field.value ?? ""}
                        onValueChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Acesso *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(ROLE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Administradores tem acesso total. Operadores, tecnicos e caixas tem
                      acesso restrito.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateDialog(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Cadastrar
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit user dialog */}
      <Dialog open={editUser !== null} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuario</DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nome</label>
                <p className="text-sm text-muted-foreground">{editUser.name}</p>
              </div>

              <div>
                <label className="text-sm font-medium">Tipo de Acesso</label>
                <Select
                  value={editUser.role}
                  onValueChange={(role) => setEditUser({ ...editUser, role })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setEditUser(null)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() =>
                    updateMutation.mutate({
                      userId: editUser.userId,
                      role: editUser.role as CreateUserInput["role"],
                    })
                  }
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Salvar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reset password confirmation */}
      <ConfirmDialog
        open={resetTarget !== null}
        onOpenChange={(open) => !open && setResetTarget(null)}
        title="Resetar senha?"
        description={`A senha de '${resetTarget?.name ?? ""}' sera redefinida para 123456.`}
        confirmLabel="Resetar Senha"
        isLoading={resetMutation.isPending}
        onConfirm={() => {
          if (resetTarget) resetMutation.mutate({ userId: resetTarget.userId });
        }}
      />

      {/* Remove user confirmation */}
      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title="Remover usuario?"
        description={`'${removeTarget?.name ?? ""}' perdera acesso a esta loja. A conta global do usuario nao sera excluida.`}
        confirmLabel="Remover"
        variant="destructive"
        isLoading={removeMutation.isPending}
        onConfirm={() => {
          if (removeTarget) removeMutation.mutate({ userId: removeTarget.userId });
        }}
      />
    </div>
  );
}
