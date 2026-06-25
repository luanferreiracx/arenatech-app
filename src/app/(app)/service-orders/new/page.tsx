"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/domain/page-header";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { toast } from "@/lib/toast";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { StepCustomer } from "./_steps/step-customer";
import { StepDevice } from "./_steps/step-device";
import { StepProblem } from "./_steps/step-problem";
import { StepItems } from "./_steps/step-items";
import { StepSummary } from "./_steps/step-summary";
import type { CreateServiceOrderInput } from "@/lib/validators/service-order";

const STEPS = [
  { label: "Cliente", description: "Selecione o cliente" },
  { label: "Equipamento", description: "Dados do equipamento" },
  { label: "Problema", description: "Problema + checklist" },
  { label: "Itens", description: "Servicos e pecas" },
  { label: "Resumo", description: "Revisar e confirmar" },
];

type WizardData = Partial<CreateServiceOrderInput>;

export default function NewServiceOrderPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>({
    items: [],
    isWarranty: false,
    warrantyMonths: 3,
  });
  // OS recem-criada — dispara o modal de confirmacao de envio do rastreamento.
  const [createdOrder, setCreatedOrder] = useState<{ id: string; number: string } | null>(null);

  const sendTrackingMut = useMutation(
    trpc.serviceOrder.sendTracking.mutationOptions({
      onSuccess: () => toast.success("Link de rastreamento enviado ao cliente!"),
      onError: (e) => toast.error(e.message),
      onSettled: () => {
        if (createdOrder) router.push(`/service-orders/${createdOrder.id}`);
      },
    })
  );

  const createMutation = useMutation(
    trpc.serviceOrder.create.mutationOptions({
      onSuccess: (result) => {
        toast.success(`OS ${result.number} criada com sucesso!`);
        void queryClient.invalidateQueries({ queryKey: [["serviceOrder"]] });
        // Abre o modal de confirmacao de envio do rastreamento ao cliente; o
        // redirecionamento para o detalhe acontece apos enviar ou pular.
        setCreatedOrder({ id: result.id, number: result.number });
      },
      onError: (err) => {
        toast.error(err.message ?? "Erro ao criar OS");
      },
    })
  );

  const updateData = useCallback((patch: Partial<WizardData>) => {
    setData((prev) => ({ ...prev, ...patch }));
  }, []);

  const canAdvance = (): boolean => {
    if (step === 0) return !!data.customerId;
    if (step === 2) return !!data.reportedProblem;
    return true;
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    }
  };

  const handlePrev = () => {
    if (step > 0) {
      setStep((s) => s - 1);
    }
  };

  const handleSubmit = () => {
    if (!data.customerId || !data.reportedProblem) {
      toast.error("Preencha os campos obrigatorios");
      return;
    }
    if (!data.technicianId && !data.serviceProviderId) {
      toast.error("Selecione o tecnico responsavel");
      return;
    }

    createMutation.mutate({
      customerId: data.customerId,
      deviceType: data.deviceType ?? null,
      deviceBrand: data.deviceBrand ?? null,
      deviceModel: data.deviceModel ?? null,
      serialNumber: data.serialNumber ?? null,
      imei: data.imei ?? null,
      devicePassword: data.devicePassword ?? null,
      accessories: data.accessories ?? null,
      reportedProblem: data.reportedProblem,
      entryChecklist: data.entryChecklist,
      deviceInfo: data.deviceInfo,
      items: data.items ?? [],
      technicianId: data.technicianId ?? null,
      serviceProviderId: data.serviceProviderId ?? null,
      vendorId: data.vendorId ?? null,
      isWarranty: data.isWarranty ?? false,
      warrantyType: data.warrantyType ?? null,
      warrantyMonths: data.warrantyMonths ?? 3,
      originalOrderId: data.originalOrderId ?? null,
      customerNotes: data.customerNotes ?? null,
      estimatedDate: data.estimatedDate ?? null,
    });
  };

  return (
    <div>
      <PageHeader
        title="Nova Ordem de Servico"
        subtitle="Preencha os dados do equipamento e problema relatado"
      />

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
        {STEPS.map((s, i) => (
          <div key={s.label} className="flex items-center">
            <button
              onClick={() => i < step && setStep(i)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                i === step
                  ? "bg-primary/10 text-primary border border-primary/30"
                  : i < step
                    ? "bg-success/10 text-success cursor-pointer"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              <span
                className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                  i === step
                    ? "bg-primary text-primary-foreground"
                    : i < step
                      ? "bg-success text-white"
                      : "bg-muted-foreground/20 text-muted-foreground"
                }`}
              >
                {i < step ? <Check className="w-3 h-3" /> : i + 1}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div className={`w-8 h-0.5 mx-1 ${i < step ? "bg-success" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="rounded-lg border border-border bg-card p-6">
        {step === 0 && <StepCustomer data={data} onChange={updateData} />}
        {step === 1 && <StepDevice data={data} onChange={updateData} />}
        {step === 2 && <StepProblem data={data} onChange={updateData} />}
        {step === 3 && <StepItems data={data} onChange={updateData} />}
        {step === 4 && <StepSummary data={data} onChange={updateData} />}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6">
        <Button
          variant="outline"
          onClick={step === 0 ? () => router.push("/service-orders") : handlePrev}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {step === 0 ? "Voltar" : "Anterior"}
        </Button>

        {step < STEPS.length - 1 ? (
          <Button onClick={handleNext} disabled={!canAdvance()}>
            Proximo
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || (!data.technicianId && !data.serviceProviderId)}
          >
            {createMutation.isPending ? "Criando..." : "Criar OS"}
            <Check className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Confirmacao de envio do link de rastreamento ao cliente apos criar a OS. */}
      <ConfirmDialog
        open={!!createdOrder}
        onOpenChange={(o) => {
          // Fechar sem enviar (Cancelar/Pular) = vai pro detalhe sem rastreamento.
          if (!o && createdOrder && !sendTrackingMut.isPending) {
            router.push(`/service-orders/${createdOrder.id}`);
          }
        }}
        title={`OS ${createdOrder?.number ?? ""} criada`}
        description="Enviar o link de rastreamento ao cliente por WhatsApp agora?"
        confirmLabel="Enviar rastreamento"
        isLoading={sendTrackingMut.isPending}
        onConfirm={() => {
          if (createdOrder) sendTrackingMut.mutate({ orderId: createdOrder.id });
        }}
      />
    </div>
  );
}
