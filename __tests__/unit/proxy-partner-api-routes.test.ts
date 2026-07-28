/**
 * Regressão: a API de parceiros estava inalcançável para clientes-máquina.
 *
 * Medido em produção (2026-07-28), da vantagem real de um parceiro:
 *
 *   POST https://app.arenatechpi.com.br/api/v1/partner/depix/deposits  -> 301
 *   POST https://pdvdepix.app/api/v1/partner/depix/deposits            -> 307 /login
 *   ...seguindo redirects (-L)                                         -> 200 + HTML
 *
 * Dois defeitos somados:
 *
 * 1. `/api/v1/partner/*` não estava na lista de rotas públicas do proxy. Só o
 *    `openapi.yaml` estava. Essas rotas se autenticam por `Authorization: Bearer`
 *    (API-key com hash bcrypt, escopo e rate-limit em `withPartnerAuth`) — não por
 *    cookie de sessão. O proxy não olha o header, então tratava toda chamada como
 *    anônima e mandava pro /login.
 *
 * 2. O host DOCUMENTADO (`app.arenatechpi.com.br`) leva um 301 pro host canônico.
 *    Webhooks já eram isentos justamente porque cliente-máquina não segue redirect
 *    de POST com corpo preservado — a API de parceiros tem o mesmo problema e não
 *    era isenta.
 *
 * O pior sintoma é o terceiro: um cliente que segue redirects recebe **200 com
 * HTML**. Quem confere só o status code conclui que deu certo.
 *
 * Isso já tinha acontecido antes com o tRPC do onboarding NO-KYC (#365, "o
 * middleware redireciona a chamada fetch para /login e o cliente recebe HTML em
 * vez de JSON"). Mesma classe, repetida.
 */
import { describe, it, expect } from "vitest";
import { isPublicRoute, isLegacyHostDirectServe } from "@/lib/auth/public-routes";

const PARTNER_ENDPOINTS = [
  "/api/v1/partner/depix/deposits",
  "/api/v1/partner/depix/withdrawals",
  "/api/v1/partner/depix/transactions/9e008328-2a80-4b0a-b041-b8803fb3ab41",
  "/api/v1/partner/openapi.yaml",
];

describe("proxy: rotas da API de parceiros", () => {
  it.each(PARTNER_ENDPOINTS)("%s é pública (autentica por Bearer, não por cookie)", (path) => {
    expect(isPublicRoute(path)).toBe(true);
  });

  it("não abre o painel junto (a exceção é só o prefixo da API)", () => {
    expect(isPublicRoute("/painel")).toBe(false);
    expect(isPublicRoute("/api/trpc/depixTransaction.createWithdraw")).toBe(false);
    // Um path que apenas COMEÇA parecido não pode passar.
    expect(isPublicRoute("/api/v1/partnerx/segredo")).toBe(false);
  });
});

describe("proxy: host legado não pode redirecionar cliente-máquina", () => {
  it.each(PARTNER_ENDPOINTS)("%s é servido direto no host legado", (path) => {
    expect(isLegacyHostDirectServe(path)).toBe(true);
  });

  it("mantém webhooks isentos (motivo original da regra)", () => {
    expect(isLegacyHostDirectServe("/api/webhooks/eulen")).toBe(true);
  });

  it("páginas normais seguem redirecionando pro host canônico", () => {
    expect(isLegacyHostDirectServe("/painel")).toBe(false);
    expect(isLegacyHostDirectServe("/login")).toBe(false);
  });
});
