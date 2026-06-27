/**
 * Sentry — runtime Edge (middleware/edge routes). Init roda via instrumentation.ts.
 * Mesma regra do server: liga so em producao real (ver sentry.server.config.ts).
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
