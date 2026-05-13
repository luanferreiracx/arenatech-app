"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";
import { toast } from "@/lib/toast";
import { submitPreRegistrationSchema, type SubmitPreRegistrationInput } from "@/lib/validators/admin";

export function RegisterForm() {
  const trpc = useTRPC();
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<SubmitPreRegistrationInput>({
    resolver: zodResolver(submitPreRegistrationSchema),
    defaultValues: {
      tradeName: "",
      legalName: "",
      cnpj: "",
      ownerName: "",
      ownerCpf: "",
      ownerEmail: "",
      ownerPhone: "",
      notes: "",
    },
  });

  const submitMutation = useMutation(trpc.admin.submitPreRegistration.mutationOptions());

  const onSubmit = (data: SubmitPreRegistrationInput) => {
    submitMutation.mutate(data, {
      onSuccess: () => setSubmitted(true),
      onError: (err) => toast.error(err.message),
    });
  };

  if (submitted) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-4">
          <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
          <h2 className="text-xl font-semibold">Cadastro Enviado!</h2>
          <p className="text-muted-foreground">
            Seu pre-cadastro foi recebido. Voce sera contactado em breve com as credenciais de acesso.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados da Loja</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label>Nome Fantasia *</Label>
            <Input {...form.register("tradeName")} placeholder="Nome da sua loja" />
            {form.formState.errors.tradeName && (
              <p className="text-xs text-destructive mt-1">{form.formState.errors.tradeName.message}</p>
            )}
          </div>
          <div>
            <Label>Razao Social</Label>
            <Input {...form.register("legalName")} />
          </div>
          <div>
            <Label>CNPJ</Label>
            <Input {...form.register("cnpj")} placeholder="00.000.000/0000-00" />
          </div>
          <div>
            <Label>Nome do Responsavel *</Label>
            <Input {...form.register("ownerName")} />
            {form.formState.errors.ownerName && (
              <p className="text-xs text-destructive mt-1">{form.formState.errors.ownerName.message}</p>
            )}
          </div>
          <div>
            <Label>CPF *</Label>
            <Input {...form.register("ownerCpf")} placeholder="000.000.000-00" />
            {form.formState.errors.ownerCpf && (
              <p className="text-xs text-destructive mt-1">{form.formState.errors.ownerCpf.message}</p>
            )}
          </div>
          <div>
            <Label>Email *</Label>
            <Input type="email" {...form.register("ownerEmail")} />
            {form.formState.errors.ownerEmail && (
              <p className="text-xs text-destructive mt-1">{form.formState.errors.ownerEmail.message}</p>
            )}
          </div>
          <div>
            <Label>Telefone *</Label>
            <Input {...form.register("ownerPhone")} placeholder="(99) 99999-9999" />
            {form.formState.errors.ownerPhone && (
              <p className="text-xs text-destructive mt-1">{form.formState.errors.ownerPhone.message}</p>
            )}
          </div>
          <div>
            <Label>Observacoes</Label>
            <Textarea {...form.register("notes")} rows={3} />
          </div>
          <Button type="submit" className="w-full" disabled={submitMutation.isPending}>
            {submitMutation.isPending ? "Enviando..." : "Enviar Cadastro"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
