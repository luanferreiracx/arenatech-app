# 0050 — Onboarding de tenant NO-KYC (email + senha, aprovação por superadmin)

- **Status:** Proposto
- **Data:** 2026-06-14
- **Decisores:** Dono do produto + dev sênior (migração Arena Tech)
- **Contexto relacionado:** [[0049-login-turnstile-2fa]], fluxo de pré-cadastro existente (`/register` + `PreRegistration`), gating de módulos (`src/lib/modules.ts`), WhatsApp Cloud API (`src/lib/services/whatsapp-cloud-service.ts`).

---

## Contexto

O sistema visa **confidencialidade**. Hoje todo usuário tem `cpf` obrigatório e único, e o
login é exclusivamente por CPF. Tenants nascem por dois caminhos: criação manual pelo
superadmin (`admin.createTenant`) ou um auto-cadastro público (`/register`) que coleta
**CNPJ + CPF do dono** (KYC) e gera um `PreRegistration` PENDING, aprovado depois pelo
superadmin (`admin.approvePreRegistration`), que cria tenant + user + carteira DePix.

Queremos oferecer um caminho **NO-KYC**: o próprio interessado se cadastra **só com
email + senha** (mais nome e telefone), valida email e telefone, e fica **aguardando
aprovação** de um superadmin. Após aprovado, acessa o tenant — **limitado ao módulo DePix
Wallet**. Tenants **KYC** (com CPF/CNPJ) continuam podendo usar todo o sistema conforme
liberamos módulos.

## Decisão

Introduzir o tipo de tenant **NO-KYC** reaproveitando a infraestrutura existente
(`PreRegistration`, aprovação por superadmin, gating de módulos, `TenantStatus.PENDING`,
Resend, WhatsApp Cloud API). Decisões fechadas com o dono:

1. **Identidade / login dual, sem flag nova de tipo.**
   - O tipo é **inferido pela presença de documento**: tenant/usuário **com** `cpf`/`cnpj`
     = KYC; **sem** documento = NO-KYC. Não criamos `Tenant.kycType`.
   - `User.cpf` passa a ser **nullable** (índice único parcial: único quando não-nulo).
   - **Login dual por host/identificador:** tenant normal faz login por **CPF**; tenant
     NO-KYC faz login por **email**. O `authorize` aceita um dos dois identificadores.
   - Pré-cadastro público passa a ser **exclusivo do NO-KYC**. Para KYC, o tenant é criado
     **manualmente pelo superadmin** (sem pré-cadastro). A página `/register` é
     **reconvertida** para o formulário NO-KYC (remove CPF/CNPJ).

2. **Slug opaco (confidencialidade).** O tenant NO-KYC recebe um slug **aleatório e
   opaco** do tipo `pdv-7f3a9c` (não sequencial — não revela a contagem de tenants).
   Sem subdomínio dedicado: o acesso continua por `pdvdepix.app/login` e o tenant ativo
   vem da sessão/cookie (o sistema **não** resolve tenant por host hoje — ver
   `src/lib/brand-host.ts`).

3. **Pré-aprovação = login bloqueado.** Após validar email + telefone, o cadastro fica
   PENDING e o usuário vê uma tela "aguardando aprovação". **Não entra** no sistema até o
   superadmin aprovar — espelha o `TenantStatus.PENDING` atual (o `authorize` já filtra
   tenants por `status === ACTIVE`).

4. **Email e telefone obrigatórios, ambos verificados.**
   - **Email:** código numérico de 6 dígitos via **Resend** (`email-service.ts`).
   - **Telefone:** código via **WhatsApp Cloud API oficial** (`whatsapp-cloud-service.ts`,
     já implementado), usando um **template AUTHENTICATION** novo (ver abaixo).
   - Verificação por código é infra nova (hoje só existe 2FA TOTP).

5. **Limite ao DePix Wallet.** O gating por plano já define
   `DEFAULT_RELEASED_MODULES = ["wallet"]` para tenants novos — o limite "só DePix Wallet"
   **já é o comportamento padrão**. Reforçamos que NO-KYC nunca acesse além de `wallet`,
   mesmo que o plano mude.

## Template WhatsApp OTP (a criar na Meta)

Categoria **AUTHENTICATION** — a Meta **gera o corpo** (não se escreve texto livre);
escolhe-se o formato (código de cópia + validade). Definição a adicionar em
`src/lib/whatsapp/templates-catalog.ts` quando aprovado:

```ts
nokyc_verificacao: {
  name: "nokyc_verificacao",
  language: "pt_BR",
  category: "AUTHENTICATION",
  params: 1,           // {{1}} = código OTP (body + botão copy_code)
  isOtp: true,
  body: "{{1}} é seu código de verificação. Por segurança, não compartilhe este código.",
}
```

Criar via Graph API (WABA `3564717570348730`):

```
POST /{WABA_ID}/message_templates
{
  "name": "nokyc_verificacao",
  "language": "pt_BR",
  "category": "AUTHENTICATION",
  "components": [
    { "type": "BODY", "add_security_recommendation": true },
    { "type": "FOOTER", "code_expiration_minutes": 10 },
    { "type": "BUTTONS", "buttons": [ { "type": "OTP", "otp_type": "COPY_CODE" } ] }
  ]
}
```

**Dependência externa com lead time:** a aprovação do template pela Meta pode levar de
minutos a ~24-48h. **Fallback:** templates AUTHENTICATION costumam ser aprovados rápido;
se atrasar, a verificação de telefone fica como gate **soft** (bloqueante apenas quando o
template estiver `APPROVED`), sem travar a fase de email. O envio degrada para mock em
dev/CI (`WHATSAPP_MOCK=1`), como nas demais integrações.

## Schema (proposto)

- `User.cpf String?` (nullable). Substituir `@unique` por **índice único parcial**
  (`CREATE UNIQUE INDEX ... ON users (cpf) WHERE cpf IS NOT NULL`).
- `User.email` — passa a ser **obrigatório e único** para usuários NO-KYC; manter nullable
  no schema, garantir unicidade por índice parcial e validar na aplicação (KYC legado pode
  não ter email).
- Novo modelo **`VerificationCode`** (tabela global, sem tenant — o usuário ainda não tem
  tenant durante o cadastro):
  ```
  id, target (email | phone), channel ("EMAIL" | "WHATSAPP"),
  preRegistrationId?, codeHash (SHA-256), expiresAt, attempts, consumedAt,
  createdAt
  ```
  Sem RLS (global, igual a `password_reset_tokens`); rate-limit por target.
- `PreRegistration` ganha campos para o caminho NO-KYC: tornar `cnpj`/`ownerCpf`
  **opcionais**; adicionar `emailVerifiedAt`, `phoneVerifiedAt`, `passwordHash`
  (o usuário define a senha no cadastro, não recebe senha temporária), e um
  discriminador implícito (NO-KYC = sem `ownerCpf`).

## Faseamento

- **Fase 0 — Schema/migrations:** `User.cpf` nullable + índice único parcial; índice único
  parcial em `email`; modelo `VerificationCode` (+ grants, sem RLS); campos NO-KYC em
  `PreRegistration`. Validar `migrate deploy` em banco limpo.
- **Fase 1 — Verificação por código (infra):** serviço de geração/validação de OTP
  (6 dígitos, expiração 10min, rate-limit, hash em repouso); envio por email (Resend) e
  por WhatsApp (`sendCloudTemplate` com `nokyc_verificacao`); criar o template na Meta.
- **Fase 2 — Login dual:** `authorize` aceita email OU CPF; ajustar `cpfSchema`/validators
  e todos os pontos que assumem `cpf` presente (sessão, UI de perfil, etc.).
- **Fase 3 — Onboarding público NO-KYC:** reconverter `/register` (nome, email, telefone,
  senha) → cria `PreRegistration` NO-KYC + dispara códigos → telas de verificação de email
  e telefone → "aguardando aprovação".
- **Fase 4 — Aprovação superadmin (NO-KYC):** estender `admin.approvePreRegistration` para
  o caminho sem documento: cria user por email (sem CPF), `slug` opaco, plano wallet-only,
  liga `UserTenant` como `admin`, provisiona carteira DePix.
- **Fase 5 — Gating reforçado + UX:** garantir teto `wallet` para NO-KYC; tela de status
  pendente; aposentar o auto-cadastro KYC e documentar criação manual de tenant KYC pelo
  superadmin.

## Consequências

**Positivas**
- Reaproveita ~80% do fluxo existente (pré-cadastro, aprovação, gating, PENDING, Resend,
  WA Cloud).
- Confidencialidade: sem coleta de documento, slug opaco, login por email.
- Limite ao DePix Wallet é praticamente "de graça" (já é o default de gating).

**Negativas / riscos**
- `User.cpf` nullable e login dual tocam código sensível (auth) e exigem varredura de
  todos os pontos que hoje assumem CPF — risco de regressão; mitigar com testes.
- Dependência de aprovação do template OTP pela Meta (lead time).
- Auto-cadastro público sem KYC amplia a superfície de abuso — exigir Turnstile (já temos,
  ADR 0049), rate-limit por IP/email/telefone, e a aprovação manual como gate final.

## Alternativas consideradas

- **Flag `Tenant.kycType` explícita:** rejeitada — o dono preferiu inferir por
  presença de documento ("tem cpf/cnpj? não tem?"), menos schema.
- **Subdomínio por tenant (`pdv1.pdvdepix.app`):** rejeitada para esta entrega — exigiria
  wildcard DNS + cert + resolução host→tenant no proxy (feature grande). Fica como
  evolução futura; por ora o slug é só identidade interna opaca.
- **Reusar campo `cpf` guardando email:** rejeitada — polui dados e quebra validação de
  CPF.
