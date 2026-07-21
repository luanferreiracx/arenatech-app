"use client";

import { useEffect, useState } from "react";

/**
 * Retorna uma versao "atrasada" de `value` que so muda apos `delayMs` sem novas
 * alteracoes. Cada mudanca cancela o timer anterior (ao contrario do padrao
 * quebrado de retornar a cleanup de um setTimeout para quem descarta o retorno).
 *
 * Uso tipico: alimentar uma query de busca sem disparar uma requisicao por
 * tecla.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
