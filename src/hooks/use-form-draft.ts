"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Rascunho local de formulário longo, em `sessionStorage`.
 *
 * Existe porque nenhum formulário longo tinha proteção: o wizard de OS guarda
 * os 5 passos num único `useState`, e fechar a aba no passo 4 perdia cliente,
 * aparelho, checklist e itens. O mesmo vale para a compra de aparelho, com ~20
 * campos. Um clique errado em Cancelar, um F5, um crash de aba — e o operador
 * recomeça do zero, com o cliente na frente.
 * Auditoria de frontend 2026-08-04.
 *
 * `sessionStorage`, não `localStorage`: o rascunho é da SESSÃO de trabalho.
 * Carregar para o dia seguinte reabriria um formulário que ninguém lembra de
 * ter começado — pior que perder.
 *
 * Não substitui salvar no servidor; é rede de segurança para o caminho até lá.
 */
export function useFormDraft<T>(
  key: string,
  initial: T,
  opts?: {
    /** Descarta rascunho mais velho que isto. Padrão: 12h (um turno). */
    maxAgeMs?: number;
  },
): {
  value: T;
  setValue: (next: T | ((prev: T) => T)) => void;
  /** Havia rascunho salvo quando a tela abriu? Use para avisar o operador. */
  restored: boolean;
  /** Limpa o rascunho. Chame após salvar com sucesso. */
  clear: () => void;
} {
  const maxAgeMs = opts?.maxAgeMs ?? 12 * 60 * 60 * 1000;
  const storageKey = `draft:${key}`;
  // Nasce no valor inicial — igual ao que o servidor renderiza.
  const [value, setValueRaw] = useState<T>(initial);
  const [restored, setRestored] = useState(false);

  // `useSyncExternalStore` é o primitivo do React para ler estado EXTERNO
  // (aqui, o `sessionStorage`) sem quebrar a hidratação: o `getServerSnapshot`
  // devolve `false` no servidor, e o React sabe que a diferença é esperada.
  //
  // Ler o storage direto no `useState` inicial quebrava a hidratação de
  // verdade — o servidor renderiza o formulário vazio, o cliente o restaurado,
  // e o React descarta a árvore ("Hydration failed"). Só apareceu no log do
  // dev server; typecheck e lint passavam. E `setState` dentro de `useEffect`
  // resolvia, mas dispara `react-hooks/set-state-in-effect` (renders em
  // cascata). Este é o caminho correto para os dois problemas.
  const hasDraft = useSyncExternalStore(
    subscribeToNothing,
    () => readDraft<T>(storageKey, maxAgeMs) !== null,
    () => false,
  );

  // Restaura uma única vez, quando o cliente confirma que há rascunho.
  if (hasDraft && !restored) {
    const saved = readDraft<T>(storageKey, maxAgeMs);
    if (saved !== null) {
      // setState durante o render é legítimo aqui: é o padrão do React para
      // "ajustar estado quando uma prop/leitura externa muda", e roda antes de
      // qualquer efeito ou pintura.
      setValueRaw(saved);
      setRestored(true);
    }
  }

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValueRaw((prev) => {
        const resolved =
          typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        writeDraft(storageKey, resolved);
        return resolved;
      });
    },
    [storageKey],
  );

  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // storage indisponível: nada a limpar, e não vale derrubar a tela.
    }
    setRestored(false);
  }, [storageKey]);

  // Salva também quando a aba some (fechar, trocar de app, celular bloqueando).
  // `visibilitychange` é o único evento confiável em mobile — `beforeunload`
  // não dispara em iOS.
  useEffect(() => {
    const save = () => writeDraft(storageKey, value);
    document.addEventListener("visibilitychange", save);
    return () => document.removeEventListener("visibilitychange", save);
  }, [storageKey, value]);

  return { value, setValue, restored, clear };
}

/** O storage não emite eventos que nos interessem: leitura é one-shot. */
function subscribeToNothing(): () => void {
  return () => {};
}

/**
 * Mesma rede de segurança, para formulários de `react-hook-form`.
 *
 * O `useFormDraft` acima serve a formulários com `useState` (o wizard de OS).
 * Aqui o estado vive no RHF, então o rascunho é gravado a cada mudança do
 * `watch` e devolvido via `reset` na montagem.
 *
 * @returns `restored` (havia rascunho ao abrir) e `clear` (chame ao salvar).
 */
export function useRhfDraft<T extends Record<string, unknown>>(
  key: string,
  form: {
    watch: (cb: (values: unknown) => void) => { unsubscribe: () => void };
    reset: (values: T) => void;
    getValues: () => T;
  },
  opts?: { maxAgeMs?: number },
): { restored: boolean; clear: () => void } {
  const maxAgeMs = opts?.maxAgeMs ?? 12 * 60 * 60 * 1000;
  const storageKey = `draft:${key}`;
  // Só isto é estado: se o operador dispensou o rascunho ("Começar do zero").
  // O resto é DERIVADO da leitura do storage — não precisa de `setState`.
  const [dismissed, setDismissed] = useState(false);

  const hasDraft = useSyncExternalStore(
    subscribeToNothing,
    () => readDraft<T>(storageKey, maxAgeMs) !== null,
    () => false,
  );

  // O `reset` precisa rodar num efeito: mexe no estado interno do RHF, e fazer
  // isso durante o render seria efeito colateral em corpo de componente.
  // Mas o efeito NÃO chama `setState` — antes chamava, e a regra
  // `react-hooks/set-state-in-effect` estava certa: era um render em cascata
  // desnecessário, já que `restored` é dedutível do próprio `hasDraft`.
  const restoredOnceRef = useRef(false);
  useEffect(() => {
    if (!hasDraft || restoredOnceRef.current) return;
    const saved = readDraft<T>(storageKey, maxAgeMs);
    if (!saved) return;
    restoredOnceRef.current = true;
    form.reset(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDraft]);

  const restored = hasDraft && !dismissed;

  // Grava a cada alteração de campo.
  useEffect(() => {
    const sub = form.watch(() => writeDraft(storageKey, form.getValues()));
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // storage indisponível: nada a limpar.
    }
    setDismissed(true);
  }, [storageKey]);

  return { restored, clear };
}

/**
 * Seam de teste: a lógica que importa (persistir, expirar, tolerar storage
 * quebrado) é pura e testável sem React. O hook é casca fina em volta dela.
 */
export const __test = { read: readDraft, write: writeDraft };

function writeDraft<T>(key: string, value: T): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), value }));
  } catch {
    // Quota estourada ou modo privado. Perder a rede de segurança é ruim;
    // derrubar o formulário em uso seria pior.
  }
}

function readDraft<T>(key: string, maxAgeMs: number): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; value: T };
    if (!parsed?.at || Date.now() - parsed.at > maxAgeMs) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed.value;
  } catch {
    // JSON corrompido: tratar como "sem rascunho" volta ao comportamento
    // antigo, que é seguro.
    return null;
  }
}
