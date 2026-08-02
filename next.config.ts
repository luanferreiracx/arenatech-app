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
/**
 * CSP relaxada SOMENTE para a doc pública /docs/partner-api: o bundle do Swagger UI
 * usa `new Function` (exige 'unsafe-eval') e injeta estilos inline. Tudo same-origin
 * (assets self-hosted em /swagger-ui) — nenhum host externo é liberado. A página só
 * renderiza a spec (contrato público), não toca dado de tenant.
 */
function buildSwaggerCsp(): string {
  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["base-uri", ["'self'"]],
    ["object-src", ["'none'"]],
    ["frame-ancestors", ["'none'"]],
    ["form-action", ["'self'"]],
    ["img-src", ["'self'", "data:", "https:"]],
    ["font-src", ["'self'", "data:"]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["script-src", ["'self'", "'unsafe-inline'", "'unsafe-eval'"]],
    ["connect-src", ["'self'"]],
    ...(isDev ? [] : [["upgrade-insecure-requests", []] as [string, string[]]]),
  ];
  return directives
    .map(([key, values]) => (values.length ? `${key} ${values.join(" ")}` : key))
    .join("; ");
}

function buildCsp(): string {
  // Cloudflare Turnstile: o widget carrega api.js de challenges.cloudflare.com,
  // abre o desafio num iframe do mesmo host e troca o token via fetch.
  const turnstileHost = "https://challenges.cloudflare.com";

  // Turbopack/React Refresh usam eval e websocket de HMR em dev.
  const scriptSrc = ["'self'", "'unsafe-inline'", "https://static.cloudflareinsights.com", turnstileHost];
  // *.sentry.io: o SDK do browser envia eventos pro ingest do DSN (no-op sem DSN).
  // viacep/brasilapi: a busca de endereço por CEP é client-side (CepInput) — sem
  // liberar aqui, o navegador BLOQUEIA o fetch (connect-src) e TODO cadastro cai
  // em "CEP não encontrado, preencha manualmente".
  const connectSrc = [
    "'self'",
    "https://cloudflareinsights.com",
    turnstileHost,
    "https://*.sentry.io",
    "https://viacep.com.br",
    "https://brasilapi.com.br",
  ];
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

/**
 * Dentro do build da IMAGEM, pular a checagem de tipos/lint do `next build`.
 *
 * O job `build-image` do CI tem `needs: [lint, typecheck, test]` — quando a
 * imagem começa a buildar, `tsc --noEmit` e o ESLint JÁ passaram, em runners
 * github-hosted rápidos (~1min cada). O `next build` refazia o typecheck
 * DENTRO do container, na VPS: medido em **9,4 minutos** de duplicação pura,
 * que estourava o `timeout-minutes` do job e travava o deploy.
 *
 * Só vale quando a flag está ligada (o Dockerfile a define). `next build`
 * local/manual segue com verificação completa — não afrouxa nada fora do CI.
 */
const skipChecksInImageBuild = process.env.DOCKER_BUILD_SKIP_CHECKS === "1";

const nextConfig: NextConfig = {
  output: "standalone",

  ...(skipChecksInImageBuild
    ? {
        typescript: { ignoreBuildErrors: true },
        eslint: { ignoreDuringBuilds: true },
      }
    : {}),

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
    // CSP relaxada (Swagger UI) DEPOIS da regra geral: no Next, quando duas fontes
    // casam a mesma chave, a ÚLTIMA vence — então a rota específica sobrescreve a
    // Content-Security-Policy só em /docs/partner-api.
    {
      source: "/docs/partner-api/:path*",
      headers: [{ key: "Content-Security-Policy", value: buildSwaggerCsp() }],
    },
    {
      source: "/docs/partner-api",
      headers: [{ key: "Content-Security-Policy", value: buildSwaggerCsp() }],
    },
  ],
};

/**
 * withSentryConfig: habilita instrumentacao do Sentry no build.
 *
 * Upload de source maps ligado quando `SENTRY_AUTH_TOKEN` existe no BUILD (vem
 * do secret do GitHub via build-arg). Sem o token — build local, fork, clone sem
 * acesso ao secret — o upload some e o build segue self-contained, sem falhar.
 *
 * Por que ligamos: os erros de browser chegavam com o stack 100% minificado, sem
 * arquivo, sem linha e sem component stack do React. Uma issue de 186 eventos em
 * duas semanas nao dizia mais do que "quebrou em algum lugar".
 *
 * `deleteSourcemapsAfterUpload` evita publicar o mapa junto do bundle: o Sentry
 * des-minifica do lado dele, o navegador nao ganha o codigo-fonte.
 */
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  disableLogger: true,
  org: "pdv-depix",
  project: "javascript-nextjs",
  authToken: sentryAuthToken,
  sourcemaps: {
    disable: !sentryAuthToken,
    deleteSourcemapsAfterUpload: true,
  },
});
