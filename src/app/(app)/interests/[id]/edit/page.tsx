"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { LoadingState } from "@/components/domain/loading-state";
import { MoneyInput } from "@/components/inputs/money-input";
import {
  updateInterestSchema,
  type UpdateInterestInput,
  INTEREST_TYPE_LABELS,
  INTEREST_STATUS_LABELS,
  INTEREST_PRIORITY_LABELS,
} from "@/lib/validators/customer";
import { toast } from "@/lib/toast";

export default function EditInterestPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: interest, isLoading } = useQuery(
    trpc.interest.getById.queryOptions({ id })
  );

  const form = useForm<UpdateInterestInput>({
    resolver: zodResolver(updateInterestSchema),
    defaultValues: { id },
  });

  useEffect(() => {
    if (interest) {
      const i = interest as Record<string, unknown>;
      form.reset({
        id,
        description: (i.description as string) ?? "",
        product: (i.product as string) ?? "",
        estimatedValue: (i.estimatedValue as number) ?? undefined,
        interestType: i.interestType as UpdateInterestInput["interestType"],
        priority: i.priority as UpdateInterestInput["priority"],
        status: i.status as UpdateInterestInput["status"],
        notes: (i.notes as string) ?? "",
      });
    }
  }, [interest, id, form]);

  const updateMutation = useMutation(
    trpc.interest.update.mutationOptions({
      onSuccess: () => {
        toast.success("Interesse atualizado!");
        queryClient.invalidateQueries({ queryKey: [["interest"]] });
        router.push(`/interests/${id}`);
      },
      onError: (err) => toast.error(err.message),
    })
  );

  if (isLoading) return <LoadingState />;
  if (!interest) return <div className="text-center py-12 text-muted-foreground">Interesse nao encontrado</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <Link href={`/interests/${id}`}><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <Heart className="h-5 w-5 text-primary" />
            <span>Editar Interesse</span>
          </div>
        }
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit((data) => updateMutation.mutate(data))} className="space-y-6">
          <FormSection title="Dados do Interesse">
            <FormField
              control={form.control}
              name="product"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Produto / Modelo</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
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
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
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
                    <MoneyInput value={field.value ?? 0} onChange={field.onChange} />
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
                  <Select value={field.value ?? "media"} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
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

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(INTEREST_STATUS_LABELS).map(([k, v]) => (
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
                  <FormLabel>Descricao</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ""} rows={4} />
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
                  <FormLabel>Observacoes</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ""} rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>

          <FormActions
            isLoading={updateMutation.isPending}
            submitLabel="Salvar Alteracoes"
            onCancel={() => router.push(`/interests/${id}`)}
          />
        </form>
      </Form>
    </div>
  );
}
