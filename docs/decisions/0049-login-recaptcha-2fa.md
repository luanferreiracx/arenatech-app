# ADR 0049 — reCAPTCHA adaptativo no login + 2FA TOTP

Data: 2026-06-09
Status: Aceito (reCAPTCHA implementado; 2FA na sequência)

## Contexto

O login (CPF + senha) tinha como única defesa contra brute force o rate limit
in-memory por CPF (5 tentativas / 15 min). O sistema Laravel antigo já exibia um
reCAPTCHA v2 no login. Queremos elevar a segurança de acesso com:

1. **reCAPTCHA** no login (reaproveitando a lógica do Laravel).
2. **2FA** (autenticação de dois fatores).

## Decisão

### reCAPTCHA v2 (checkbox), adaptativo após 3 falhas

- **Versão v2 checkbox** ("Não sou um robô") — mantém a UX do Laravel.
- **Adaptativo:** o desafio só aparece **após 3 falhas** para o mesmo CPF, em vez
  de em todo login. Não atrita o caminho feliz; encarece o brute force quando ele
  começa. O contador reusa o mesmo bucket do `authorize()` (`login:<cpf>`), sem
  dupla contagem — a `loginAction` apenas lê para decidir o gate.
- **Verificação server-side** em `src/lib/recaptcha.ts`, porta de
  `AuthController::verifyRecaptcha` do Laravel: POST a `siteverify` com
  `secret`+`response`. **Fail-open** igual ao Laravel: sem `RECAPTCHA_SECRET_KEY`
  → permite (dev); erro de rede/timeout com o Google → loga e permite (uma queda
  do reCAPTCHA não pode derrubar todos os logins). Token ausente com captcha
  exigido → falha.
- **Fluxo:** o login passou a usar a server action `loginAction` com
  `useActionState`. Isso dá um sinal **confiável** de `captchaRequired` ao cliente
  (o NextAuth mascara mensagens lançadas no `authorize()`, então não dá para
  sinalizar por lá). O widget v2 renderiza só quando o servidor exige.
- **CSP:** `next.config.ts` libera `www.google.com`/`www.gstatic.com` em
  `script-src`/`connect-src` e `www.google.com` em `frame-src` (o desafio abre num
  iframe). Sem isso a CSP de #54 bloquearia o widget.
- **Chaves por domínio:** o reCAPTCHA trava a site key por domínio. As chaves
  precisam cobrir os hosts de login (app.arenatechpi.com.br, pdvdepix.app). As
  chaves antigas do Laravel são de outro domínio — provisionar novas.

### 2FA — TOTP, obrigatório para superadmin e admins (PR seguinte)

- **TOTP** (app autenticador): sem custo, offline, padrão de mercado.
- **Obrigatório** para superadmin e admins de tenant; **opcional** para os demais.
- Detalhes de schema/fluxo no PR de 2FA.

## Consequências

- **Positivas:** brute force fica caro após poucas tentativas; UX preservada no
  caminho feliz; verificação fail-open não cria ponto único de falha.
- **Trade-off:** o contador adaptativo é in-memory (single-instance), como o rate
  limit existente — em deploy multi-instância, migrar para Redis (a interface do
  util já foi desenhada para isso).
- **Operacional:** sem as variáveis de ambiente do reCAPTCHA, o comportamento é
  idêntico ao atual (sem captcha). O captcha só entra em vigor quando as chaves
  forem configuradas em produção.
