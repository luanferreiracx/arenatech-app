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
import type { LookupAddress } from "node:dns";
import { request as httpsRequest } from "node:https";

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

// ── Entrega com IP pinado (fecha DNS-rebinding de verdade) ───────────────────

/** Resolver injetável (o `lookup` de node:dns/promises por padrão; fake nos testes). */
type Resolver = (host: string) => Promise<ReadonlyArray<LookupAddress>>;

const defaultResolver: Resolver = (host) => lookup(host, { all: true });

/**
 * Cria um `lookup` compatível com `node:https`/`node:dns` que BLOQUEIA se qualquer
 * IP resolvido for interno. Diferente de `assertUrlResolvesToPublicIp` (que checa
 * ANTES do fetch e deixa a conexão re-resolver — janela de rebinding), este é o
 * MESMO resolver que a conexão usa: a checagem acontece no IP para o qual de fato
 * vamos conectar. Sem TOCTOU.
 *
 * Fail-closed: erro de resolução, zero endereços, ou qualquer IP interno → erro.
 */
type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

export function makeGuardedLookup(resolver: Resolver = defaultResolver) {
  return (host: string, options: unknown, callback: LookupCallback): void => {
    resolver(host)
      .then((addresses) => {
        // Em erro, node ignora o `address` — passamos `[]` só para o tipo.
        if (addresses.length === 0) {
          callback(new Error("Host de destino não resolveu para nenhum endereço."), []);
          return;
        }
        const blocked = addresses.find((a) => isBlockedIp(a.address));
        if (blocked) {
          callback(new Error("Host de destino resolve para um endereço interno."), []);
          return;
        }
        // `all: true` → devolve a lista; senão o 1º (address, family).
        const wantsAll = typeof options === "object" && options !== null && (options as { all?: boolean }).all === true;
        if (wantsAll) {
          callback(null, addresses.map((a) => ({ address: a.address, family: a.family })));
          return;
        }
        const first = addresses[0]!;
        callback(null, first.address, first.family);
      })
      .catch((err) => callback(err instanceof Error ? err : new Error(String(err)), []));
  };
}

export type SignedJsonResponse = { status: number; ok: boolean };

/**
 * POST de JSON assinado para uma URL PÚBLICA fornecida por usuário, à prova de
 * SSRF (incl. DNS-rebinding via `makeGuardedLookup`) e sem seguir redirects
 * (`node:https` não segue 3xx — um 3xx vira resposta não-2xx, nunca um pulo pra
 * host interno). Usado na entrega de webhooks de saída (ADR 0057).
 */
export function postSignedJson(args: {
  url: URL;
  body: string;
  headers: Record<string, string>;
  timeoutMs: number;
}): Promise<SignedJsonResponse> {
  const { url, body, headers, timeoutMs } = args;
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: "POST",
        lookup: makeGuardedLookup(),
        headers: { ...headers, "content-length": String(Buffer.byteLength(body)) },
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        res.resume(); // drena a resposta (não lemos o corpo — best-effort)
        resolve({ status, ok: status >= 200 && status < 300 });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
