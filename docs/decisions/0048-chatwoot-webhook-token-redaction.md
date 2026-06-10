# ADR 0048 — Redação do token do webhook Chatwoot nas access logs

Data: 2026-06-09
Status: Aceito

## Contexto

O webhook `/api/webhooks/chatwoot` autentica de três formas (timing-safe):
header `x-chatwoot-signature`, header `authorization: Bearer <token>` e
**query string `?token=<token>`**. A query string existe porque o Agent Bot do
Chatwoot não permite configurar headers customizados na URL do webhook — é a
única forma prática de autenticar a partir do próprio bot.

O problema: quando o token vem na URL, ele entra em `$request` / `$request_uri`
e o nginx o grava **em texto puro em toda linha de access log**. Qualquer pessoa
com leitura das logs (operador, backup de logs, agregador externo, vazamento de
disco) obtém o segredo e passa a **forjar eventos de webhook** — criar mensagens
de conversa, disparar runs do Talison, etc., já que o token é a única barreira.

Confidence da exploração: alta. O token é estático (env `CHATWOOT_WEBHOOK_TOKEN`),
não rotaciona por requisição, e as logs persistem por padrão.

## Decisão

**Redigir o parâmetro `token` da URI antes de gravar no access log**, via nginx,
sem mexer no fluxo de autenticação (o token continua válido — só não é logado).

No `deploy/nginx/app.arenatechpi.com.br.conf`:

1. `map $request_uri $chatwoot_safe_uri` (contexto http) reescreve a URI do
   endpoint do Chatwoot para `/api/webhooks/chatwoot?token=REDACTED`.
2. `log_format redacted_chatwoot` espelha o combined, mas loga `$chatwoot_safe_uri`
   no lugar de `$request`.
3. `location = /api/webhooks/chatwoot` usa `access_log ... redacted_chatwoot` —
   mesmo proxy do `location /`, só muda o formato de log.

No código (`src/app/api/webhooks/chatwoot/route.ts`): comentário de segurança
explícito explicando o risco e apontando para esta mitigação, e recomendando
preferir o header `authorization: Bearer` sempre que o caminho permitir.

## Consequências

- **Positivas:** o segredo deixa de aparecer nas access logs; nenhuma mudança no
  contrato de autenticação (Chatwoot segue mandando `?token=`); zero downtime.
- **Trade-off:** a redação vive na infra (nginx), não na aplicação — um deploy que
  não aplique este conf volta a vazar. Mitigado por versionar o conf no repo e
  pelo comentário no código que aponta para o ADR.
- **Limite conhecido:** se outro proxy/CDN à frente (ex.: Cloudflare) logar a URL
  completa, a redação dele é responsabilidade separada. O Cloudflare por padrão
  não loga query strings em texto puro nos logs de acesso padrão, mas se logs
  enriquecidos forem habilitados, revisar.
- **Melhor caminho futuro:** migrar o Chatwoot para autenticar só por header
  (quando/se o Agent Bot passar a suportar), e remover o fallback de query string.
