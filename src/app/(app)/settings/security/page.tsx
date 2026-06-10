"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import {
  changePasswordSchema,
  type ChangePasswordInput,
} from "@/lib/validators/settings";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/domain/page-header";
import { FormActions } from "@/components/domain/forms/form-actions";
import { TwoFactorCard } from "@/components/domain/security/two-factor-card";

export default function SecurityPage() {
  const trpc = useTRPC();

  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const mutation = useMutation(
    trpc.settings.changePassword.mutationOptions({
      onSuccess: () => {
        toast.success("Senha alterada com sucesso!");
        form.reset();
      },
      onError: (error) => {
        toast.error(error.message);
      },
    })
  );

  const onSubmit = (data: ChangePasswordInput) => {
    mutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Seguranca"
        subtitle="Gerencie sua senha e a verificação em duas etapas"
      />

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">Alterar Senha</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha Atual *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="Digite sua senha atual"
                        autoComplete="current-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nova Senha *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="Minimo 6 caracteres"
                        autoComplete="new-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirmar Nova Senha *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="Repita a nova senha"
                        autoComplete="new-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormActions
                isLoading={mutation.isPending}
                submitLabel="Alterar Senha"
              />
            </form>
          </Form>
        </CardContent>
      </Card>

      <TwoFactorCard />
    </div>
  );
}
