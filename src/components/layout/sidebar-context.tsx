"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

interface SidebarContextValue {
  /** Sidebar de DESKTOP recolhida (só ícones). Persistida em cookie. */
  isCollapsed: boolean;
  isMobile: boolean;
  /** Gaveta do MOBILE aberta. Efêmera: nasce fechada a cada carregamento. */
  isMobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  toggle: () => void;
  collapse: () => void;
  expand: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used inside SidebarProvider");
  return ctx;
}

interface SidebarProviderProps {
  children: React.ReactNode;
  defaultCollapsed?: boolean;
  session: {
    user: { id: string; name: string; isSuperAdmin: boolean };
    availableTenants: Array<{ id: string; slug: string; name: string; role: string }>;
    activeTenantId: string | null;
  };
}

export function SidebarProvider({ children, defaultCollapsed = false, session }: SidebarProviderProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [isMobile, setIsMobile] = useState(false);
  // Estado PRÓPRIO da gaveta do mobile. Antes ela era derivada de
  // `!isCollapsed` — o mesmo booleano servindo a dois significados com defaults
  // OPOSTOS ("desktop expandido" é o normal; "gaveta aberta" não é). No desktop
  // sem o cookie, isso deixava o Sheet ABERTO: overlay modal por cima do app,
  // `pointer-events: none` no body e `aria-hidden` no conteúdo — nada clicável.
  const [isMobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    // Check initial value in a timeout to avoid synchronous setState in effect
    const initialCheck = () => setIsMobile(mq.matches);
    const timer = setTimeout(initialCheck, 0);
    mq.addEventListener("change", handler);
    return () => {
      clearTimeout(timer);
      mq.removeEventListener("change", handler);
    };
  }, []);

  const toggle = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      document.cookie = `arena_sidebar_collapsed=${next}; path=/; max-age=${60 * 60 * 24 * 365}`;
      return next;
    });
  }, []);

  const collapse = useCallback(() => {
    setIsCollapsed(true);
    document.cookie = `arena_sidebar_collapsed=true; path=/; max-age=${60 * 60 * 24 * 365}`;
  }, []);

  const expand = useCallback(() => {
    setIsCollapsed(false);
    document.cookie = `arena_sidebar_collapsed=false; path=/; max-age=${60 * 60 * 24 * 365}`;
  }, []);

  // Expose session via a different mechanism to avoid prop drilling
  void session;

  return (
    <SidebarContext.Provider
      value={{ isCollapsed, isMobile, isMobileOpen, setMobileOpen, toggle, collapse, expand }}
    >
      {children}
    </SidebarContext.Provider>
  );
}
