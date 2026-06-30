import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";

/**
 * Guard server-side da aba "API de Parceiros": exige o módulo `partner-api`
 * (liberado por-tenant via `apiAccessEnabled`, ADR 0057). O proxy já bloqueia a
 * rota pelo mesmo módulo; aqui é defesa em profundidade pela mesma fonte de verdade
 * (modules do tenant ativo), sem gate ad-hoc.
 */
export default async function PartnerApiLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const cookieStore = await cookies();
  const activeTenant = session
    ? resolveActiveTenant(session, cookieStore.get("x-active-tenant")?.value)
    : null;

  if (!activeTenant?.modules?.includes("partner-api")) {
    redirect("/settings/general");
  }
  return <>{children}</>;
}
