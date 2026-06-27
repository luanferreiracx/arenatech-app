/**
 * Sentry — runtime browser. Carregado automaticamente pelo Next (App Router).
 *
 * O browser nao enxerga NODE_ENV/CI em runtime (sao inlinados no build), entao
 * a regra de "so producao" aqui e por HOST: liga em qualquer dominio real
 * publicado (app.arenatechpi.com.br, pdvdepix.app, etc.) e fica OFF em
 * localhost / 127.* (dev e E2E do CI rodam local). Assim a cota gratuita nao e
 * gasta com erro de teste/dev.
 */
import * as Sentry from "@sentry/nextjs";

const DEFAULT_DSN =
  "https://febccfe0c61a42ced505e16a9b20cfae@o4511635141033984.ingest.de.sentry.io/4511635147718736";
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || DEFAULT_DSN;

const host = typeof window !== "undefined" ? window.location.hostname : "";
const isRealDomain = host !== "" && !/^(localhost|127\.|0\.0\.0\.0|\[?::1)/.test(host);

Sentry.init({
  dsn,
  enabled: dsn !== "" && isRealDomain,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
