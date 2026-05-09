"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { PhoneInput } from "@/components/inputs/phone-input";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import {
  sendMessageSchema,
  messageChannelValues,
  messageChannelLabels,
  type SendMessageInput,
} from "@/lib/validators/communication";

export function SendMessageForm() {
  const router = useRouter();
  const trpc = useTRPC();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<SendMessageInput>({
    resolver: zodResolver(sendMessageSchema),
    defaultValues: {
      channel: "WHATSAPP",
      recipientPhone: "",
      recipientEmail: "",
      recipientName: "",
      subject: "",
      body: "",
    },
  });

  const sendMutation = useMutation(
    trpc.communication.send.mutationOptions({
      onSuccess: (data) => {
        if (data.status === "SENT" || data.status === "DELIVERED") {
          toast.success("Mensagem enviada com sucesso!");
        } else if (data.status === "FAILED") {
          toast.error(`Falha ao enviar: ${data.errorMessage ?? "Erro desconhecido"}`);
        } else {
          toast.success("Mensagem em processamento");
        }
        router.push("/communication");
      },
      onError: (err) => {
        toast.error(err.message);
        setSubmitting(false);
      },
    }),
  );

  const channel = form.watch("channel");

  const onSubmit = (data: SendMessageInput) => {
    setSubmitting(true);
    sendMutation.mutate(data);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <FormSection title="Canal e Destinatário">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Canal *</Label>
            <Select
              value={channel}
              onValueChange={(v) => form.setValue("channel", v as SendMessageInput["channel"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {messageChannelValues
                  .filter((c) => c !== "SMS")
                  .map((c) => (
                    <SelectItem key={c} value={c}>
                      {messageChannelLabels[c]}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Nome do Destinatário</Label>
            <Input {...form.register("recipientName")} placeholder="Nome" />
          </div>

          {channel === "WHATSAPP" && (
            <div className="space-y-2">
              <Label>Telefone *</Label>
              <PhoneInput
                value={form.watch("recipientPhone") ?? ""}
                onValueChange={(val: string) => form.setValue("recipientPhone", val)}
              />
            </div>
          )}

          {channel === "EMAIL" && (
            <>
              <div className="space-y-2">
                <Label>E-mail *</Label>
                <Input
                  type="email"
                  {...form.register("recipientEmail")}
                  placeholder="email@exemplo.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Assunto</Label>
                <Input {...form.register("subject")} placeholder="Assunto do e-mail" />
              </div>
            </>
          )}
        </div>
      </FormSection>

      <FormSection title="Mensagem">
        <div className="space-y-2">
          <Label>Corpo da Mensagem *</Label>
          <Textarea
            {...form.register("body")}
            placeholder="Digite sua mensagem..."
            rows={6}
          />
          {form.formState.errors.body && (
            <p className="text-xs text-destructive">{form.formState.errors.body.message}</p>
          )}
        </div>
      </FormSection>

      <FormActions
        isLoading={submitting}
        submitLabel="Enviar"
        onCancel={() => router.push("/communication")}
      />
    </form>
  );
}
