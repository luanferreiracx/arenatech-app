import { redirect } from "next/navigation";
import { auth } from "@/server/auth";

/**
 * Guard server-side: a aba "API de Parceiros" é exclusiva do superadmin (gerencia
 * credenciais de máquina que acessam a API DePix do tenant). O router já exige
 * superadmin (defesa em profundidade); aqui evitamos a UI quebrada pra quem entra
 * pela URL direta.
 */
export default async function PartnerApiLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (session?.user?.isSuperAdmin !== true) {
    redirect("/settings/general");
  }
  return <>{children}</>;
}
