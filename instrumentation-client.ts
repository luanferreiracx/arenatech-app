/**
 * Sentry — runtime browser. Carregado automaticamente pelo Next (App Router).
 * No-op sem DSN (ver sentry.server.config.ts).
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";

Sentry.init({
  dsn,
  enabled: dsn !== "",
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  // Sem replay/profiling por ora — so captura de erro + tracing leve.
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
