import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    cpf: string;
    isSuperAdmin: boolean;
  }

  interface Session {
    user: {
      id: string;
      name: string;
      email?: string | null;
      cpf: string;
      isSuperAdmin: boolean;
    };
    activeTenantId: string | null;
    impersonatedTenantId?: string | null;
    availableTenants: Array<{
      id: string;
      slug: string;
      name: string;
      role: string;
    }>;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    cpf: string;
    isSuperAdmin: boolean;
    activeTenantId: string | null;
    impersonatedTenantId?: string | null;
    availableTenants: Array<{
      id: string;
      slug: string;
      name: string;
      role: string;
    }>;
  }
}
