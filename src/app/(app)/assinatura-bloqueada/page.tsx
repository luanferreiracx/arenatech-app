import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/server/auth";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";
import { isTenantAdmin } from "@/lib/auth/roles";
import { createMetadata } from "@/lib/metadata";
import { BlockedSubscription } from "./_components/blocked-subscription";

export const metadata = createMetadata("Assinatura suspensa");

/**
 * Tela de bloqueio por inadimplência (ADR 0061).
 *
 * Antes, o tenant com assinatura vencida além da carência sumia de
 * `availableTenants` e o proxy o mandava para `/no-access`, que dizia "sua conta
 * ainda não está vinculada a nenhuma loja" e só oferecia Sair. Ele ficava
 * trancado do lado de fora, lendo uma mensagem sobre outro problema, e a tela de
 * pagar assinatura era inalcançável por ser rota de tenant.
 *
 * Agora ele mantém a sessão, chega aqui e paga. Carteira DePix e link de
 * cobrança seguem abertos: o saldo é dele.
 */
export default async function BlockedSubscriptionPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const cookieStore = await cookies();
  const activeTenant = resolveActiveTenant(
    session,
    cookieStore.get("x-active-tenant")?.value,
  );
  if (!activeTenant) redirect("/select-tenant");

  // Pagou e o webhook renovou: a sessão volta com `blocked: false` no próximo
  // refresh e esta tela deixa de fazer sentido. Sem isto o usuário ficaria preso
  // olhando um bloqueio que já não existe.
  if (!activeTenant.blocked) redirect("/painel");

  return (
    <BlockedSubscription
      tenantName={activeTenant.name}
      canPay={isTenantAdmin(session, activeTenant.id)}
    />
  );
}
