"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FormActionsProps {
  isLoading?: boolean;
  onCancel?: () => void;
  submitLabel?: string;
  className?: string;
}

export function FormActions({
  isLoading = false,
  onCancel,
  submitLabel = "Salvar",
  className,
}: FormActionsProps) {
  return (
    <div className={cn("flex items-center justify-end gap-3 pt-4 border-t border-border", className)}>
      {onCancel && (
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancelar
        </Button>
      )}
      <Button type="submit" disabled={isLoading}>
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
    </div>
  );
}
