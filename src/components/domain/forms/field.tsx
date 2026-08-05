"use client";

import { useId } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Rótulo + campo, com a associação feita AUTOMATICAMENTE.
 *
 * Existe porque a auditoria de frontend (2026-08-04) encontrou 329 `<Label>`
 * soltos: sem `htmlFor` e sem envolver o input. Leitor de tela anuncia o campo
 * sem nome, e clicar no rótulo não foca nada. O `FormLabel` do shadcn já
 * resolvia isso, mas só funciona dentro de `react-hook-form` — metade das telas
 * usa estado local e ficava de fora.
 *
 * Aqui o `id` é gerado com `useId()` e entregue ao filho como render-prop, então
 * a ligação não depende de ninguém lembrar de escrever `htmlFor`. É o caminho
 * mais curto: quem usar `Field` acerta por construção.
 *
 * ```tsx
 * <Field label="Razao Social *">
 *   {(id) => <Input id={id} {...form.register("name")} />}
 * </Field>
 * ```
 *
 * Para `Select` do Radix, o id vai no `SelectTrigger`.
 */
export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  /** Texto de apoio abaixo do campo. Some quando há erro, para não competir. */
  hint?: string;
  /** Mensagem de validação. Ganha `role="alert"` e é referenciada pelo campo. */
  error?: string | null;
  required?: boolean;
  className?: string;
  children: (id: string, describedBy: string | undefined) => React.ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  // Aponta para a mensagem que está VISÍVEL: se houver erro, o hint some, e
  // referenciar um elemento inexistente confunde o leitor de tela.
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        )}
      </Label>
      {children(id, describedBy)}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive break-words">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted-foreground break-words">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
