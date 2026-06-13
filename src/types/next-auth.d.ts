import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    cpf: string;
    isSuperAdmin: boolean;
    mustChangePassword: boolean;
  }

  interface Session {
    user: {
      id: string;
      name: string;
      email?: string | null;
      cpf: string;
      isSuperAdmin: boolean;
      mustChangePassword: boolean;
    };
    activeTenantId: string | null;
    impersonatedTenantId?: string | null;
    availableTenants: Array<{
      id: string;
      slug: string;
      name: string;
      role: string;
      /** Função "técnico" (flag) — usada p/ escopo de OS e listagem de técnicos. */
      isTechnician?: boolean;
      /** Módulos liberados para este tenant (gating por plano). */
      modules: string[];
    }>;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    cpf: string;
    isSuperAdmin: boolean;
    mustChangePassword: boolean;
    activeTenantId: string | null;
    impersonatedTenantId?: string | null;
    availableTenants: Array<{
      id: string;
      slug: string;
      name: string;
      role: string;
      /** Função "técnico" (flag) — usada p/ escopo de OS e listagem de técnicos. */
      isTechnician?: boolean;
      /** Módulos liberados para este tenant (gating por plano). */
      modules: string[];
    }>;
  }
}
