"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/lib/toast";

export function SendMessageForm() {
  const router = useRouter();
  const trpc = useTRPC();
  const [form, setForm] = useState({
    channel: "WHATSAPP" as "WHATSAPP" | "EMAIL",
    recipientPhone: "",
    recipientEmail: "",
    recipientName: "",
    subject: "",
    body: "",
  });

  const sendMutation = useMutation(
    trpc.communication.send.mutationOptions({
      onSuccess: () => {
        toast.success("Mensagem enviada");
        router.push("/communication");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Nova Mensagem</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Canal</Label>
          <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v as "WHATSAPP" | "EMAIL" })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
              <SelectItem value="EMAIL">E-mail</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Nome do Destinatario</Label>
          <Input value={form.recipientName} onChange={(e) => setForm({ ...form, recipientName: e.target.value })} />
        </div>
        {form.channel === "WHATSAPP" ? (
          <div>
            <Label>Telefone</Label>
            <Input value={form.recipientPhone} onChange={(e) => setForm({ ...form, recipientPhone: e.target.value })} placeholder="(99) 99999-9999" />
          </div>
        ) : (
          <>
            <div>
              <Label>E-mail</Label>
              <Input value={form.recipientEmail} onChange={(e) => setForm({ ...form, recipientEmail: e.target.value })} placeholder="email@exemplo.com" />
            </div>
            <div>
              <Label>Assunto</Label>
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </div>
          </>
        )}
        <div>
          <Label>Mensagem</Label>
          <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={5} />
        </div>
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => router.back()}>Cancelar</Button>
          <Button
            onClick={() => sendMutation.mutate({
              channel: form.channel,
              recipientPhone: form.channel === "WHATSAPP" ? form.recipientPhone : null,
              recipientEmail: form.channel === "EMAIL" ? form.recipientEmail : null,
              recipientName: form.recipientName || null,
              subject: form.subject || null,
              body: form.body,
            })}
            disabled={sendMutation.isPending || !form.body}
          >
            {sendMutation.isPending ? "Enviando..." : "Enviar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
