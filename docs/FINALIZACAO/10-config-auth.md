# Módulo 10 — Configurações / Equipe / Auth

**Passada A (backend):** concluída — parte 1 em 2026-07-29, parte 2 em 2026-07-30.
**Passada B (frontend):** pendente (18 telas).

> **Antecipado** na fila (decisão do dono, 2026-07-29): três achados transversais
> vinham caindo neste módulo ao longo das passadas anteriores, e todos afetam os
> módulos que ainda faltam. Corrigir na raiz já tinha pago uma vez — as correções
> de primitivo dos Módulos 2–4 fizeram os Módulos 4, 5 e 6 chegarem quase limpos.

## Superfície

| | |
|---|---|
| Routers | `settings.ts` (1.463), `auth.ts` (260), `two-factor.ts` (343) |
| Borda | `src/proxy.ts` (252) — sessão, tenant ativo, gating de rota |
| Serviços | `password-policy.service.ts`, `backup-code.service.ts`, `two-factor-verify` |
| Telas | `/settings/*` (18), `(auth)/*` |

## Achados

### CFG-1 — havia uma política de bloqueio de conta que nada aplicava (P1)

`TenantSecuritySettings` guardava `maxFailedLoginAttempts` (default 5) e
`lockoutMinutes` (default 15). Os campos eram validados por Zod na procedure de
escrita e selecionados pelo serviço de política de senha.

**Nenhum código os consumia.** O bloqueio real do login é o rate-limit por IP
(`src/lib/utils/rate-limit.ts`), com valores **fixos** no código, e `users` não
tem coluna de tentativas falhas. Ou seja: dois campos que pareciam uma política
de bloqueio **de conta** e não eram nem configuráveis (a procedure de escrita não
tem tela) nem por conta.

É o que a skill de auditoria de segurança chama de **controle ilusório**: parece
proteção, cria confiança falsa, e no dia do incidente não está lá.

**Decisão do dono:** remover. Sem perda de dado — a tabela está **vazia em
produção** (0 linhas, medido em 2026-07-29): a política nunca foi configurada por
ninguém, porque não havia como.

> Bloqueio por conta de verdade, se um dia virar prioridade, é item próprio:
> exige coluna no usuário, contagem no login e cuidado no caminho mais sensível
> do sistema.

### CFG-2 — as rotas REST não tinham gating de plano (P1)

O gate por plano vivia **só na borda tRPC**. As **25 rotas REST autenticadas por
sessão** (PDFs, CSVs, uploads, SSE) ficavam sem nada: o proxy isenta `/api/*` de
propósito — um redirect 307 → HTML quebra o cliente JSON, incidente documentado —
e o `tenantProcedure` não passa por elas.

O efeito era concreto e verificável: um tenant **wallet-only** não conseguia
chamar `stock.*` pelo tRPC, mas **baixava o PDF de posição de estoque**, o CSV do
financeiro e o recibo do PDV pela rota REST equivalente. O plano virava
preferência de UI na metade REST do sistema.

Vale nomear a confusão que sustentava isso: `tenantProcedure` + RLS garantem
**isolamento** (o dado é do tenant certo), **não gating de plano**. São controles
diferentes, e o segundo não existia aqui.

**Correção estrutural, não por rota.** A decisão de "este tenant tem este
módulo?" foi extraída para `src/server/auth/module-gate.ts` e passou a ser
chamada pelos **dois** lados — a borda tRPC e as rotas REST. Escrever a regra
duas vezes seria repetir exatamente o padrão que este programa encontrou em três
módulos: duas implementações, o endurecimento numa e os usuários na outra.

Cobertura aplicada: 25 rotas, por módulo — `cashier` (1), `commissions` (3),
`financial` (1), `fiscal` (2), `pdv` (4 + SSE), `service-orders` (6),
`stock` (4), `depix-ops` (1 + SSE), `wallet` (1).

**Guardião**: `__tests__/unit/rest-module-gate.test.ts` varre `src/app/api`,
exige o gate em toda rota que lê sessão e obriga a **declarar o motivo** de cada
dispensa (cron por `CRON_SECRET`, webhook por HMAC, parceiro por API-key, mídia
por token assinado, catálogo público). Verificado a valer: criei uma rota nova sem
gate e o teste reprovou apontando o nome dela. Ele também falha se uma dispensa
apontar para rota que não existe mais — dispensa órfã esconde a próxima rota que
nascer com o mesmo nome.

**Prova de que o gate age**, não só existe: um caso em
`stock-report-uses-real-balance` chama a rota do PDF com sessão cujo plano não
traz `stock` e espera **403**.

### CFG-3 — o PDF do simulador não tinha autenticação nenhuma (P2)

`POST /api/simulator/pdf` era aberto: recebia valores no corpo e devolvia HTML
formatado. **Não lê banco e não expõe dado de tenant** (é um formatador puro, e o
conteúdo passa por `escapeHtml`), então não havia vazamento — mas era um gerador
de documento aberto na internet, sem sessão e sem limite. A tela que o usa é
autenticada; o endpoint passou a exigir o mesmo.

## Pendências deste módulo para o dono (fim do programa)

Medições que sustentam cada uma:

1. **A política de senha não tem tela.** `minPasswordLength`, exigência de
   maiúscula/número/símbolo e expiração de senha **são aplicados de verdade**
   (`password-policy.service.ts` → `lib/password.ts`), mas a procedure de escrita
   (`settings.updateSecurity`) **não tem nenhuma tela chamando** e a tabela está
   vazia. Todo tenant roda nos defaults, para sempre. `/settings/security` só
   troca senha.
2. **O logout por inatividade nunca dispara.** `IdleTimeout` no layout lê
   `sessionTimeoutMinutes`, que fica sempre nulo pelo mesmo motivo. A memória do
   projeto descreve o recurso como "opt-in pelo tenant via Config → Segurança" —
   **esse opt-in não existe na UI.**
3. **9 procedures de `settings` e 1 de `auth` sem nenhuma tela chamando**:
   `upsertInstallmentRules`, `upsertPaymentRates`, `listTeam` (a tela virou
   redirect para `/settings/users`), `updateFiscalCertificate`,
   `removeFiscalCertificate`, `updateSecurity`, `listNotificationConfigs`,
   `upsertNotificationConfig`, `toggleNotificationConfig`,
   `auth.validateTenantAccess`. Duas dessas (as de certificado fiscal) pertencem
   ao módulo adiado.

Vale notar que **`updateSecurity` foi mantida de propósito**, apesar de morta: é
o único caminho para configurar uma política que **é aplicada**. Removê-la
tornaria a política permanentemente imutável por desenho.

## Um transversal que caiu por não se sustentar

Eu vinha carregando desde o Módulo 5 a ideia de que o `ErrorBoundary` "esconde
crash de componente sem avisar o usuário". Fui verificar aqui:
`src/app/(app)/error.tsx` **mostra uma mensagem clara e visível** — "Algo deu
errado nesta tela", com botões de tentar novamente e ir para o painel, dentro do
layout, preservando a navegação.

A premissa da minha nota estava errada como enunciada. Corrigi o doc do Módulo 5
e **o item não virou achado**. O que eu tinha de fato era: o componente lançou,
foi capturado e o console registrou — não que o usuário ficasse sem aviso. As
capturas do pré-correção já tinham sido sobrescritas, então o caso não é mais
decidível.

Fica a lição: **anotar hipótese como se fosse achado contamina o módulo
seguinte.** Passei a marcar explicitamente o que é medido e o que é suposto.

## Verificação

```bash
pnpm typecheck && pnpm lint && pnpm test:unit    # 2013 verdes
```

Migration `drop_unenforced_lockout_policy` — remove duas colunas de uma tabela
vazia em produção.
