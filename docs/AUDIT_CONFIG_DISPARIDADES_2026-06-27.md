# Disparidades Configuração ↔ Realidade (2026-06-27)

> Investigação a partir do relato do dono: "formas de recebimento no cartão (bandeiras etc.) não aparecem no PDV". Mapeei todo o fluxo config → consumo e achei 8 disparidades. As de **cartão + correções rápidas** foram corrigidas nesta rodada (PR). As **órfãs grandes** (config salva mas ignorada) ficam aqui priorizadas para você decidir caso a caso.

---

## ✅ Corrigido nesta rodada (cartão + rápidas)

### D1 · Bandeiras de cartão não apareciam no PDV — **CORRIGIDO**
- **Causa:** o PDV (`payment-dialog.tsx`) só mostrava a captura de cartão quando havia **adquirentes E bandeiras**. O seed do tenant cria bandeiras mas **nenhum adquirente**, e tenants antigos/migrados do Laravel nem bandeiras tinham (o seed só roda na criação; a migration foi aditiva sem backfill). Resultado: o bloco sumia.
- **Fix:** (a) o gate passou a mostrar a **bandeira sempre que houver bandeiras** (adquirente é opcional — "maquininha"); (b) **migration de backfill** semeia o catálogo padrão de bandeiras (Visa/Master/Elo/Amex/Hipercard) para todo tenant que não tem nenhuma.

### D2 · Prévia de taxa/líquido do cartão não aparecia no PDV — **CORRIGIDO**
- **Causa:** `receiving.previewCardSettlement` existia mas a UI não chamava. O operador não via a taxa do adquirente nem o líquido antes de finalizar.
- **Fix:** o PDV agora mostra **taxa + líquido + data de liquidação (D+N)** ao escolher adquirente+bandeira+parcelas, quando há `AcquirerRate` cadastrada pra combinação. (Sem taxa cadastrada, não mostra — não inventa número.)

### D3 · Simulador de parcelas misturava regras de formas diferentes — **CORRIGIDO**
- **Causa:** `catalog.simulateInstallments` carregava **todas** as `installmentRule` (qualquer forma), misturando taxa de crediário/outras no simulador de cartão e podendo duplicar linhas pro mesmo Nx.
- **Fix:** filtra pelas regras das formas **CREDIT_CARD ativas** + dedup por número de parcelas (menor taxa).

---

## 📋 Órfãs grandes — config salva mas IGNORADA (decidir caso a caso)

> Cada uma é uma tela de Configurações que **grava** o valor, mas **nenhum fluxo lê**. Dão falsa sensação de que funcionam. Para cada uma: implementar (fazer valer) **ou** esconder da UI até existir. **Não toquei nesta rodada.**

### D4 · Política de senha não é aplicada (P1 — segurança) — **PARCIAL (complexidade ✅)**
- **Onde:** `settings.getSecurity`/`updateSecurity` (`settings.ts:~1044`). Campos: `minPasswordLength`, `requireUppercase/Number/SpecialChar`, `passwordExpirationDays`, `sessionTimeoutMinutes`, `maxFailedLoginAttempts`, `lockoutMinutes`.
- **Realidade (era):** nenhum lido — criação/reset/troca usavam regras fixas; o sistema aceitava 6 chars independentemente da config.
- **✅ Feito (complexidade, dono escolheu este escopo):** helper puro `validatePasswordPolicy` (`src/lib/password.ts`) + `enforcePasswordPolicy` (`password-policy.service.ts`, lê `TenantSecuritySettings` com defaults do schema). Aplicado nas **duas** trocas de senha (`auth.changePassword` + `settings.changePassword`) pelo **tenant ativo da sessão**. Os schemas Zod das trocas relaxados pra não-vazio → a **política é a fonte única** de tamanho/complexidade (mensagem consistente). Resets admin geram senha aleatória (política não se aplica). NO-KYC register não tem tenant ainda → mantém seu `passwordSchema` fixo (mín. 8 + letra+número).
- **Pendente (não nesta rodada, mais invasivo no NextAuth):** `passwordExpirationDays` (forçar troca), `sessionTimeoutMinutes` (timeout de inatividade no JWT), `maxFailedLoginAttempts`/`lockoutMinutes` (hoje o login usa rate-limit **fixo** 5/15min, não a config).

### D5 · Notificações por evento não disparam pela config (P1)
- **Onde:** `settings.listNotificationConfigs`/`upsertNotificationConfig` (`settings.ts:~1104`). Configura evento (OS_CRIADA, VENDA_FINALIZADA…) × canal (email/WhatsApp) + template.
- **Realidade:** **nenhuma** referência a `NotificationConfig` no código de notificação (os envios são pontuais/hardcoded nos fluxos). Confirmado por grep negativo.
- **Impacto:** o dono liga "email quando OS criada" e nada acontece — a config é ignorada.
- **Tamanho:** grande (um dispatcher central que lê a config por evento/canal/template).

### D6 · Settings de recebimento não são consumidos (P2)
- **Onde:** `settings.updateReceiving` (`settings.ts:~856`). Campos: `defaultPolicyDevice/NonDevice`, `minInstallmentAmount`, `requireCpfAbove`, `autoCloseTime`, `monthlySalesGoal`, `defaultDasRate`, `defaultIcmsDiffRate`.
- **Realidade:** lidos **só** pela própria página de settings (`/settings/receiving`), por nenhum fluxo. Confirmado por grep.
- **Impacto:** sem validação de valor mínimo de parcela; caixa não fecha no horário; meta/políticas decorativas.
- **Tamanho:** varia por campo (mín. parcela = pequeno no PDV; auto-close = cron, maior).

### D7 · Nuvem Fiscal ignora o toggle `enabled` por-tenant (P2)
- **Onde:** `fiscal-service.ts:~56` lê só `NUVEM_FISCAL_CLIENT_ID/SECRET` do **env**; ignora `TenantIntegration.enabled`.
- **Impacto:** o dono desativa a Nuvem Fiscal no painel mas, com as envs globais setadas, a emissão segue ativa pra todos os tenants — não dá pra desabilitar por tenant.
- **Tamanho:** pequeno-médio (checar `enabled` do tenant antes de emitir + decidir se credenciais são globais ou por-tenant).

---

## Nota sobre as procedures órfãs (cruzamento com a auditoria de jun/26)
`settings.getSecurity`, `listTeam`, `upsertNotificationConfig`, `previewPaymentBreakdown` apareceram como "órfãs" na auditoria `AUDIT_FORCA_TAREFA_2026-06-26.md` (P3-1) e foram **mantidas** por serem scaffolding de feature. Esta investigação confirma o porquê: são as pontas-soltas das features D4/D5/D6 acima. Decidir D4-D7 também resolve o destino dessas procedures (religar vs remover).
