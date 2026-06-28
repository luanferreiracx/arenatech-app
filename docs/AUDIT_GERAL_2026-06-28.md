# Última geral — RBAC de dinheiro + config fiscal + UX (2026-06-28)

Varredura final pedida pelo dono em 4 frentes (dashboard, menu, config, RBAC). Dois agentes Explore varreram config e RBAC; **cada achado de alto impacto foi confirmado lendo o código** (os agentes super-afirmaram em alguns pontos — ver "descartados").

## Frente 1 — Dashboard (UX) → PR #324
Atalhos (**Acesso Rápido**) e **Alertas** estavam no FIM da página, depois de KPIs/gráficos/tabelas. Reordenado pra **ação no topo**: Saudação → Caixa → Acesso Rápido → Alertas → KPIs → Gráficos → Recentes. Atalhos viraram tiles maiores (grid até 6 col).

## Frente 2 — Menu (UX) → PR #324
Grupos reordenados por frequência de uso: Painel → Vendas → Assistência → Caixa → Clientes → Estoque → Financeiro → Ferramentas → Fiscal → Comissões → Config. Gating por módulo intacto.

## Frente 4 — RBAC: escritas de dinheiro acessíveis a operador → este PR
Decisão do dono: **gatear só dinheiro/irreversível** (fiscal/nfe-import ficam operacionais — a loja pode querer que o operador emita nota).

- **🔴 Saque DePix LEGADO sem proteção** (`depix-withdraw.ts` `create`/`update`): eram `tenantProcedure` chamando o MESMO service de saque que o fluxo canônico, mas **sem admin, sem 2FA, sem rate-limit, sem cap diário, sem idempotência**. Um operador sacaria dinheiro irreversível burlando tudo. Sem nenhum caller no frontend (superado por `depixTransaction`). **Fix:** mutations DESATIVADAS (lançam FORBIDDEN apontando pro fluxo correto) em vez de duplicar mal a cadeia de proteção num caminho morto.
- **financial.cancel** (`tenantProcedure`): cancelar conta a receber/pagar + parcelas. Inconsistente com `reverseInstallment` (que já é admin). **Fix:** gate `isTenantAdmin` (inline, mesmo padrão) + UI esconde "Cancelar Conta" e "estornar parcela" pra não-admin.
- **reward.approveAction / cancelAction** (`tenantProcedure`): creditam/revertem cashback (movimento financeiro). **Fix:** gate `isTenantAdmin`. (Sem UI ainda — hardening puro.)

### Descartados (verificado lendo o código)
- **catalog create/update/bulkAdjustPrice** "deveria ser admin" → **decisão de produto já documentada** no código (`deleteService` é admin; criar/editar é operacional, por design). Não mexer.
- **fiscal.authorize/cancel, nfe-import.processXml** "admin" → o dono decidiu manter **operacional** (operador pode emitir nota).

## Frente 3 — Config disponível vs consumida → este PR
Decisão do dono: **corrigir só os bugs reais**; órfãos de Recebimento já são roadmap rotulado.

- **🔴 NF-e ignorava defaultCfop/defaultNcm do tenant** (`fiscal.ts` authorize): item sem CFOP/NCM caía direto em `"5102"`/`"00000000"` (NCM inválido p/ SEFAZ), ignorando a config Fiscal que o lojista preenche. **Fix:** fallback `item > tenantFiscalSettings.defaultCfop/Ncm > constante`. Risco fiscal real.
- **Órfãos de Recebimento** (autoCloseTime, monthlySalesGoal, defaultDasRate/IcmsDiffRate, defaultPolicyDevice/NonDevice): confirmado 0 consumidores, MAS a própria tela **avisa "Em breve: ... ainda não são aplicados"** (`settings/receiving/page.tsx:85`). Não são órfãos enganosos — são **roadmap**. Deixados como feature futura (auto-close cron, dashboard de meta, políticas de taxa no cálculo de pagamento).
- **cfopForaEstado** (validator sem coluna no modelo) → menor; fica pra quando políticas interestaduais forem implementadas.
