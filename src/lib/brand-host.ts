/**
 * Resolucao de marca por host (whitelabel leve).
 *
 * Por enquanto so a LANDING publica muda por dominio. A intranet (apos login)
 * continua com a marca Arena Tech. Dominios novos servem a MESMA app/banco.
 */

/** Hosts que devem exibir a landing pdvdepix na raiz "/". */
const PDVDEPIX_HOSTS = new Set([
  "pdvdepix.app",
  "www.pdvdepix.app",
  "depixpdv.app",
  "www.depixpdv.app",
  // futuro: pdvcripto.app quando o registro for concluido
  "pdvcripto.app",
  "www.pdvcripto.app",
]);

/**
 * Hosts que devem exibir a landing institucional da Arena Tech (loja física
 * de varejo — produtos Apple e acessórios) na raiz "/". Marca de varejo,
 * separada da landing pdvdepix (produto SaaS).
 */
const ARENATECH_LANDING_HOSTS = new Set([
  "arenatechpi.com.br",
  "www.arenatechpi.com.br",
]);

/** Hosts que devem servir o catálogo público na raiz "/". */
const PUBLIC_CATALOG_HOSTS = new Set(["catalogo.arenatechpi.com.br"]);

/**
 * Subdomínio legado da intranet — redirecionado para pdvdepix.app.
 * O Nginx já faz o redirect na borda; esta função é defense-in-depth no proxy.
 */
const APP_SUBDOMAIN_HOSTS = new Set(["app.arenatechpi.com.br"]);

/** Normaliza o header host (pega o primeiro proxy host e remove porta). */
export function normalizeHost(host: string | null | undefined): string {
  if (!host) return "";
  const firstHost = host.split(",")[0] ?? "";
  return firstHost.split(":")[0]!.trim().toLowerCase();
}

/** O host atual deve mostrar a landing publica de marketing? */
export function isLandingHost(host: string | null | undefined): boolean {
  return PDVDEPIX_HOSTS.has(normalizeHost(host));
}

/** O host atual deve exibir a landing institucional da Arena Tech na raiz? */
export function isArenaTechLandingHost(
  host: string | null | undefined,
): boolean {
  return ARENATECH_LANDING_HOSTS.has(normalizeHost(host));
}

/** O host atual deve servir o catálogo público na raiz? */
export function isPublicCatalogHost(host: string | null | undefined): boolean {
  return PUBLIC_CATALOG_HOSTS.has(normalizeHost(host));
}

/** O host é o subdomínio legado da intranet (deve redirecionar para pdvdepix.app)? */
export function isAppSubdomainHost(host: string | null | undefined): boolean {
  return APP_SUBDOMAIN_HOSTS.has(normalizeHost(host));
}

/**
 * Domínios-base sob os quais um subdomínio representa o SLUG de um tenant e serve
 * o catálogo público. Ex.: `arena-tech.pdvdepix.app` → slug `arena-tech`.
 */
const CATALOG_BASE_DOMAINS = ["pdvdepix.app", "depixpdv.app", "pdvcripto.app"];

/**
 * Subdomínios reservados que NÃO são slug de tenant (raiz/marketing/intranet).
 */
const RESERVED_SUBDOMAINS = new Set(["www", "app", "api", "admin", "mail", "smtp"]);

/**
 * Extrai o slug do tenant a partir de um subdomínio de catálogo, ou null.
 * `arena-tech.pdvdepix.app` → "arena-tech". `www.pdvdepix.app` / `pdvdepix.app`
 * → null (não é catálogo por-tenant). Valida o formato do slug (a-z0-9-) para
 * não repassar lixo/host forjado ao banco.
 */
export function getCatalogSubdomainSlug(host: string | null | undefined): string | null {
  const h = normalizeHost(host);
  if (!h) return null;
  for (const base of CATALOG_BASE_DOMAINS) {
    const suffix = `.${base}`;
    if (h.endsWith(suffix) && h.length > suffix.length) {
      const sub = h.slice(0, -suffix.length);
      // só um nível de subdomínio (sem pontos internos) e não reservado.
      if (sub.includes(".") || RESERVED_SUBDOMAINS.has(sub)) return null;
      if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(sub)) return null;
      return sub;
    }
  }
  return null;
}

/**
 * Host canônico de fallback para montar redirects quando o Host da requisição
 * não é reconhecível (ex.: localhost em dev, ou `x-forwarded-host` forjado).
 */
export const CANONICAL_APP_HOST = "pdvdepix.app";

/**
 * Todos os hosts CONHECIDOS desta app (allowlist). Usado para decidir se um
 * `Host`/`x-forwarded-host` da requisição é confiável o bastante para ecoar
 * num redirect — senão um header forjado redirecionaria o usuário para
 * `atacante.com/painel` (open-redirect/phishing). Inclui os hosts de
 * dev/local porque o proxy roda igual em dev.
 */
const KNOWN_HOSTS = new Set([
  ...PDVDEPIX_HOSTS,
  ...PUBLIC_CATALOG_HOSTS,
  ...APP_SUBDOMAIN_HOSTS,
  "arenatechpi.com.br",
  "www.arenatechpi.com.br",
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
]);

/** O host pertence à allowlist de hosts conhecidos desta app? */
export function isKnownHost(host: string | null | undefined): boolean {
  return KNOWN_HOSTS.has(normalizeHost(host));
}

/**
 * Resolve a ORIGEM pública (`https://host`) da requisição a partir dos headers,
 * de forma segura: só ecoa o `x-forwarded-host`/`Host` se ele estiver na allowlist
 * (`isKnownHost`) — senão cai no host canônico. Espelha a lógica do `selfUrl` do
 * proxy. Usado por respostas servidas atrás de Nginx/Cloudflare, onde `req.url`
 * carrega o host INTERNO (ex.: localhost:3000), não o público. Preserva a porta do
 * host conhecido (dev/local) e usa `x-forwarded-proto` quando presente.
 */
export function resolvePublicOrigin(headers: Headers): string {
  const rawHost = headers.get("x-forwarded-host") ?? headers.get("host");
  const host = isKnownHost(rawHost) ? rawHost!.split(",")[0]!.trim() : CANONICAL_APP_HOST;
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  return `${proto}://${host}`;
}
