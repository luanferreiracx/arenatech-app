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
