"use client";

/**
 * Logout por inatividade (D4 da auditoria de config — `sessionTimeoutMinutes`).
 *
 * Opt-in: enquanto o tenant nao configurar um timeout, e no-op (null = sem
 * timeout). Quando configurado, desloga apos N minutos SEM atividade do usuario
 * (mouse/teclado/scroll/toque). Espelha o padrao comum de "sessao expira por
 * inatividade" — o limite duro do servidor segue sendo o `maxAge` do NextAuth.
 */
import { useEffect, useRef } from "react";
import { signOut } from "next-auth/react";
import { useTRPC } from "@/trpc/react";
import { useQuery } from "@tanstack/react-query";

const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;

export function IdleTimeout() {
  const trpc = useTRPC();
  // getSecurity e tenantProcedure (leitura) — barato e cacheado. Erro (ex.: sem
  // tenant ativo) => data undefined => sem timeout (no-op).
  const { data } = useQuery(
    trpc.settings.getSecurity.queryOptions(undefined, { staleTime: 10 * 60_000, retry: false }),
  );
  const timeoutMinutes = data?.sessionTimeoutMinutes ?? null;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!timeoutMinutes || timeoutMinutes <= 0) return; // sem timeout configurado
    const idleMs = timeoutMinutes * 60_000;

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void signOut({ callbackUrl: "/login?reason=idle" });
      }, idleMs);
    };

    resetTimer();
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, resetTimer, { passive: true });
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, resetTimer);
      }
    };
  }, [timeoutMinutes]);

  return null;
}
