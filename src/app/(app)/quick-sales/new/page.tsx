"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CreditCard } from "lucide-react";
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
  FormDescription,
} from "@/components/ui/form";
import { PageHeader } from "@/components/domain/page-header";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { MoneyInput } from "@/components/inputs/money-input";
import { PhoneInput } from "@/components/inputs/phone-input";
import { createQuickSaleSchema, type CreateQuickSaleInput } from "@/lib/validators/quick-sale";
import { toast } from "@/lib/toast";

export default function NewQuickSalePage() {
  const router = useRouter();
  const trpc = useTRPC();

  const form = useForm<CreateQuickSaleInput>({
    resolver: zodResolver(createQuickSaleSchema),
    defaultValues: {
      buyerName: "",
      cpfCnpj: "",
      phone: "",
      productDescription: "",
      quantity: 1,
      unitPrice: 0,
      discount: 0,
    },
  });

  const createMutation = useMutation(
    trpc.quickSale.create.mutationOptions({
      onSuccess: (data) => {
        toast.success("Venda avulsa criada!");
        router.push(`/quick-sales/${(data as Record<string, unknown>).id}`);
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const qty = form.watch("quantity") ?? 1;
  const unitPrice = form.watch("unitPrice") ?? 0;
  const discount = form.watch("discount") ?? 0;
  const subtotal = qty * unitPrice;
  const total = Math.max(0, subtotal - discount);

  const formatCurrency = (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <Link href="/quick-sales"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <CreditCard className="h-5 w-5 text-primary" />
            <span>Nova Venda DEPIX</span>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-6">
              <FormSection title="Dados de Contato (opcional)">
                <FormField
                  control={form.control}
                  name="cpfCnpj"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CPF/CNPJ do Pagador</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} placeholder="000.000.000-00" maxLength={18} />
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
                      <FormLabel>WhatsApp/Telefone</FormLabel>
                      <FormControl>
                        <PhoneInput value={field.value ?? ""} onValueChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormSection>

              <FormSection title="Dados do Produto/Servico">
                <FormField
                  control={form.control}
                  name="productDescription"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Descricao *</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Descreva o produto ou servico com detalhes (min 5 chars)" rows={4} />
                      </FormControl>
                      <FormDescription>Essa descricao servira como prova da transacao.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantidade *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="unitPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor Unitario *</FormLabel>
                      <FormControl>
                        <MoneyInput value={field.value} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="discount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Desconto</FormLabel>
                      <FormControl>
                        <MoneyInput value={field.value ?? 0} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FormSection>

              <FormActions
                isLoading={createMutation.isPending}
                submitLabel="Registrar e Gerar PIX"
                onCancel={() => router.push("/quick-sales")}
              />
            </form>
          </Form>
        </div>

        {/* Summary sidebar */}
        <div>
          <div className="sticky top-6 rounded-lg border bg-card">
            <div className="bg-primary px-4 py-3 rounded-t-lg">
              <p className="text-sm font-semibold text-primary-foreground uppercase tracking-wider">Resumo da Venda</p>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Quantidade</span>
                <span>{qty}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor Unitario</span>
                <span>{formatCurrency(unitPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-green-500">
                  <span>Desconto</span>
                  <span>- {formatCurrency(discount)}</span>
                </div>
              )}
              <div className="flex justify-between pt-3 border-t text-lg font-bold">
                <span>Total</span>
                <span className="text-primary">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
