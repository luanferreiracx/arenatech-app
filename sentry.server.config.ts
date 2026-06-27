/**
 * Sentry — runtime Node.js (server). Init roda via instrumentation.ts.
 *
 * DSN do Sentry e PUBLICO por design (so permite ENVIAR eventos, nunca ler) —
 * por isso fica versionado como default; uma env `NEXT_PUBLIC_SENTRY_DSN`
 * sobrescreve se precisar trocar de projeto.
 *
 * Liga SO em producao real: `NODE_ENV === "production"` e fora de CI. Assim
 * dev e o E2E do CI (que roda build de producao) NAO consomem a cota gratuita
 * (5k/mes) com ruido de teste. O plano free nunca cobra — so descarta acima da
 * cota.
 */
import * as Sentry from "@sentry/nextjs";

const DEFAULT_DSN =
  "https://febccfe0c61a42ced505e16a9b20cfae@o4511635141033984.ingest.de.sentry.io/4511635147718736";
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || DEFAULT_DSN;
const isProd = process.env.NODE_ENV === "production" && !process.env.CI;

Sentry.init({
  dsn,
  enabled: dsn !== "" && isProd,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
