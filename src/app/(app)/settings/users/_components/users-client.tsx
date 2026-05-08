"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { type z } from "zod";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { EmptyState } from "@/components/domain/empty-state";
import { inviteUserSchema, updateUserRoleSchema } from "@/lib/validators/settings";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";

type InviteFormValues = z.infer<typeof inviteUserSchema>;
type UpdateRoleFormValues = z.infer<typeof updateUserRoleSchema>;

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Proprietário",
  MANAGER: "Gerente",
  OPERATOR: "Operador",
  TECHNICIAN: "Técnico",
  CASHIER: "Caixa",
};

const ALL_ROLES = Object.keys(ROLE_LABELS) as Array<keyof typeof ROLE_LABELS>;

function formatCpf(cpf: string): string {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function UsersClient() {
  const trpc = useTRPC();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeUserId, setRemoveUserId] = useState<string | null>(null);

  const { data: users = [], refetch } = useQuery(
    trpc.settings.listUsers.queryOptions(),
  );

  const inviteMutation = useMutation(
    trpc.settings.inviteUser.mutationOptions({
      onSuccess: () => {
        toast.success("Usuário adicionado ao tenant!");
        setInviteOpen(false);
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const updateRoleMutation = useMutation(
    trpc.settings.updateUserRole.mutationOptions({
      onSuccess: () => {
        toast.success("Papel atualizado!");
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const removeMutation = useMutation(
    trpc.settings.removeUser.mutationOptions({
      onSuccess: () => {
        toast.success("Usuário removido da loja.");
        setRemoveUserId(null);
        void refetch();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const inviteForm = useForm<InviteFormValues>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: { cpf: "", role: "OPERATOR" },
  });

  const onInviteSubmit = (values: InviteFormValues) => {
    inviteMutation.mutate(values);
  };

  const handleRoleChange = (userId: string, role: UpdateRoleFormValues["role"]) => {
    updateRoleMutation.mutate({ userId, role });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Adicionar Usuário
        </Button>
      </div>

      {users.length === 0 ? (
        <EmptyState
          title="Nenhum usuário"
          description="Adicione usuários por CPF para dar acesso à loja."
        />
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Nome</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{entry.user?.name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {entry.user?.cpf ? formatCpf(entry.user.cpf) : "—"}
                  </TableCell>
                  <TableCell>
                    <Select
                      defaultValue={entry.role}
                      onValueChange={(val) =>
                        handleRoleChange(
                          entry.userId,
                          val as UpdateRoleFormValues["role"],
                        )
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setRemoveUserId(entry.userId)}
                    >
                      Remover
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Usuário por CPF</DialogTitle>
          </DialogHeader>
          <Form {...inviteForm}>
            <form onSubmit={inviteForm.handleSubmit(onInviteSubmit)} className="space-y-4">
              <FormField
                control={inviteForm.control}
                name="cpf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF do Usuário</FormLabel>
                    <FormControl>
                      <Input placeholder="000.000.000-00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={inviteForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Papel</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ALL_ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={inviteMutation.isPending}>
                  Adicionar
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Remove confirm */}
      <ConfirmDialog
        open={!!removeUserId}
        onOpenChange={(open) => !open && setRemoveUserId(null)}
        title="Remover usuário da loja?"
        description="O usuário perderá acesso a esta loja. Pode ser readicionado pelo CPF depois."
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={() => { if (removeUserId) removeMutation.mutate({ userId: removeUserId }); }}
        isLoading={removeMutation.isPending}
      />
    </div>
  );
}
