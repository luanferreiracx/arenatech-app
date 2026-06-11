# ADR 0049 — Turnstile adaptativo no login + 2FA TOTP (opt-in)

Data: 2026-06-09 (revisado 2026-06-11)
Status: Aceito

## Contexto

O login (CPF + senha) tinha como única defesa contra brute force o rate limit
in-memory por CPF (5 tentativas / 15 min). Queremos elevar a segurança de acesso
com um desafio anti-bot e com 2FA.

> **Histórico:** a primeira versão usava Google reCAPTCHA v2 (porte do Laravel) e
> 2FA obrigatório para admins. Em 2026-06-11 trocamos para **Cloudflare Turnstile**
> (sem Google no caminho do login, melhor privacidade/UX) e tornamos o 2FA
> **puramente opt-in** (decisão do dono: cada usuário escolhe).

## Decisão

### Cloudflare Turnstile, adaptativo após 3 falhas

- **Adaptativo:** o desafio só aparece **após 3 falhas** para o mesmo CPF, não em
  todo login. Não atrita o caminho feliz; encarece o brute force quando começa. O
  contador reusa o bucket do `authorize()` (`login:<cpf>`), sem dupla contagem — a
  `loginAction` apenas lê para decidir o gate.
- **Verificação server-side** em `src/lib/turnstile.ts`: POST a
  `challenges.cloudflare.com/turnstile/v0/siteverify` com `secret`+`response`
  (+`remoteip`). **Fail-open:** sem `TURNSTILE_SECRET_KEY` → permite (dev); erro de
  rede/timeout com o Cloudflare → loga e permite (uma queda do Turnstile não pode
  derrubar todos os logins). Token ausente com captcha exigido → falha. Token é de
  uso único (5min); replay retorna `timeout-or-duplicate`.
- **Widget**: `@marsidev/react-turnstile`, renderizado só quando o servidor exige.
  A `loginAction` (server action + `useActionState`) dá um sinal **confiável** de
  `captchaRequired` ao cliente (o NextAuth mascara mensagens lançadas no
  `authorize()`, então não dá para sinalizar por lá).
- **CSP:** `next.config.ts` libera `https://challenges.cloudflare.com` em
  `script-src`/`connect-src`/`frame-src` (o desafio abre num iframe desse host).
- **Chaves**: criar um widget em dash.cloudflare.com → Turnstile incluindo os hosts
  de login (app.arenatechpi.com.br, pdvdepix.app). `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
  (pública) + `TURNSTILE_SECRET_KEY`.

### 2FA — TOTP, **opt-in**

- **TOTP** (app autenticador, lib `otpauth`): sem custo, offline, padrão de mercado.
- **Opt-in:** cada usuário ativa/desativa em **Configurações › Segurança**. Não há
  obrigatoriedade — quem força 2FA teria que configurar primeiro, então deixamos a
  escolha com o usuário.
- **Segredo cifrado em repouso** (AES-256-GCM) com chave **derivada do
  NEXTAUTH_SECRET** (sha256 de `secret:two-factor`) — sem nova chave crítica para
  gerenciar. Rotacionar o NEXTAUTH_SECRET invalida os segredos 2FA (re-enroll),
  trade-off aceito e raro.
- **Backup codes**: 10 códigos de uso único, guardados como hashes SHA-256;
  exibidos uma única vez na ativação. Aceitos no login quando o usuário perde o app.
- **Fluxo de login** (single provider, sinalização confiável): `authorize()` ganha
  o credential `totp`. Com senha correta e 2FA ativo, sem código → lança
  `TwoFactorRequiredError` (subclasse de `CredentialsSignin` com `code`); o
  `@auth/core` re-lança erros de `AuthError` ao chamador em `raw` mode, então o
  `loginAction` lê `error.code` e devolve `{ twoFactorRequired }` — o NextAuth
  mascara a *mensagem*, não o *code*. Código inválido → `TwoFactorInvalidError`.
- **UI**: enrollment com QR + entrada manual + backup codes no card de
  `settings/security`.

## Consequências

- **Positivas:** brute force fica caro após poucas tentativas; UX preservada no
  caminho feliz; verificação fail-open não cria ponto único de falha; sem Google no
  login (Turnstile é mais leve e privacy-friendly); 2FA é escolha do usuário.
- **Trade-off:** o contador adaptativo é in-memory (single-instance), como o rate
  limit existente — em deploy multi-instância, migrar para Redis (a interface do
  util já foi desenhada para isso).
- **Operacional:** sem as variáveis do Turnstile, o login funciona sem captcha
  (idêntico ao atual). O captcha só entra em vigor quando as chaves forem
  configuradas em produção.
