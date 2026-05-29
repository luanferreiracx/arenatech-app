"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

interface DiscountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (
    type: "fixed" | "percentage",
    value: number,
    reason: string | null,
  ) => void;
  isPending: boolean;
  /** Subtotal em centavos — limita o desconto fixo (nao pode passar disso). */
  subtotalCents?: number;
}

export function DiscountDialog({
  open,
  onOpenChange,
  onApply,
  isPending,
  subtotalCents,
}: DiscountDialogProps) {
  const [discountType, setDiscountType] = useState<"fixed" | "percentage">(
    "fixed",
  );
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");

  const handleApply = () => {
    const value = parseFloat(discountValue) || 0;
    if (value <= 0) {
      toast.error("Informe um valor de desconto valido");
      return;
    }
    if (discountType === "percentage" && value > 100) {
      toast.error("O percentual de desconto nao pode passar de 100%.");
      return;
    }
    if (
      discountType === "fixed" &&
      subtotalCents != null &&
      Math.round(value * 100) > subtotalCents
    ) {
      toast.error("O desconto nao pode ser maior que o subtotal da venda.");
      return;
    }
    onApply(discountType, value, discountReason || null);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setDiscountValue("");
      setDiscountReason("");
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aplicar Desconto</DialogTitle>
          <DialogDescription>
            Escolha o tipo e informe o valor do desconto
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Tipo de Desconto</Label>
            <div className="flex gap-2 mt-2">
              <Button
                type="button"
                variant={discountType === "fixed" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setDiscountType("fixed")}
              >
                R$ Valor
              </Button>
              <Button
                type="button"
                variant={discountType === "percentage" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setDiscountType("percentage")}
              >
                % Percentual
              </Button>
            </div>
          </div>
          <div>
            <Label htmlFor="discountValue">
              {discountType === "fixed" ? "Valor (R$)" : "Percentual (%)"}
            </Label>
            <Input
              id="discountValue"
              type="number"
              step={discountType === "fixed" ? "0.01" : "1"}
              min="0"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder={discountType === "fixed" ? "0,00" : "0"}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleApply();
                }
              }}
            />
          </div>
          <div>
            <Label htmlFor="discountReason">Motivo (opcional)</Label>
            <Input
              id="discountReason"
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
              placeholder="Ex: Cliente fidelidade"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleApply} disabled={isPending}>
            Aplicar Desconto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
