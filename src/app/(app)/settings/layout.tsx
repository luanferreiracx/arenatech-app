import { cookies } from "next/headers";
import { auth } from "@/server/auth";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";
import { resolveModuleForPath } from "@/lib/modules";
import { SettingsTabs, type SettingsTab } from "./_components/settings-tabs";

const ALL_TABS: SettingsTab[] = [
  { label: "Geral", href: "/settings/general" },
  { label: "Assistência", href: "/settings/assistance" },
  { label: "Fiscal", href: "/settings/fiscal" },
  { label: "Formas de Pagamento", href: "/settings/payment-methods" },
  { label: "Meios de Recebimento", href: "/settings/card-acquirers" },
  { label: "Parcelamento", href: "/settings/installments" },
  { label: "Recebimento", href: "/settings/receiving" },
  { label: "Integracoes", href: "/settings/integrations" },
  { label: "Equipe", href: "/settings/users" },
  { label: "Entregadores", href: "/settings/delivery-persons" },
  { label: "Assinatura", href: "/settings/subscription" },
  { label: "Logs", href: "/settings/logs" },
  { label: "Seguranca", href: "/settings/security" },
  // Só superadmin (gerencia as API-keys de parceiro do tenant ativo).
  { label: "API de Parceiros", href: "/settings/partner-api", superAdminOnly: true },
];

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const cookieStore = await cookies();
  // O (app)/layout pai ja garante sessao (redireciona se ausente); guard de tipo.
  const activeTenant = session
    ? resolveActiveTenant(session, cookieStore.get("x-active-tenant")?.value)
    : null;
  const allowedModules = activeTenant?.modules ?? [];

  // Só mostra as abas que o tenant pode acessar — senão um tenant wallet/NO-KYC
  // (que alcança /settings/security pra habilitar 2FA) veria abas gateadas que
  // o redirecionam ao clicar. Aba sem módulo (ex.: Segurança) aparece pra todos.
  const isSuperAdmin = session?.user?.isSuperAdmin === true;
  const tabs = ALL_TABS.filter((tab) => {
    if (tab.superAdminOnly && !isSuperAdmin) return false;
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
