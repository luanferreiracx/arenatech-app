import { cookies } from "next/headers";
import { auth } from "@/server/auth";
import { resolveActiveTenant } from "@/lib/auth/active-tenant";
import { isAdminOnlySettingsPath, resolveModuleForPath } from "@/lib/modules";
import { SettingsTabs, type SettingsTab } from "./_components/settings-tabs";

const ALL_TABS: SettingsTab[] = [
  { label: "Geral", href: "/settings/general" },
  { label: "Assistência", href: "/settings/assistance" },
  { label: "Assistente (Talison)", href: "/settings/bot" },
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
  // Módulo partner-api (override por-tenant via apiAccessEnabled). Some quando o
  // tenant não tem o módulo — mesmo gating das demais abas.
  { label: "API de Parceiros", href: "/settings/partner-api" },
];

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const cookieStore = await cookies();
  // O (app)/layout pai ja garante sessao (redireciona se ausente); guard de tipo.
  const activeTenant = session
    ? resolveActiveTenant(session, cookieStore.get("x-active-tenant")?.value)
    : null;
  const allowedModules = activeTenant?.modules ?? [];
  const isAdmin = activeTenant?.role === "admin" || session?.user.isSuperAdmin === true;

  // Duas dimensões, e ambas importam:
  //
  // MÓDULO — cada aba é gateada pelo módulo funcional de que depende
  // (resolveModuleForPath consulta SETTINGS_TAB_MODULE): um tenant só-wallet vê
  // Geral/Equipe/Assinatura/Logs/Segurança (sempre-on → módulo null), mas não
  // Fiscal, Formas de Pagamento, Cartões etc.
  //
  // PAPEL — quase toda aba só o admin do tenant pode alterar, e antes o operador
  // via as 15 com "Salvar" habilitado para levar 403 no submit. O proxy aplica a
  // mesma regra na URL direta (passo 7c); aqui é só a barra de abas.
  const tabs = ALL_TABS.filter((tab) => {
    if (!isAdmin && isAdminOnlySettingsPath(tab.href)) return false;
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
