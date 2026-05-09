"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Logo } from "@/components/branding/logo";
import { CheckCircle } from "lucide-react";
import {
  createPreRegistrationSchema,
  type CreatePreRegistrationInput,
} from "@/lib/validators/admin";

export default function RegisterPage() {
  const trpc = useTRPC();
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<CreatePreRegistrationInput>({
    resolver: zodResolver(createPreRegistrationSchema),
    defaultValues: {
      tradeName: "",
      legalName: "",
      cnpj: "",
      ownerName: "",
      ownerCpf: "",
      ownerEmail: "",
      ownerPhone: "",
    },
  });

  const { data: plans } = useQuery(trpc.admin.publicPlans.queryOptions());

  const submitMutation = useMutation(
    trpc.admin.submitPreRegistration.mutationOptions({
      onSuccess: () => setSubmitted(true),
      onError: (err) => {
        form.setError("root", { message: err.message });
      },
    }),
  );

  function onSubmit(values: CreatePreRegistrationInput) {
    submitMutation.mutate({
      ...values,
      legalName: values.legalName || undefined,
      cnpj: values.cnpj || undefined,
      planId: values.planId || undefined,
    });
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <CheckCircle className="w-16 h-16 text-success mx-auto" />
            <h2 className="text-xl font-semibold">Cadastro recebido!</h2>
            <p className="text-muted-foreground">
              Entraremos em contato em breve para ativar sua conta.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <Logo size="md" variant="full" />
          </div>
          <CardTitle>Cadastre sua loja</CardTitle>
          <p className="text-sm text-muted-foreground">
            Preencha os dados abaixo para solicitar acesso a plataforma Arena Tech.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {form.formState.errors.root && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
                {form.formState.errors.root.message}
              </div>
            )}

            <div>
              <Label htmlFor="tradeName">Nome Fantasia *</Label>
              <Input id="tradeName" {...form.register("tradeName")} />
              {form.formState.errors.tradeName && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.tradeName.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="legalName">Razao Social</Label>
              <Input id="legalName" {...form.register("legalName")} />
            </div>

            <div>
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input id="cnpj" placeholder="00.000.000/0000-00" {...form.register("cnpj")} />
            </div>

            <div>
              <Label htmlFor="ownerName">Nome do Responsavel *</Label>
              <Input id="ownerName" {...form.register("ownerName")} />
              {form.formState.errors.ownerName && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.ownerName.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="ownerCpf">CPF do Responsavel *</Label>
              <Input id="ownerCpf" placeholder="000.000.000-00" {...form.register("ownerCpf")} />
              {form.formState.errors.ownerCpf && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.ownerCpf.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="ownerEmail">Email *</Label>
              <Input id="ownerEmail" type="email" {...form.register("ownerEmail")} />
              {form.formState.errors.ownerEmail && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.ownerEmail.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="ownerPhone">Telefone *</Label>
              <Input id="ownerPhone" placeholder="(00) 00000-0000" {...form.register("ownerPhone")} />
              {form.formState.errors.ownerPhone && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.ownerPhone.message}</p>
              )}
            </div>

            {plans && plans.length > 0 && (
              <div>
                <Label>Plano</Label>
                <Select
                  value={form.watch("planId") ?? ""}
                  onValueChange={(v) => form.setValue("planId", v || undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um plano (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan: { id: string; name: string; monthlyPrice: unknown }) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name} — R$ {Number(plan.monthlyPrice).toFixed(2)}/mes
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={submitMutation.isPending}>
              {submitMutation.isPending ? "Enviando..." : "Enviar Cadastro"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
