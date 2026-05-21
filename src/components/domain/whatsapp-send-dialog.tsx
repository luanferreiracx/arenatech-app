"use client";

import { useState } from "react";
import { MessageCircle, Pencil, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Modal padrao para envio de mensagens via WhatsApp.
 * Paridade Laravel components/modal-whatsapp-envio.blade.php.
 *
 * Usuario escolhe entre os telefones cadastrados do cliente OU digita outro.
 * onConfirm recebe o numero selecionado/digitado (string).
 */
export interface WhatsAppSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  customerName?: string | null;
  /** Telefone principal do cliente (celular_whatsapp) */
  primaryPhone?: string | null;
  /** Telefone alternativo do cliente */
  secondaryPhone?: string | null;
  /** Callback quando confirmar — recebe o numero escolhido (somente digitos ou formatado) */
  onConfirm: (phone: string) => Promise<void> | void;
  /** Estado de loading (durante o envio) */
  isLoading?: boolean;
  /** Texto do botao de confirmacao. Default: "Enviar" */
  confirmLabel?: string;
}

type Selection = "primary" | "secondary" | "custom";

export function WhatsAppSendDialog(props: WhatsAppSendDialogProps) {
  // Padrao recomendado: wrapper externo que reseta o estado via `key`
  // quando o dialog (re)abre. Evita setState em useEffect.
  if (!props.open) {
    // Render dialog "fechado" so para manter o portal/animacao do Dialog
    return <DialogShellClosed onOpenChange={props.onOpenChange} />;
  }
  return <WhatsAppSendDialogInner key={`${props.primaryPhone ?? ""}-${props.secondaryPhone ?? ""}`} {...props} />;
}

function DialogShellClosed({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={false} onOpenChange={onOpenChange}>
      <DialogContent />
    </Dialog>
  );
}

function WhatsAppSendDialogInner({
  open,
  onOpenChange,
  title,
  description,
  customerName,
  primaryPhone,
  secondaryPhone,
  onConfirm,
  isLoading = false,
  confirmLabel = "Enviar",
}: WhatsAppSendDialogProps) {
  // Normaliza: se alternativo == principal, ignora
  const altPhone = secondaryPhone && secondaryPhone !== primaryPhone ? secondaryPhone : null;
  const hasAnyPhone = !!primaryPhone || !!altPhone;

  const [selection, setSelection] = useState<Selection>(() => {
    if (primaryPhone) return "primary";
    if (altPhone) return "secondary";
    return "custom";
  });
  const [customPhone, setCustomPhone] = useState("");

  const handleConfirm = async () => {
    let phone: string;
    if (selection === "primary" && primaryPhone) phone = primaryPhone;
    else if (selection === "secondary" && altPhone) phone = altPhone;
    else phone = customPhone.replace(/\D/g, "");

    if (!phone || phone.replace(/\D/g, "").length < 10) {
      return; // Botao ja deve estar disabled, mas guard
    }
    await onConfirm(phone);
  };

  const isConfirmDisabled =
    isLoading ||
    (selection === "custom" && customPhone.replace(/\D/g, "").length < 10);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-500" />
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-3">
          {customerName && (
            <div className="text-sm text-muted-foreground">
              Cliente: <span className="font-medium text-foreground">{customerName}</span>
            </div>
          )}

          <div>
            <Label className="text-sm">Enviar para:</Label>
            <div className="mt-2 space-y-2">
              {primaryPhone && (
                <label
                  className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                    selection === "primary" ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name="phone"
                    checked={selection === "primary"}
                    onChange={() => setSelection("primary")}
                    className="accent-green-500"
                  />
                  <MessageCircle className="h-4 w-4 text-green-500" />
                  <span className="font-mono">{primaryPhone}</span>
                  <span className="text-xs text-muted-foreground ml-auto">principal</span>
                </label>
              )}

              {altPhone && (
                <label
                  className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                    selection === "secondary" ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name="phone"
                    checked={selection === "secondary"}
                    onChange={() => setSelection("secondary")}
                    className="accent-green-500"
                  />
                  <MessageCircle className="h-4 w-4 text-green-500" />
                  <span className="font-mono">{altPhone}</span>
                  <span className="text-xs text-muted-foreground ml-auto">alternativo</span>
                </label>
              )}

              <label
                className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                  selection === "custom" ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                }`}
              >
                <input
                  type="radio"
                  name="phone"
                  checked={selection === "custom"}
                  onChange={() => setSelection("custom")}
                  className="accent-green-500"
                />
                <Pencil className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {hasAnyPhone ? "Digitar outro número" : "Digitar número"}
                </span>
              </label>

              {selection === "custom" && (
                <Input
                  autoFocus
                  type="tel"
                  inputMode="numeric"
                  placeholder="(00) 00000-0000"
                  value={customPhone}
                  onChange={(e) => setCustomPhone(e.target.value)}
                  className="text-center font-mono"
                />
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={isConfirmDisabled}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <MessageCircle className="mr-2 h-4 w-4" />
                {confirmLabel}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
