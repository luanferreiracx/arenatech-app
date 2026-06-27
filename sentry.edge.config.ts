/**
 * Sentry — runtime Edge (middleware/edge routes). Init roda via instrumentation.ts.
 * No-op sem DSN (ver sentry.server.config.ts).
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";

Sentry.init({
  dsn,
  enabled: dsn !== "",
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
});
