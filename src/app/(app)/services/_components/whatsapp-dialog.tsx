"use client";

import { useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/inputs/phone-input";
import { toast } from "@/lib/toast";
import { MessageCircle, Loader2 } from "lucide-react";

interface WhatsAppDialogProps {
  service: {
    id: string;
    serviceType: string | null;
    deviceModel: string | null;
    basePrice: number;
  } | null;
  onClose: () => void;
}

export function WhatsAppDialog({ service, onClose }: WhatsAppDialogProps) {
  const trpc = useTRPC();
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");

  const sendMutation = useMutation(
    trpc.catalog.sendServiceWhatsApp.mutationOptions({
      onSuccess: () => {
        toast.success("Orcamento enviado via WhatsApp!");
        handleClose();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  function handleClose() {
    setClientName("");
    setClientPhone("");
    onClose();
  }

  function handleSend() {
    if (!service) return;
    if (!clientName.trim()) {
      toast.error("Informe o nome do cliente");
      return;
    }
    if (clientPhone.length < 10) {
      toast.error("Informe um telefone valido");
      return;
    }
    sendMutation.mutate({
      serviceId: service.id,
      clientName: clientName.trim(),
      clientPhone,
    });
  }

  const serviceName = service
    ? `${service.serviceType ?? ""} - ${service.deviceModel ?? ""}`.trim()
    : "";

  return (
    <Dialog open={service !== null} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-[#25D366]" />
            Enviar Orcamento via WhatsApp
          </DialogTitle>
          <DialogDescription>
            {serviceName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="client-name">Nome do Cliente</Label>
            <Input
              id="client-name"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Nome do cliente"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-phone">Telefone</Label>
            <PhoneInput
              id="client-phone"
              value={clientPhone}
              onValueChange={setClientPhone}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            className="bg-[#25D366] hover:bg-[#128C7E] text-white"
            onClick={handleSend}
            disabled={sendMutation.isPending}
          >
            {sendMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <MessageCircle className="mr-2 h-4 w-4" />
            )}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
