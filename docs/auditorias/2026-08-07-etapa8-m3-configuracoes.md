# Etapa 8 · Módulo 3 — Configurações

> Varredura por módulo. Três provas: código, dado de produção, navegador real.
> Data: 2026-08-07. Skill: `audit-security`.

## Por que este módulo

`settings.ts` tem **1.755 linhas — o maior router do sistema** — e 46
procedures. Toca `tenant_settings`, fiscal, segurança, recebimento, assistência,
formas de pagamento, usuários e o **certificado digital A1**. Config errada aqui
não quebra um módulo: quebra todos.

---

## E8-3 — A tela negava, o resolver entregava — ✅ CORRIGIDO

`settings.listAuditLogs` era `tenantProcedure`.

A **tela** já negava: `/settings/logs` não está em `SETTINGS_OPERATOR_TABS`, e
`settingsPathRequiresAdmin` redireciona o operador. Mas o **resolver** respondia.

Medido no navegador contra a cópia de produção, chamando o tRPC direto como
operador:

```
HTTP 200 | 50 registros | 19.634 bytes
```

Segurança por obscuridade — **o mesmo padrão do M9-3**, onde o menu escondia
"Contas a Pagar" e o resolver entregava.

### O que a trilha revela

`audit_logs` registra `reset_password`, `reset_two_factor` e `removed` de
usuários — **quem administrou credencial de quem** — além de valores de venda e
notas livres do operador.

Hoje: **155 registros, 3 atores, 0 eventos de credencial**. O caminho estava
aberto antes de haver o que ler por ele.

### Verificado depois do fix

```
ADMIN    -> HTTP 200, 50 registros
OPERADOR -> HTTP 403, 0 registros
```

O teste afirma o **par tela↔resolver**: se `/settings/logs` entrar nas abas do
operador, o gate passa a contradizer a navegação, e o teste quebra. Proteger só
um lado é o defeito, não a correção.

---

## O que ataquei e resistiu

Este módulo é, de longe, **o mais bem defendido que auditei até aqui**.

### Escalação de privilégio: 6 vetores, 6 recusas

Operador chamando o tRPC direto, contra produção:

| mutation | resultado |
|---|---|
| `updateSecurity` | **403** — "Ação restrita a administradores do tenant" |
| `updateFiscalSettings` | **403** — "Apenas proprietários…" |
| `updateReceiving` | **403** |
| `createPaymentMethod` | **403** — "Sem permissão para alterar formas de pagamento" |
| `removeFiscalCertificate` | **403** |
| `deleteLogo` | **403** — "Apenas gerentes e proprietários…" |

**As 12 mutations do router têm gate inline** `isTenantAdmin` (padrão ADR 0053),
sem exceção.

### Fuga de tenant: 3 vetores, 3 recusas

`removeUser`, `resetUserPassword` e `resetUserTwoFactor` usam `withAdmin` — que
faz **BYPASS de RLS** — e recebem `userId` arbitrário. Era o vetor mais
promissor da rodada de red team.

Admin do `arena-tech` contra um usuário do `audit-loja-2`:

```
resetUserPassword  -> 404 "Usuario nao encontrado neste tenant"
resetUserTwoFactor -> 404
removeUser         -> 404
```

A defesa é `loadMembership(tx, tenantId, userId)`, que faz `findUnique` na chave
composta `(userId, tenantId)` **antes** de qualquer escrita. Sem membership, não
há operação. E ainda bloqueia administrar superadmin interno.

**É a decisão de projeto mais importante deste módulo:** o bypass de RLS existe
por necessidade (usuário é global, não do tenant), e o escopo foi reposto na
camada acima, explicitamente.

### Vazamento por leitura: 5 procedures, 0 segredos

| procedure | admin | operador | segredo? |
|---|---|---|---|
| `listIntegrations` | 200 / 1.942 b | 200 / 1.942 b | não |
| `listUsers` | 200 / 2.986 b | 200 / 2.987 b | não |
| `getFiscalSettings` | 200 / 447 b | 200 / 447 b | não |
| `listTeam` | 200 / 1.901 b | 200 / 1.901 b | não |

Nenhuma devolve `pfx`, `passwordHash`, `secret`, `apiKey` ou `twoFactorSecret`.
`getFiscalSettings` usa **whitelist explícita** de campos — certificado e senha
ficam de fora por construção, não por acidente.

### Certificado digital A1

O caminho mais sensível do módulo, e está bem feito:

- senha do `.pfx` é **validada e descartada** — nunca persistida;
- arquivo cifrado com **AES-256-GCM** antes de subir ao MinIO;
- guardado sob `tenants/{id}/certificates/`, prefixo **bloqueado** no
  `/api/storage` desde o B4.

---

## Achados descartados

1. **"27 procedures são `tenantProcedure`"** — parecia superfície aberta demais.
   Não é: 12 são mutations **com gate inline**, e as leituras não expõem
   segredo. O padrão ADR 0053 (procedure genérica + gate inline) torna a
   contagem enganosa.
2. **"Zero `assertOwned` no router"** — verdadeiro, mas irrelevante aqui: as
   escritas com ID de outra entidade passam por `loadMembership`, que faz o
   mesmo trabalho na chave composta.
3. **"O menu tem 'Logs' sem `adminOnly'"** — era **"WhatsApp Logs"**, rota de
   superadmin (`/admin/whatsapp-logs`), não a trilha do tenant. Confundi as
   duas antes de olhar a rota real.

---

## Baixa confiança

- **Não auditei as 46 procedures uma a uma.** Cobri as 12 mutations com gate,
  as 3 de usuário (o vetor de bypass de RLS), as 5 leituras de maior superfície
  e o fluxo do certificado. As demais — bot config, integrações, notificações —
  tiveram só o nível de acesso verificado.
- **Não testei `uploadLogo` com arquivo hostil** (SVG com script, polyglot).
  O gate de papel está lá; a validação de conteúdo não foi exercitada.
- **Não verifiquei rotação da chave de cifra do PFX.** Se `PFX_ENCRYPTION_KEY`
  vazar, todos os certificados cifrados no MinIO são legíveis — e não sei se há
  procedimento de rotação.
