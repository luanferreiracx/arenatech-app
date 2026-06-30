/**
 * Guarda anti-SSRF para URLs FORNECIDAS POR USUÁRIO que o servidor vai acessar
 * (ex.: webhooks de saída da API de parceiros). Bloqueia destinos internos —
 * loopback, redes privadas (RFC 1918), link-local (incl. o metadata 169.254.169.254),
 * CGNAT, ULA IPv6 etc. — para que um tenant não consiga apontar o servidor para a
 * rede interna / endpoint de metadados da cloud.
 *
 * Duas camadas:
 *   1. `assertPublicHttpsUrl` (síncrona) — formato + host literal. Use no momento em
 *      que o usuário CADASTRA a URL (feedback imediato).
 *   2. `assertUrlResolvesToPublicIp` (assíncrona, DNS) — resolve o hostname e bloqueia
 *      se QUALQUER IP for interno. Use ANTES de cada `fetch` (fecha DNS-rebinding).
 */
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

/** Um IP literal (v4 ou v6) é interno/reservado e deve ser bloqueado? */
export function isBlockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isBlockedIpv4(ip);
  if (family === 6) return isBlockedIpv6(ip);
  return false;
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true; // formato suspeito → bloqueia (fail-closed)
  }
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 0 || // 0.0.0.0/8 "this host"
    a === 10 || // 10/8 privado
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // 100.64/10 CGNAT
    (a === 169 && b === 254) || // link-local (inclui 169.254.169.254 metadata)
    (a === 172 && b >= 16 && b <= 31) || // 172.16/12 privado
    (a === 192 && b === 0) || // 192.0.0/24 IETF protocol assignments
    (a === 192 && b === 168) || // 192.168/16 privado
    (a === 198 && (b === 18 || b === 19)) || // 198.18/15 benchmarking
    a >= 224 // 224/4 multicast + 240/4 reservado
  );
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, "");

  // IPv4-mapado/compatível (::ffff:1.2.3.4 ou ::1.2.3.4) → checa o IPv4 embutido.
  const v4Mapped = /^(?:::ffff:|::)((?:\d{1,3}\.){3}\d{1,3})$/.exec(normalized);
  if (v4Mapped?.[1]) return isBlockedIpv4(v4Mapped[1]);

  return (
    normalized === "::" || // unspecified
    normalized === "::1" || // loopback
    normalized.startsWith("fc") || // fc00::/7 ULA
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") || // fe80::/10 link-local
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("ff") // ff00::/8 multicast
  );
}

/** Remove os colchetes de um literal IPv6 (`[::1]` → `::1`) para o `isIP` reconhecer. */
function unbracket(host: string): string {
  return host.replace(/^\[|\]$/g, "");
}

/** O hostname (literal) é claramente interno (localhost / IP privado literal)? */
export function isBlockedHostname(hostname: string): boolean {
  const h = unbracket(hostname.toLowerCase().trim());
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  // TLDs internos comuns que nunca devem sair para a internet.
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (isIP(h) !== 0) return isBlockedIp(h);
  return false;
}

/**
 * Valida o FORMATO de uma URL de webhook (síncrono): exige HTTPS e rejeita hosts
 * internos literais. Lança `Error` com mensagem amigável. Retorna a URL parseada.
 */
export function assertPublicHttpsUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("URL inválida.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("A URL deve usar HTTPS.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("A URL não pode conter credenciais (user:pass@).");
  }
  if (isBlockedHostname(parsed.hostname)) {
    throw new Error("Host não permitido (endereço interno/privado).");
  }
  return parsed;
}

/**
 * Resolve o hostname e bloqueia se QUALQUER endereço for interno (fecha
 * DNS-rebinding: o host pode passar na checagem literal mas resolver para um IP
 * privado). Lança `Error` se bloqueado. Hosts que já são IP literal são checados
 * sem DNS.
 */
export async function assertUrlResolvesToPublicIp(url: URL): Promise<void> {
  const host = unbracket(url.hostname);
  if (isIP(host) !== 0) {
    if (isBlockedIp(host)) throw new Error("Endereço de destino interno não permitido.");
    return;
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new Error("Não foi possível resolver o host de destino.");
  }
  if (addresses.length === 0 || addresses.some((a) => isBlockedIp(a.address))) {
    throw new Error("Host de destino resolve para um endereço interno.");
  }
}
