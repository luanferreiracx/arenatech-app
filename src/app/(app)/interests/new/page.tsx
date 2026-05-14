"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/domain/page-header";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { MoneyInput } from "@/components/inputs/money-input";
import {
  createInterestSchema,
  type CreateInterestInput,
  INTEREST_TYPE_LABELS,
  INTEREST_PRIORITY_LABELS,
} from "@/lib/validators/customer";
import { toast } from "@/lib/toast";

export default function NewInterestPage() {
  const router = useRouter();
  const trpc = useTRPC();

  const form = useForm<CreateInterestInput>({
    resolver: zodResolver(createInterestSchema),
    defaultValues: {
      customerId: "",
      description: "",
      product: "",
      interestType: "PURCHASE",
      priority: "media",
      notes: "",
    },
  });

  const createMutation = useMutation(
    trpc.interest.create.mutationOptions({
      onSuccess: (data) => {
        toast.success("Interesse cadastrado!");
        router.push(`/interests/${(data as Record<string, unknown>).id}`);
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
              <Link href="/interests"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <Heart className="h-5 w-5 text-primary" />
            <span>Novo Interesse</span>
          </div>
        }
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-6">
          <FormSection title="Cliente">
            <FormField
              control={form.control}
              name="customerId"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>ID do Cliente *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="UUID do cliente (cole da pagina do cliente)" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>

          <FormSection title="Dados do Interesse">
            <FormField
              control={form.control}
              name="product"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Produto / Modelo Desejado</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} placeholder="Ex: iPhone 15 Pro 256GB" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="interestType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Interesse</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(INTEREST_TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="estimatedValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor Estimado</FormLabel>
                  <FormControl>
                    <MoneyInput
                      value={field.value ?? 0}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prioridade</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(INTEREST_PRIORITY_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>

          <FormSection title="Detalhes">
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Descricao *</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Descreva o interesse do cliente..." rows={4} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Observacoes Internas</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ""} placeholder="Notas internas..." rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>

          <FormActions
            isLoading={createMutation.isPending}
            submitLabel="Cadastrar Interesse"
            onCancel={() => router.push("/interests")}
          />
        </form>
      </Form>
    </div>
  );
}
