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

/**
 * Erros que NAO sao do nosso codigo e nao ha o que corrigir.
 *
 * Sao injetados no nosso contexto por WebView/extensao do navegador. Deixa-los
 * entrar custa dobrado: torram a cota gratuita (5k/mes) e diluem os erros reais
 * — `window.webkit.messageHandlers` sozinho fez 25 eventos em duas semanas, todos
 * na home, nenhum acionavel.
 */
const IGNORED_THIRD_PARTY_ERRORS = [
  // Ponte JS<->nativo do WKWebView (iOS). So existe dentro de app nativo; quando
  // a pagina abre no Safari comum, o script injetado tenta usar e quebra.
  /window\.webkit\.messageHandlers/,
  // Falha de rede crua do navegador (aba em background, wifi caindo, usuario
  // fechando a pagina no meio do request). Nao e defeito da aplicacao. Sem
  // ancora: o Sentry casa o padrao tanto com a mensagem sozinha quanto com
  // "Tipo: mensagem".
  /network error|Load failed|Failed to fetch|NetworkError/i,
];

Sentry.init({
  dsn,
  enabled: dsn !== "" && isRealDomain,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  ignoreErrors: IGNORED_THIRD_PARTY_ERRORS,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
