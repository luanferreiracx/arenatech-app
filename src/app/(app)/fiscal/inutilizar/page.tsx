"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PageHeader } from "@/components/domain/page-header";
import { FormSection } from "@/components/domain/forms/form-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { inutilizarSchema, type InutilizarInput } from "@/lib/validators/fiscal";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";

export default function InutilizarPage() {
  const trpc = useTRPC();
  const [pendingInput, setPendingInput] = useState<InutilizarInput | null>(null);

  const form = useForm<InutilizarInput>({
    resolver: zodResolver(inutilizarSchema),
    defaultValues: {
      model: "55",
      series: "1",
      startNumber: undefined,
      endNumber: undefined,
      justification: "",
    },
  });

  const inutilizarMutation = useMutation(
    trpc.fiscal.inutilizar.mutationOptions({
      onSuccess: (data) => {
        toast.success(`${data.quantity} numero(s) inutilizado(s) com sucesso`);
        form.reset();
        setPendingInput(null);
      },
      onError: (err) => {
        toast.error(err.message);
        setPendingInput(null);
      },
    }),
  );

  const handleSubmit = form.handleSubmit((data) => {
    if (data.endNumber < data.startNumber) {
      toast.error("Numero final deve ser maior ou igual ao inicial");
      return;
    }
    setPendingInput(data);
  });

  const pendingQuantity = pendingInput
    ? pendingInput.endNumber - pendingInput.startNumber + 1
    : 0;
  const pendingModelName = pendingInput?.model === "55" ? "NF-e" : "NFC-e";

  return (
    <div>
      <PageHeader
        title="Inutilizar Numeracao"
        subtitle="Inutilizacao de faixa de numeracao de NF-e/NFC-e"
        actions={
          <Button variant="outline" asChild>
            <Link href="/fiscal">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados para Inutilizacao</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-sm text-yellow-400 mb-4 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                <strong>Atencao!</strong> A inutilizacao e irreversivel. Use apenas quando houver
                quebra de sequencia na numeracao.
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Modelo *</Label>
                  <Select
                    value={form.watch("model")}
                    onValueChange={(v) => form.setValue("model", v as "55" | "65")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="55">55 - NF-e</SelectItem>
                      <SelectItem value="65">65 - NFC-e</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Serie *</Label>
                  <Input {...form.register("series")} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Numero Inicial *</Label>
                  <Input
                    type="number"
                    min={1}
                    {...form.register("startNumber", { valueAsNumber: true })}
                  />
                  {form.formState.errors.startNumber && (
                    <p className="text-xs text-destructive">{form.formState.errors.startNumber.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Numero Final *</Label>
                  <Input
                    type="number"
                    min={1}
                    {...form.register("endNumber", { valueAsNumber: true })}
                  />
                  {form.formState.errors.endNumber && (
                    <p className="text-xs text-destructive">{form.formState.errors.endNumber.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Justificativa * (minimo 15 caracteres)</Label>
                <Textarea
                  {...form.register("justification")}
                  rows={4}
                  placeholder="Descreva o motivo da inutilizacao..."
                />
                {form.formState.errors.justification && (
                  <p className="text-xs text-destructive">{form.formState.errors.justification.message}</p>
                )}
              </div>

              <Button type="submit" variant="destructive" className="w-full" disabled={inutilizarMutation.isPending}>
                Inutilizar Numeracao
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informacoes Importantes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div>
              <h4 className="font-medium text-foreground mb-1">Quando inutilizar?</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>Quando houver quebra de sequencia na numeracao</li>
                <li>Notas que foram puladas por erro no sistema</li>
                <li>Numeracao reservada que nao sera mais utilizada</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium text-foreground mb-1">Prazo para inutilizacao</h4>
              <p>
                A inutilizacao deve ser feita ate o 10o dia do mes subsequente ao da numeracao
                que deveria ter sido utilizada.
              </p>
            </div>

            <div>
              <h4 className="font-medium text-foreground mb-1">O que acontece apos inutilizar?</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>Os numeros informados serao registrados na SEFAZ como inutilizados</li>
                <li>Esses numeros nao poderao mais ser utilizados para emissao</li>
                <li>O processo e irreversivel</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={pendingInput !== null}
        onOpenChange={(open) => { if (!open) setPendingInput(null); }}
        title="Inutilizar numeracao?"
        description={
          pendingInput
            ? `Confirmar a inutilizacao de ${pendingQuantity} numero(s) de ${pendingModelName} (${pendingInput.startNumber} a ${pendingInput.endNumber})? Esta acao e IRREVERSIVEL.`
            : ""
        }
        confirmLabel="Inutilizar (irreversivel)"
        variant="destructive"
        onConfirm={() => {
          if (pendingInput) inutilizarMutation.mutate(pendingInput);
        }}
        isLoading={inutilizarMutation.isPending}
      />
    </div>
  );
}
