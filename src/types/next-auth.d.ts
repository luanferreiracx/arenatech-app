import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    // NO-KYC loga por email e não tem CPF (ADR 0050) — cpf é opcional/nulo.
    cpf: string | null;
    isSuperAdmin: boolean;
    mustChangePassword: boolean;
  }

  interface Session {
    user: {
      id: string;
      name: string;
      email?: string | null;
      cpf: string | null;
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
    cpf: string | null;
    isSuperAdmin: boolean;
    mustChangePassword: boolean;
    /** A5: fingerprint da senha na emissão do token — invalida sessão se a senha mudar. */
    pwdSig?: string;
    /** Decisão 2: ms epoch do último login/refresh bem-sucedido. Bounda o fail-open
     *  do refresh — sessão que não se re-verifica há > teto é invalidada. */
    lastVerifiedAt?: number;
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
