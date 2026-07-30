# Módulo 10 — Configurações / Equipe / Auth

**Passada A (backend):** em andamento — primeira parte concluída em 2026-07-29.
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
