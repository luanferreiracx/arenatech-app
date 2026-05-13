"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormSection } from "@/components/domain/forms/form-section";
import { FormActions } from "@/components/domain/forms/form-actions";
import { toast } from "@/lib/toast";
import { sendMessageSchema, type SendMessageInput } from "@/lib/validators/communication";

export function SendMessageForm() {
  const router = useRouter();
  const trpc = useTRPC();

  const form = useForm<SendMessageInput>({
    resolver: zodResolver(sendMessageSchema),
    defaultValues: { channel: "WHATSAPP", recipientPhone: "", recipientEmail: "", recipientName: "", body: "" },
  });

  const sendMutation = useMutation(trpc.communication.send.mutationOptions());

  const channel = form.watch("channel");

  const onSubmit = (data: SendMessageInput) => {
    sendMutation.mutate(data, {
      onSuccess: () => {
        toast.success("Mensagem enviada");
        router.push("/communication");
      },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
      <FormSection title="Dados da Mensagem">
        <div className="space-y-4">
          <div>
            <Label>Canal</Label>
            <Select value={channel} onValueChange={(v) => form.setValue("channel", v as "WHATSAPP" | "EMAIL" | "SMS")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                <SelectItem value="EMAIL">E-mail</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Nome do Destinatario</Label>
            <Input {...form.register("recipientName")} placeholder="Nome" />
          </div>
          {channel === "WHATSAPP" && (
            <div>
              <Label>Telefone</Label>
              <Input {...form.register("recipientPhone")} placeholder="(99) 99999-9999" />
            </div>
          )}
          {channel === "EMAIL" && (
            <>
              <div>
                <Label>E-mail</Label>
                <Input {...form.register("recipientEmail")} placeholder="email@exemplo.com" />
              </div>
              <div>
                <Label>Assunto</Label>
                <Input {...form.register("subject")} placeholder="Assunto do e-mail" />
              </div>
            </>
          )}
          <div>
            <Label>Mensagem</Label>
            <Textarea {...form.register("body")} rows={5} placeholder="Digite sua mensagem..." />
            {form.formState.errors.body && (
              <p className="text-xs text-destructive mt-1">{form.formState.errors.body.message}</p>
            )}
          </div>
        </div>
      </FormSection>

      <FormActions
        submitLabel="Enviar"
        isLoading={sendMutation.isPending}
        onCancel={() => router.push("/communication")}
      />
    </form>
  );
}
