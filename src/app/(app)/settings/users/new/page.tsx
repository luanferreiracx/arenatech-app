"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, UserPlus } from "lucide-react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageHeader } from "@/components/domain/page-header";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { CpfInput } from "@/components/inputs/cpf-input";
import { PhoneInput } from "@/components/inputs/phone-input";
import { createUserSchema, type CreateUserInput } from "@/lib/validators/settings";
import { toast } from "@/lib/toast";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  operator: "Operador",
  technician: "Tecnico",
  cashier: "Caixa",
};

export default function NewUserPage() {
  const router = useRouter();
  const trpc = useTRPC();

  const form = useForm<CreateUserInput>({
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
        router.push("/settings/users");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <Link href="/settings/users"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <UserPlus className="h-5 w-5 text-primary" />
            <span>Novo Usuario</span>
          </div>
        }
      />

      <Alert className="border-yellow-500/30 bg-yellow-500/10">
        <AlertDescription>
          <strong className="text-yellow-600 dark:text-yellow-400">Atencao:</strong>{" "}
          A senha inicial sera <strong>123456</strong>. O usuario devera altera-la no primeiro acesso.
        </AlertDescription>
      </Alert>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-6">
          <FormSection title="Dados do Usuario">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Nome Completo *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Nome do usuario" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cpf"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CPF *</FormLabel>
                  <FormControl>
                    <CpfInput value={field.value} onValueChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>WhatsApp</FormLabel>
                  <FormControl>
                    <PhoneInput value={field.value ?? ""} onValueChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
            isLoading={createMutation.isPending}
            submitLabel="Cadastrar Usuario"
            onCancel={() => router.push("/settings/users")}
          />
        </form>
      </Form>
    </div>
  );
}
