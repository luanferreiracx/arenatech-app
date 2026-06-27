import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy.
 *
 * Política pragmática (não baseada em nonce) por escolha consciente: o App
 * Router injeta scripts inline de bootstrap e o nonce por-request não se aplica
 * às rotas estáticas (landing/catálogo público), então um nonce estrito quebraria
 * essas páginas. Mantemos `'unsafe-inline'` em script/style — a real defesa vem
 * das diretivas que bloqueiam ataques concretos mesmo sem script-src estrito:
 *   - frame-ancestors 'none'  → clickjacking (cobre e supera X-Frame-Options)
 *   - object-src 'none'       → XSS via plugins/embed
 *   - base-uri 'self'         → sequestro de URLs relativas via <base> injetado
 *   - form-action 'self'      → exfiltração via <form> apontando pra fora
 *
 * Fontes do next/font são self-hosted (build-time), QR codes são data: URIs, e
 * imagens vêm de Cloudinary/MinIO (img-src https:). O site fica atrás do
 * Cloudflare — liberamos o beacon de analytics defensivamente.
 */
function buildCsp(): string {
  // Cloudflare Turnstile: o widget carrega api.js de challenges.cloudflare.com,
  // abre o desafio num iframe do mesmo host e troca o token via fetch.
  const turnstileHost = "https://challenges.cloudflare.com";

  // Turbopack/React Refresh usam eval e websocket de HMR em dev.
  const scriptSrc = ["'self'", "'unsafe-inline'", "https://static.cloudflareinsights.com", turnstileHost];
  // *.sentry.io: o SDK do browser envia eventos pro ingest do DSN (no-op sem DSN).
  const connectSrc = ["'self'", "https://cloudflareinsights.com", turnstileHost, "https://*.sentry.io"];
  if (isDev) {
    scriptSrc.push("'unsafe-eval'");
    connectSrc.push("ws:");
  }

  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["base-uri", ["'self'"]],
    ["object-src", ["'none'"]],
    ["frame-ancestors", ["'none'"]],
    ["form-action", ["'self'"]],
    ["img-src", ["'self'", "data:", "blob:", "https:"]],
    ["font-src", ["'self'", "data:"]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["script-src", scriptSrc],
    ["connect-src", connectSrc],
    // Turnstile renderiza o desafio num iframe de challenges.cloudflare.com.
    ["frame-src", ["'self'", turnstileHost]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    // Em prod, força subrecursos http para https (atrás de Cloudflare/HSTS).
    ...(isDev ? [] : [["upgrade-insecure-requests", []] as [string, string[]]]),
  ];

  return directives
    .map(([key, values]) => (values.length ? `${key} ${values.join(" ")}` : key))
    .join("; ");
}

const nextConfig: NextConfig = {
  output: "standalone",

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "http", hostname: "localhost", port: "9000" },
      { protocol: "http", hostname: "minio", port: "9000" },
      { protocol: "https", hostname: "pdvdepix.app" },
      { protocol: "https", hostname: "depixpdv.app" },
    ],
  },

  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns", "@tanstack/react-table"],
  },

  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: buildCsp() },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-DNS-Prefetch-Control", value: "on" },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=()",
        },
      ],
    },
  ],
};

/**
 * withSentryConfig: habilita instrumentacao do Sentry no build. Upload de
 * source maps DESABILITADO por ora (exige SENTRY_AUTH_TOKEN/org/project) — o
 * build segue self-contained sem secrets; stack traces vao minificados ate o
 * dono configurar o upload. `enabled:false` no init (sem DSN) ja deixa tudo
 * no-op em runtime.
 */
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  disableLogger: true,
  sourcemaps: { disable: true },
});
