import { cookies } from "next/headers";
import { auth } from "@/server/auth";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";
import { isTenantAdmin } from "@/lib/auth/roles";
import { resolveModuleForPath } from "@/lib/modules";
import { withAdmin } from "@/server/db";
import { SettingsTabs, type SettingsTab } from "./_components/settings-tabs";

const ALL_TABS: SettingsTab[] = [
  { label: "Geral", href: "/settings/general" },
  { label: "Assistência", href: "/settings/assistance" },
  { label: "Fiscal", href: "/settings/fiscal" },
  { label: "Formas de Pagamento", href: "/settings/payment-methods" },
  { label: "Cartões e Recebimento", href: "/settings/card-acquirers" },
  { label: "Taxas do Simulador", href: "/settings/installments" },
  { label: "Regras de Venda", href: "/settings/receiving" },
  { label: "Integracoes", href: "/settings/integrations" },
  { label: "Equipe", href: "/settings/users" },
  { label: "Entregadores", href: "/settings/delivery-persons" },
  { label: "Assinatura", href: "/settings/subscription" },
  { label: "Logs", href: "/settings/logs" },
  { label: "Seguranca", href: "/settings/security" },
  // Aparece só pro admin do tenant E se o superadmin liberou a API (apiAccessEnabled).
  { label: "API de Parceiros", href: "/settings/partner-api", apiAccessOnly: true },
];

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const cookieStore = await cookies();
  // O (app)/layout pai ja garante sessao (redireciona se ausente); guard de tipo.
  const activeTenant = session
    ? resolveActiveTenant(session, cookieStore.get("x-active-tenant")?.value)
    : null;
  const allowedModules = activeTenant?.modules ?? [];

  // Aba "API de Parceiros": só pra admin do tenant e se o superadmin liberou.
  // Lookup leve (PK) só quando há tenant admin — evita query desnecessária.
  const tenantIsAdmin =
    !!session && !!activeTenant && isTenantAdmin(session, activeTenant.id);
  let apiAccessEnabled = false;
  if (tenantIsAdmin && activeTenant) {
    const t = await withAdmin((tx) =>
      tx.tenant.findUnique({ where: { id: activeTenant.id }, select: { apiAccessEnabled: true } }),
    );
    apiAccessEnabled = t?.apiAccessEnabled === true;
  }

  // Só mostra as abas que o tenant pode acessar — senão um tenant wallet/NO-KYC
  // (que alcança /settings/security pra habilitar 2FA) veria abas gateadas que
  // o redirecionam ao clicar. Aba sem módulo (ex.: Segurança) aparece pra todos.
  const tabs = ALL_TABS.filter((tab) => {
    if (tab.apiAccessOnly && !apiAccessEnabled) return false;
    const mod = resolveModuleForPath(tab.href);
    return mod === null || allowedModules.includes(mod);
  });

  return (
    <div>
      <SettingsTabs tabs={tabs} />
      {children}
    </div>
  );
}
