"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepItem {
  id: number;
  label: string;
}

interface WizardStepperProps {
  steps: StepItem[];
  current: number;
  className?: string;
}

/**
 * Indicador de progresso do wizard. Bullets numerados + linha conectora
 * preenchida conforme avanca. Cor dourada (--primary) marca o passo ativo;
 * passos concluidos ganham um check. Mobile: labels colapsam em sr-only.
 */
export function WizardStepper({ steps, current, className }: WizardStepperProps) {
  return (
    <nav
      aria-label="Progresso"
      className={cn("flex items-center justify-between w-full max-w-md mx-auto", className)}
    >
      {steps.map((step, idx) => {
        const isCompleted = step.id < current;
        const isActive = step.id === current;
        const isLast = idx === steps.length - 1;
        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            {/* bullet */}
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div
                aria-current={isActive ? "step" : undefined}
                className={cn(
                  "h-9 w-9 rounded-full grid place-items-center text-sm font-semibold transition-all duration-200",
                  "border-2",
                  isCompleted &&
                    "bg-primary border-primary text-primary-foreground",
                  isActive &&
                    "border-primary text-primary bg-primary/10 shadow-[0_0_0_4px_var(--primary)]/15",
                  !isCompleted && !isActive &&
                    "border-border text-muted-foreground bg-card",
                )}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" strokeWidth={3} />
                ) : (
                  step.id
                )}
              </div>
              <span
                className={cn(
                  "text-[10px] uppercase tracking-wider font-medium hidden sm:block",
                  isActive && "text-primary",
                  isCompleted && "text-foreground",
                  !isActive && !isCompleted && "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </div>

            {/* linha conectora */}
            {!isLast && (
              <div className="flex-1 h-[2px] mx-2 sm:mx-3 mb-5 sm:mb-5 rounded-full bg-border relative overflow-hidden">
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 bg-primary transition-[width] duration-500 ease-out",
                    isCompleted ? "w-full" : "w-0",
                  )}
                />
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
