/**
 * Classificação de rotas do proxy — lógica PURA, sem NextAuth.
 *
 * Mora fora do `proxy.ts` porque lá o import do NextAuth arrasta `next/server` e
 * o módulo não carrega em teste unitário. Estas duas decisões governam quem
 * consegue falar com o app sem cookie de sessão, então precisam de teste próprio:
 * errar aqui não quebra visivelmente uma tela, quebra em silêncio um cliente
 * máquina-a-máquina (ver `__tests__/unit/proxy-partner-api-routes.test.ts`).
 */

const PUBLIC_ROUTES = new Set([
  "/login",
  "/no-access",
  "/forgot-password",
  "/reset-password",
  "/register",
  // Vitrine de planos — a entrada do funil self-service (ADR 0061). É o que o
  // visitante vê ANTES de ter conta; exigir sessão aqui fecharia a porta de
  // entrada da venda.
  "/planos",
]);

/**
 * Prefixo da API REST de parceiros.
 *
 * Estas rotas se autenticam por `Authorization: Bearer <api-key>` — hash bcrypt,
 * escopo por key, tenant ACTIVE, `apiAccessEnabled` e rate-limit fail-closed, tudo
 * em `withPartnerAuth`. NÃO usam cookie de sessão. Como o proxy não olha o header
 * `Authorization`, sem esta isenção ele trata todo parceiro como anônimo e
 * redireciona pro /login — a API inteira vira HTML de login.
 */
const PARTNER_API_PREFIX = "/api/v1/partner/";

/**
 * Rota de API: fala JSON e se autoriza sozinha. O proxy NUNCA a responde com
 * redirect.
 *
 * Um 307 devolve HTML a quem espera JSON, e o erro que chega no cliente é
 * `Unexpected token '<', "<!DOCTYPE"` — que não diz nada sobre a causa. Este
 * codebase já pagou por isso três vezes:
 *
 * 1. o gating de módulo no proxy derrubando TODAS as queries tRPC de qualquer
 *    não-superadmin (documentado em `server/api/trpc.ts`);
 * 2. a API de parceiros inalcançável por um mês (#732), porque o proxy só
 *    entendia cookie e a rota autentica por header;
 * 3. o painel do superadmin sem tenant ativo, morto por inteiro: a etapa 7 do
 *    proxy redirecionava `/api/trpc/admin.*` para `/admin`.
 *
 * As isenções em `isPublicRoute` (webhooks, `noKyc.*`, parceiros) foram remendos
 * um a um do MESMO problema. Esta função é a regra que faltava.
 *
 * Seguro porque a autorização das rotas de API é delas: tRPC tem
 * `protectedProcedure`/`tenantProcedure`/`adminProcedure`, a API de parceiros
 * valida a key, webhooks conferem HMAC e o cron confere o segredo. Todas
 * respondem em JSON, com o código certo.
 */
export function isApiRoute(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/** Rota pública = passa sem sessão. */
export function isPublicRoute(pathname: string): boolean {
  return (
    PUBLIC_ROUTES.has(pathname) ||
    // Landing publica (marketing) — servida na raiz por host em pdvdepix.app.
    pathname === "/landing" ||
    // Landing institucional Arena Tech (varejo) — servida na raiz por host em
    // arenatechpi.com.br. Publica, sem auth.
    pathname === "/arenatech" ||
    // Documentos legais (Termos, Privacidade, Reembolso, Avisos) — públicos por
    // exigência dos parceiros de pagamento (KYC) e do consumidor. Sem auth.
    pathname === "/legal" ||
    pathname.startsWith("/legal/") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/cron/") ||
    // Webhooks externos — autenticacao via HMAC interno, sem cookie.
    pathname.startsWith("/api/webhooks/") ||
    // Rotas de midia publica para WhatsApp Cloud API baixar PDFs (HMAC-tokenized).
    // Meta precisa acessar sem cookies de auth.
    pathname.startsWith("/api/whatsapp-media/") ||
    pathname.startsWith("/catalog") ||
    pathname.startsWith("/os/") ||
    pathname.startsWith("/quote/") ||
    pathname.startsWith("/pay/") ||
    pathname.startsWith("/receipt/") ||
    pathname.startsWith("/register/") ||
    // Documentação pública da API de parceiros (Swagger UI + spec OpenAPI).
    // O contrato é público; não expõe segredo.
    pathname.startsWith("/docs/partner-api") ||
    // API REST de parceiros — autentica por Bearer (ver PARTNER_API_PREFIX).
    pathname.startsWith(PARTNER_API_PREFIX) ||
    // Endpoints tRPC públicos do onboarding NO-KYC (ADR 0050) — o procedimento
    // usa publicProcedure, não precisa de sessão. Sem isso o middleware redireciona
    // a chamada fetch para /login e o cliente recebe HTML em vez de JSON.
    pathname.startsWith("/api/trpc/noKyc.")
  );
}

/**
 * Servido DIRETO no host legado (`app.arenatechpi.com.br`), sem o 301 pro host
 * canônico.
 *
 * Cliente máquina-a-máquina não segue redirect de POST preservando o corpo — e
 * quem segue recebe o destino errado. Webhooks já eram isentos por isso (um 301
 * matou entrega de notificação da PixPay em prod, 06-09). A API de parceiros tem
 * exatamente o mesmo problema: o host legado é o que está publicado na doc e no
 * `servers:` do OpenAPI, então é por ele que o parceiro chega.
 */
export function isLegacyHostDirectServe(pathname: string): boolean {
  return (
    pathname.startsWith("/api/webhooks/") || pathname.startsWith(PARTNER_API_PREFIX)
  );
}
