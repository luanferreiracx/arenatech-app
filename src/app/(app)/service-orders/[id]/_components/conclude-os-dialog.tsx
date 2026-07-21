"use client";

import { useState } from "react";
import { CheckCheck, Loader2, MessageCircle } from "lucide-react";
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
 * Diálogo de conclusão da OS com opção de avisar o cliente por WhatsApp.
 *
 * Antes, concluir pela UI nunca enviava o WhatsApp (o `updateStatus` aceita
 * `notifyWhatsapp`/`notifyPhone`, mas o flag nunca era passado). Aqui o operador
 * decide na hora se avisa e para qual número — paridade Laravel `notificar_whatsapp`.
 */
export interface ConcludeOsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName?: string | null;
  primaryPhone?: string | null;
  secondaryPhone?: string | null;
  /** Conclusão pulando etapas intermediárias (muda o texto + a nota). */
  skipping?: boolean;
  isLoading?: boolean;
  onConfirm: (args: { notifyWhatsapp: boolean; notifyPhone: string | null }) => void;
}

export function ConcludeOsDialog(props: ConcludeOsDialogProps) {
  if (!props.open) {
    return (
      <Dialog open={false} onOpenChange={props.onOpenChange}>
        <DialogContent />
      </Dialog>
    );
  }
  return (
    <ConcludeOsDialogInner
      key={`${props.primaryPhone ?? ""}-${props.secondaryPhone ?? ""}`}
      {...props}
    />
  );
}

type Selection = "primary" | "secondary" | "custom";

function ConcludeOsDialogInner({
  open,
  onOpenChange,
  customerName,
  primaryPhone,
  secondaryPhone,
  skipping = false,
  isLoading = false,
  onConfirm,
}: ConcludeOsDialogProps) {
  const altPhone = secondaryPhone && secondaryPhone !== primaryPhone ? secondaryPhone : null;
  const hasAnyPhone = !!primaryPhone || !!altPhone;

  const [notify, setNotify] = useState(hasAnyPhone);
  const [selection, setSelection] = useState<Selection>(() => {
    if (primaryPhone) return "primary";
    if (altPhone) return "secondary";
    return "custom";
  });
  const [customPhone, setCustomPhone] = useState("");

  const resolvedPhone = (() => {
    if (selection === "primary" && primaryPhone) return primaryPhone;
    if (selection === "secondary" && altPhone) return altPhone;
    return customPhone.replace(/\D/g, "");
  })();

  const notifyPhoneInvalid = notify && resolvedPhone.replace(/\D/g, "").length < 10;

  const handleConfirm = () => {
    if (notifyPhoneInvalid) return;
    onConfirm({ notifyWhatsapp: notify, notifyPhone: notify ? resolvedPhone : null });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCheck className="h-5 w-5 text-success" />
            Concluir OS
          </DialogTitle>
          <DialogDescription>
            {skipping
              ? "A OS será marcada como Concluída, pulando as etapas intermediárias (diagnóstico, aprovação, execução). Confirme que o serviço foi finalizado."
              : "A OS será marcada como Concluída."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
              className="accent-green-500"
            />
            <MessageCircle className="h-4 w-4 text-success" />
            Avisar o cliente por WhatsApp (aparelho pronto)
          </label>

          {notify && (
            <div className="rounded-md border p-3 space-y-2">
              {customerName && (
                <div className="text-xs text-muted-foreground">
                  Cliente: <span className="font-medium text-foreground">{customerName}</span>
                </div>
              )}
              <Label className="text-xs">Enviar para:</Label>
              {primaryPhone && (
                <PhoneOption
                  checked={selection === "primary"}
                  onSelect={() => setSelection("primary")}
                  label={primaryPhone}
                  hint="principal"
                />
              )}
              {altPhone && (
                <PhoneOption
                  checked={selection === "secondary"}
                  onSelect={() => setSelection("secondary")}
                  label={altPhone}
                  hint="alternativo"
                />
              )}
              <PhoneOption
                checked={selection === "custom"}
                onSelect={() => setSelection("custom")}
                label={hasAnyPhone ? "Digitar outro número" : "Digitar número"}
                muted
              />
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
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading || notifyPhoneInvalid}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Concluindo...
              </>
            ) : (
              <>
                <CheckCheck className="mr-2 h-4 w-4" />
                Concluir{notify ? " e avisar" : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PhoneOption({
  checked,
  onSelect,
  label,
  hint,
  muted,
}: {
  checked: boolean;
  onSelect: () => void;
  label: string;
  hint?: string;
  muted?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-3 p-2 rounded-md border cursor-pointer transition-colors ${
        checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
      }`}
    >
      <input
        type="radio"
        name="conclude-phone"
        checked={checked}
        onChange={onSelect}
        className="accent-green-500"
      />
      <span className={muted ? "text-muted-foreground" : "font-mono"}>{label}</span>
      {hint && <span className="text-xs text-muted-foreground ml-auto">{hint}</span>}
    </label>
  );
}
