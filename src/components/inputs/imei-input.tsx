"use client";

import { type ComponentProps, forwardRef, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { isValidLuhn } from "@/lib/validators/imei";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

type ImeiInputProps = Omit<ComponentProps<typeof Input>, "onChange" | "value"> & {
  value?: string;
  onValueChange?: (raw: string) => void;
  /** Quando true, suprime o feedback de erro (util quando o campo e opcional e vazio). */
  silentWhenEmpty?: boolean;
  /** Quando true, dispara stock.searchByImei debounced para alertar duplicidade. */
  checkDuplicate?: boolean;
};

/**
 * Input para IMEI: aceita apenas digitos, max 15. Mostra borda vermelha + mensagem
 * abaixo se o valor tem 15 digitos mas falha na validacao Luhn. Em formularios
 * onde IMEI e opcional, deixar o campo vazio nao dispara erro.
 *
 * Com `checkDuplicate`, valida tambem se ja existe StockItem com o mesmo IMEI
 * (debounce 500ms). Paridade Laravel EstoqueController::verificarImeiHistorico.
 */
export const ImeiInput = forwardRef<HTMLInputElement, ImeiInputProps>(
  function ImeiInput(
    { value = "", onValueChange, silentWhenEmpty = true, checkDuplicate = false, className, ...props },
    ref,
  ) {
    const digits = useMemo(() => value.replace(/\D/g, "").slice(0, 15), [value]);
    const showError = useMemo(() => {
      if (digits.length === 0 && silentWhenEmpty) return false;
      if (digits.length === 0) return true;
      if (digits.length < 15) return true;
      return !isValidLuhn(digits);
    }, [digits, silentWhenEmpty]);

    const trpc = useTRPC();
    const [debounced, setDebounced] = useState(digits);
    useEffect(() => {
      const t = setTimeout(() => setDebounced(digits), 500);
      return () => clearTimeout(t);
    }, [digits]);
    const dupCheckEnabled = checkDuplicate && debounced.length >= 8 && !showError;
    const { data: existing, isFetching: dupFetching } = useQuery({
      ...trpc.stock.searchByImei.queryOptions({ imei: debounced }),
      enabled: dupCheckEnabled,
      staleTime: 30_000,
    });

    const showRightIcon = checkDuplicate && debounced.length >= 8 && !showError;
    const hasDup = !!existing && dupCheckEnabled;

    return (
      <div className="space-y-1">
        <div className="relative">
          <Input
            {...props}
            ref={ref}
            type="text"
            inputMode="numeric"
            maxLength={15}
            value={digits}
            onChange={(e) => {
              const raw = e.target.value.replace(/\D/g, "").slice(0, 15);
              onValueChange?.(raw);
            }}
            placeholder="000000000000000"
            className={cn(
              showError && digits.length > 0 && "border-destructive focus-visible:ring-destructive",
              hasDup && "border-yellow-500/60",
              !hasDup && showRightIcon && !dupFetching && "border-green-500/60",
              showRightIcon && "pr-9",
              className,
            )}
          />
          {showRightIcon && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              {dupFetching ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : hasDup ? (
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              )}
            </div>
          )}
        </div>
        {showError && digits.length > 0 && (
          <p className="text-xs text-destructive">
            {digits.length < 15 ? `IMEI incompleto (${digits.length}/15)` : "IMEI invalido (falha Luhn)"}
          </p>
        )}
        {hasDup && (
          <p className="text-xs text-yellow-500">
            IMEI ja cadastrado: <strong>{existing.product?.name}</strong>
            {existing.product?.brand && ` — ${existing.product.brand}`}
            {existing.status === "SOLD" && " (vendido)"}
            {existing.status === "AVAILABLE" && " (disponivel)"}
            {existing.status === "RESERVED" && " (reservado)"}
          </p>
        )}
      </div>
    );
  },
);
