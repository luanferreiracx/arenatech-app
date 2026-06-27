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
- **D4-resto (segunda rodada):**
  - **✅ `sessionTimeoutMinutes` — feito:** logout por inatividade client-side (componente `IdleTimeout` no layout autenticado, lê `getSecurity`). **Opt-in** (null = sem timeout, no-op). Padrão comum (atividade = mouse/teclado/scroll/toque); o limite duro do servidor segue o `maxAge` do NextAuth. Escolhido client-side de propósito: forçar logout pelo callback JWT/proxy tem muitos casos de borda frágeis (troca de tenant, prefixo de cookie em prod, loop de redirect) no caminho de auth mais crítico — risco > valor para um recurso opt-in.
  - **🚫 `maxFailedLoginAttempts`/`lockoutMinutes` — NÃO implementado (de propósito):** o lockout fixo atual (5 tentativas/15min) já é seguro; deixá-lo por-tenant permitiria uma loja **enfraquecer** (ex.: 100 tentativas). Além disso o rate-limit roda **antes** de resolver o tenant (key por identificador). Mantido fixo — decisão de segurança.
  - **🚫 `passwordExpirationDays` — NÃO implementado (de propósito):** rotação periódica de senha é **anti-padrão** pelo NIST SP 800-63B (induz senhas fracas/previsíveis). O default atual (sem expiração) é a recomendação moderna.

### D5 · Notificações por evento não disparam pela config (P1) — **correção: NÃO há tela**
- **Onde:** `settings.listNotificationConfigs`/`upsertNotificationConfig`/`toggleNotificationConfig` (`settings.ts:~1104`).
- **Correção da investigação:** ao contrário do que o relatório do agente disse, **não existe tela** de notificações — essas procedures são **órfãs (0 callers na UI)**, batendo com a auditoria de jun/26 (P3-1). Então não há "config que dá falsa sensação"; há **scaffolding** de uma feature ainda não construída (nem o dispatcher, nem a UI).
- **Hoje:** os envios são **manuais/opt-in** (ex.: WhatsApp na conclusão da OS, quando o operador escolhe). `sale.finalize` não envia nada. Eventos como OS_CRIADA/CAIXA_FECHADO não têm envio automático.
- **Decisão (dono):** **esconder/adiar** — como não há tela, nada a esconder; fica documentado como **feature futura** (dispatcher central + UI + templates + opt-out do cliente). Procedures órfãs permanecem como scaffolding.

### D6 · Settings de recebimento não são consumidos (P2) — **✅ ocultado (em breve)**
- **Onde:** `settings.updateReceiving` (`settings.ts:~856`) + página `/settings/receiving`. Campos: `defaultPolicyDevice/NonDevice`, `minInstallmentAmount`, `requireCpfAbove`, `autoCloseTime`, `monthlySalesGoal`, `defaultDasRate`, `defaultIcmsDiffRate`.
- **Realidade:** a página é real e salva, mas **nenhum fluxo lê** os valores (só a própria página). Confirmado por grep.
- **✅ Feito (dono: esconder o que não funciona):** a aba **"Recebimento" foi removida do menu** de Configurações e a página ganhou um **aviso "em breve"** (os ajustes ficam salvos mas inertes). A página segue acessível por URL até a feature ser ligada — reversível (re-adicionar a aba quando implementar).
- **Quick-wins futuros (quando ligar):** `minInstallmentAmount`/`requireCpfAbove` são gates pequenos no PDV; `autoCloseTime` exige cron; metas/políticas são display.

### D7 · Nuvem Fiscal ignora o toggle `enabled` por-tenant (P2) — **✅ FEITO**
- **Onde:** `fiscal-service.ts:~56` lê só `NUVEM_FISCAL_CLIENT_ID/SECRET` do **env**; ignorava `TenantIntegration.enabled`.
- **✅ Feito:** `fiscal.authorize` (ponto de emissão na SEFAZ) agora **bloqueia** se o tenant **desativou explicitamente** a integração `NUVEM_FISCAL` (linha `TenantIntegration` existe com `enabled=false`), com erro claro. **Semântica segura:** sem linha = comportamento antigo (env-driven) — não quebra quem emite sem nunca ter mexido no toggle. Cancelar/carta de correção de notas já emitidas seguem permitidos (só a emissão nova é gateada).
- **Pendente (decisão de produto, não nesta rodada):** credenciais Nuvem Fiscal continuam **globais** (env). Tornar as credenciais **por-tenant** (cada loja com sua conta Nuvem Fiscal) é mudança maior, separada.

---

## Nota sobre as procedures órfãs (cruzamento com a auditoria de jun/26)
`settings.getSecurity`, `listTeam`, `upsertNotificationConfig`, `previewPaymentBreakdown` apareceram como "órfãs" na auditoria `AUDIT_FORCA_TAREFA_2026-06-26.md` (P3-1) e foram **mantidas** por serem scaffolding de feature. Esta investigação confirma o porquê: são as pontas-soltas das features D4/D5/D6 acima. Decidir D4-D7 também resolve o destino dessas procedures (religar vs remover).
