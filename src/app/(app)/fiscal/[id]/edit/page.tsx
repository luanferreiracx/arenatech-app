"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { PageHeader } from "@/components/domain/page-header";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { FormSection } from "@/components/domain/forms/form-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/domain/status-badge";
import { MoneyInput } from "@/components/inputs/money-input";
import { CepInput } from "@/components/inputs/cep-input";
import { toast } from "@/lib/toast";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_VARIANT } from "@/lib/validators/fiscal";
import Link from "next/link";
import { ArrowLeft, Plus, Send, X } from "lucide-react";

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [confirmAuthorize, setConfirmAuthorize] = useState(false);
  const [removeItemId, setRemoveItemId] = useState<string | null>(null);

  const invoiceQuery = useQuery(trpc.fiscal.getById.queryOptions({ id }));
  const invoice = invoiceQuery.data;
  const payload = (invoice?.payload as Record<string, unknown>) ?? {};

  const updateMutation = useMutation(
    trpc.fiscal.update.mutationOptions({
      onSuccess: () => {
        toast.success("Nota fiscal atualizada");
        queryClient.invalidateQueries({ queryKey: trpc.fiscal.getById.queryKey({ id }) });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const addItemForm = useForm({
    defaultValues: {
      description: "",
      code: "",
      ncm: "",
      cfop: "5102",
      quantity: 1,
      unitPrice: 0,
    },
  });

  const addItemMutation = useMutation(
    trpc.fiscal.addItem.mutationOptions({
      onSuccess: () => {
        toast.success("Item adicionado");
        addItemForm.reset();
        queryClient.invalidateQueries({ queryKey: trpc.fiscal.getById.queryKey({ id }) });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const removeItemMutation = useMutation(
    trpc.fiscal.removeItem.mutationOptions({
      onSuccess: () => {
        toast.success("Item removido");
        queryClient.invalidateQueries({ queryKey: trpc.fiscal.getById.queryKey({ id }) });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const authorizeMutation = useMutation(
    trpc.fiscal.authorize.mutationOptions({
      onSuccess: () => {
        toast.success("NF-e enviada para autorizacao");
        queryClient.invalidateQueries({ queryKey: trpc.fiscal.getById.queryKey({ id }) });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  if (invoiceQuery.isLoading) {
    return <Skeleton className="h-96" />;
  }

  if (!invoice) {
    return <p className="text-muted-foreground">Nota fiscal nao encontrada</p>;
  }

  const isEditable = invoice.status === "DRAFT" || invoice.status === "REJECTED";

  return (
    <div>
      <PageHeader
        title={`NF-e${invoice.number ? ` #${invoice.number}` : ""}`}
        subtitle={
          <div className="flex items-center gap-2">
            <StatusBadge variant={INVOICE_STATUS_VARIANT[invoice.status] ?? "default"}>
              {INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}
            </StatusBadge>
          </div>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {isEditable && (invoice.items?.length ?? 0) > 0 && (
              <Button
                onClick={() => setConfirmAuthorize(true)}
                disabled={authorizeMutation.isPending}
              >
                <Send className="mr-2 h-4 w-4" />
                Enviar para SEFAZ
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href={`/fiscal/${id}`}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Link>
            </Button>
          </div>
        }
      />

      {invoice.status === "REJECTED" && payload.rejectionReason != null && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive mb-6">
          <strong>Rejeitada pela SEFAZ:</strong> {payload.rejectionReason != null ? String(payload.rejectionReason) : ""}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Destinatario / Valores */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Destinatario</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  updateMutation.mutate({
                    invoiceId: id,
                    recipientName: fd.get("recipientName") as string,
                    recipientCpfCnpj: fd.get("recipientCpfCnpj") as string,
                    recipientEmail: fd.get("recipientEmail") as string || null,
                    recipientPhone: fd.get("recipientPhone") as string || null,
                    recipientZipCode: fd.get("recipientZipCode") as string || null,
                    recipientStreet: fd.get("recipientStreet") as string || null,
                    recipientNumber: fd.get("recipientNumber") as string || null,
                    recipientComplement: fd.get("recipientComplement") as string || null,
                    recipientNeighborhood: fd.get("recipientNeighborhood") as string || null,
                    recipientCity: fd.get("recipientCity") as string || null,
                    recipientState: fd.get("recipientState") as string || null,
                  });
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">CPF/CNPJ *</Label>
                    <Input name="recipientCpfCnpj" defaultValue={invoice.recipientCpfCnpj ?? ""} required disabled={!isEditable} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Telefone</Label>
                    <Input name="recipientPhone" defaultValue={String(payload.recipientPhone ?? "")} disabled={!isEditable} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nome / Razao Social *</Label>
                  <Input name="recipientName" defaultValue={invoice.recipientName ?? ""} required disabled={!isEditable} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input name="recipientEmail" type="email" defaultValue={String(payload.recipientEmail ?? "")} disabled={!isEditable} />
                </div>

                <div className="border-t pt-3 mt-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Endereco</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">CEP</Label>
                      <Input name="recipientZipCode" defaultValue={String((payload.recipientAddress as Record<string, string>)?.zipCode ?? "")} disabled={!isEditable} />
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs">Logradouro</Label>
                      <Input name="recipientStreet" defaultValue={String((payload.recipientAddress as Record<string, string>)?.street ?? "")} disabled={!isEditable} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Numero</Label>
                      <Input name="recipientNumber" defaultValue={String((payload.recipientAddress as Record<string, string>)?.number ?? "")} disabled={!isEditable} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Bairro</Label>
                      <Input name="recipientNeighborhood" defaultValue={String((payload.recipientAddress as Record<string, string>)?.neighborhood ?? "")} disabled={!isEditable} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Complemento</Label>
                      <Input name="recipientComplement" defaultValue={String((payload.recipientAddress as Record<string, string>)?.complement ?? "")} disabled={!isEditable} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs">Cidade</Label>
                      <Input name="recipientCity" defaultValue={String((payload.recipientAddress as Record<string, string>)?.city ?? "")} disabled={!isEditable} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">UF</Label>
                      <Input name="recipientState" maxLength={2} className="uppercase" defaultValue={String((payload.recipientAddress as Record<string, string>)?.state ?? "")} disabled={!isEditable} />
                    </div>
                  </div>
                </div>

                {isEditable && (
                  <Button type="submit" size="sm" disabled={updateMutation.isPending}>
                    Salvar Alteracoes
                  </Button>
                )}
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Items */}
        <div className="space-y-6">
          {isEditable && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Adicionar Item</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={addItemForm.handleSubmit((data) => {
                    addItemMutation.mutate({
                      invoiceId: id,
                      description: data.description,
                      code: data.code || null,
                      ncm: data.ncm || null,
                      cfop: data.cfop || null,
                      quantity: data.quantity,
                      unitPrice: data.unitPrice,
                    });
                  })}
                  className="space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Codigo</Label>
                      <Input {...addItemForm.register("code")} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">NCM</Label>
                      <Input {...addItemForm.register("ncm")} maxLength={8} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Descricao *</Label>
                    <Input {...addItemForm.register("description")} required />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">CFOP</Label>
                      <Input {...addItemForm.register("cfop")} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Qtd *</Label>
                      <Input type="number" step="0.01" min="0.01" {...addItemForm.register("quantity", { valueAsNumber: true })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Valor Unit. *</Label>
                      <MoneyInput
                        value={addItemForm.watch("unitPrice")}
                        onChange={(v) => addItemForm.setValue("unitPrice", v)}
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={addItemMutation.isPending}>
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar Item
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Itens ({invoice.items?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(invoice.items?.length ?? 0) > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descricao</TableHead>
                      <TableHead className="text-center">Qtd</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      {isEditable && <TableHead className="w-10" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoice.items?.map((item, idx) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <span className="font-medium">{item.description}</span>
                          {(item.ncm || item.cfop) && (
                            <span className="text-xs text-muted-foreground block">
                              {item.ncm ? `NCM: ${item.ncm}` : ""}{item.ncm && item.cfop ? " | " : ""}{item.cfop ? `CFOP: ${item.cfop}` : ""}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">{item.quantity}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCents(item.total)}
                        </TableCell>
                        {isEditable && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Remover item da NF-e"
                              onClick={() => setRemoveItemId(item.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    <TableRow className="font-bold">
                      <TableCell colSpan={2} className="text-right">TOTAL</TableCell>
                      <TableCell className="text-right text-primary font-mono">
                        {formatCents(invoice.totalAmount)}
                      </TableCell>
                      {isEditable && <TableCell />}
                    </TableRow>
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  Nenhum item adicionado. Use o formulario acima para adicionar.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmAuthorize}
        onOpenChange={setConfirmAuthorize}
        title="Enviar NF-e para a SEFAZ?"
        description="A nota sera transmitida e autorizada pela SEFAZ. Apos autorizada, alteracoes so podem ser feitas via cancelamento ou carta de correcao."
        confirmLabel="Enviar para SEFAZ"
        onConfirm={() => {
          setConfirmAuthorize(false);
          authorizeMutation.mutate({ invoiceId: id });
        }}
        isLoading={authorizeMutation.isPending}
      />

      <ConfirmDialog
        open={removeItemId !== null}
        onOpenChange={(open) => { if (!open) setRemoveItemId(null); }}
        title="Remover este item?"
        description="O item sera removido da NF-e em rascunho."
        confirmLabel="Remover"
        variant="destructive"
        onConfirm={() => {
          if (removeItemId) {
            removeItemMutation.mutate({ invoiceId: id, itemId: removeItemId });
            setRemoveItemId(null);
          }
        }}
        isLoading={removeItemMutation.isPending}
      />
    </div>
  );
}
