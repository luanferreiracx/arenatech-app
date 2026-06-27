/**
 * Sentry — runtime Node.js (server). Init roda via instrumentation.ts.
 *
 * No-op por padrao: sem `NEXT_PUBLIC_SENTRY_DSN` configurado, `Sentry.init({
 * dsn: "" })` NAO envia nada (desabilitado). Assim dev/CI/qualquer ambiente sem
 * DSN segue inalterado — ligar e so setar o DSN (acao do dono, como o dominio do
 * Resend). DSN do Sentry e publico por design (so permite ENVIAR eventos), por
 * isso usamos a mesma var NEXT_PUBLIC_ no server, edge e client.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";

Sentry.init({
  dsn,
  enabled: dsn !== "",
  environment: process.env.NODE_ENV,
  // Amostragem de tracing: barato em prod, cheio em dev. Erros (captureException)
  // nao sao amostrados — sempre vao.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
});
