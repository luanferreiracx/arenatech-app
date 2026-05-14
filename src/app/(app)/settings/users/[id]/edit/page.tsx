"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
// Badge available if needed for status display
import { PageHeader } from "@/components/domain/page-header";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { LoadingState } from "@/components/domain/loading-state";
import { updateUserSchema, type UpdateUserInput } from "@/lib/validators/settings";
import { toast } from "@/lib/toast";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  operator: "Operador",
  technician: "Tecnico",
  cashier: "Caixa",
};

export default function EditUserPage() {
  const { id: userId } = useParams<{ id: string }>();
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Fetch all users to find this one
  const { data: usersData, isLoading } = useQuery(
    trpc.settings.listUsers.queryOptions({ pageSize: 100 })
  );

  const user = usersData?.data?.find((u) => u.userId === userId);

  const form = useForm<UpdateUserInput>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      userId,
      role: "operator",
    },
  });

  useEffect(() => {
    if (user) {
      form.reset({
        userId,
        name: user.name,
        role: user.role as UpdateUserInput["role"],
      });
    }
  }, [user, userId, form]);

  const updateMutation = useMutation(
    trpc.settings.updateUser.mutationOptions({
      onSuccess: () => {
        toast.success("Usuario atualizado!");
        queryClient.invalidateQueries({ queryKey: [["settings"]] });
        router.push("/settings/users");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  if (isLoading) return <LoadingState />;
  if (!user) return <div className="text-center py-12 text-muted-foreground">Usuario nao encontrado</div>;

  const formatCpf = (cpf: string) => {
    if (cpf.length !== 11) return cpf;
    return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <Link href="/settings/users"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <UserCog className="h-5 w-5 text-primary" />
            <span>Editar Usuario</span>
          </div>
        }
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))} className="space-y-6">
          <FormSection title="Dados do Usuario">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Nome Completo *</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormItem>
              <FormLabel>CPF</FormLabel>
              <Input value={formatCpf(user.cpf)} disabled className="font-mono opacity-70" />
              <FormDescription>O CPF nao pode ser alterado</FormDescription>
            </FormItem>

            <FormField
              control={form.control}
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
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Administradores tem acesso total. Operadores, tecnicos e caixas tem acesso restrito.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>

          <FormActions
            isLoading={updateMutation.isPending}
            submitLabel="Salvar Alteracoes"
            onCancel={() => router.push("/settings/users")}
          />
        </form>
      </Form>
    </div>
  );
}
