"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { MessageSquare, Loader2, Clock, CheckCircle2 } from "lucide-react";

export type MessageDialogCustomer = {
  id: string;
  name: string;
  phone: string | null;
};

/**
 * Envio de WhatsApp in-app a um cliente (Cloud API), ciente da janela de 24h.
 *
 * Contexto (decisão do dono): a conversa livre com o cliente é pelo Chatwoot; o
 * app envia TEMPLATES/notificações. A Meta só entrega texto livre DENTRO da janela
 * de 24h (após o cliente escrever). Fora dela — hoje o padrão do sistema — só um
 * template aprovado é entregue; a mensagem digitada não chega, e a resposta do
 * cliente cai no Chatwoot. O dialog deixa isso explícito antes de enviar.
 */
export function CustomerMessageDialog({
  customer,
  open,
  onOpenChange,
}: {
  customer: MessageDialogCustomer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");

  const statusQuery = useQuery(
    trpc.communication.conversationWindowStatus.queryOptions(
      { customerId: customer?.id ?? "" },
      { enabled: open && !!customer?.id },
    ),
  );
  const status = statusQuery.data;

  const sendMutation = useMutation(
    trpc.communication.sendToCustomer.mutationOptions({
      onSuccess: () => {
        toast.success("Mensagem enviada.");
        setBody("");
        setSubject("");
        onOpenChange(false);
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const canSend =
    !!customer &&
    body.trim().length > 0 &&
    !!status?.hasPhone &&
    !status?.unsubscribed &&
    !sendMutation.isPending;

  const handleSend = () => {
    if (!customer) return;
    sendMutation.mutate({
      customerId: customer.id,
      channel: "WHATSAPP",
      body: body.trim(),
      subject: subject.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Enviar WhatsApp
          </DialogTitle>
          <DialogDescription>
            {customer ? `Para ${customer.name}` : ""}
          </DialogDescription>
        </DialogHeader>

        {statusQuery.isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !status?.hasPhone ? (
          <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            Este cliente não tem telefone cadastrado.
          </p>
        ) : status.unsubscribed ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            Cliente optou por não receber comunicações (LGPD).
          </p>
        ) : (
          <div className="space-y-4">
            {/* Aviso de janela de 24h */}
            {status.withinWindow ? (
              <div className="flex items-start gap-2 rounded-md border border-success/40 bg-success/10 p-3 text-sm text-success">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Dentro da janela de 24h — sua mensagem será entregue como texto.</span>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Fora da janela de 24h — a Meta só entrega template aprovado. Enviaremos o
                  modelo de contato padrão; ao responder, a conversa abre no Chatwoot.
                </span>
              </div>
            )}

            {!status.withinWindow && (
              <div className="space-y-1.5">
                <Label htmlFor="msg-subject">Assunto (aparece no modelo)</Label>
                <Input
                  id="msg-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="ex.: seu pedido, sua avaliação..."
                  maxLength={200}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="msg-body">Mensagem</Label>
              <Textarea
                id="msg-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Escreva a mensagem..."
                rows={4}
                maxLength={5000}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={!canSend}>
            {sendMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
