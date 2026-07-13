# Auditoria Geral do Sistema — 2026-07-13

> Auditoria profunda de TODO o sistema Arena Tech (pdvdepix), pedida pelo dono para
> encontrar gaps, código morto, funções incompletas, melhorias e tudo que deixe o
> sistema completo, profissional e robusto conforme os melhores padrões de mercado.
>
> Método: fan-out de agentes de auditoria especializados (protocolo de 4 rodadas das
> skills `audit-*`), cada um documentando em `findings/`. Depois consolidação num
> relatório-mestre priorizado (severidade × probabilidade × blast radius).

## Dimensão do sistema (superfície auditada)

- 38 routers tRPC, 61 services, 44 schemas Prisma, 166 migrations
- 118 páginas (App Router), 379 componentes
- 10 crons, 9 webhooks, 59 ADRs
- Testes: 148 unit, 32 integração, 10 e2e
- ~142.450 linhas de TS/TSX

## Domínios de auditoria (fan-out)

| # | Domínio | Skill base | Arquivo |
|---|---------|-----------|---------|
| A | Backend/arquitetura/concorrência (routers, services, transações) | audit-backend | findings/A_backend.md |
| B | Banco de dados (schema, índices, RLS, migrations, constraints) | audit-backend/database | findings/B_database.md |
| C | Segurança/auth/RBAC/webhooks/secrets/blast-radius | audit-security | findings/C_security.md |
| D | Frontend/UX/estado/acessibilidade/frame-integrity | audit-frontend | findings/D_frontend.md |
| E | Dinheiro/DePix/caixa/financeiro/comissão/fiscal (invariantes) | audit-backend | findings/E_money.md |
| F | Código morto / funções incompletas / procedures órfãs / TODOs | audit-backend | findings/F_deadcode.md |
| G | Observabilidade/erros/testes/CI/cobertura de gaps | audit-infra-platform | findings/G_observability.md |
| H | Integrações externas (Eulen, Nuvem Fiscal, WhatsApp, Chatwoot, etc.) | audit-backend | findings/H_integrations.md |

## Estado

- [x] Estrutura + mapa
- [ ] Fan-out dos 8 agentes
- [ ] Consolidação (RELATORIO_MESTRE.md)
- [ ] Correções seguras implementadas + PRs
- [ ] Achados de-dinheiro documentados para aprovação do dono

## Regras desta auditoria (dono dormindo — sem intervenção)

1. **Auditoria é o foco.** Documentar TUDO exaustivamente.
2. **Correções de dinheiro** (DePix, caixa, financeiro, comissão, billing) NÃO
   são mergeadas sem aprovação — ficam documentadas com o fix proposto.
3. **Correções seguras** (não-dinheiro, baixo risco, alto valor) podem ser
   implementadas em PRs com CI verde e auto-merge, conforme o workflow do projeto.
4. Cada achado: ID, severidade, evidência (arquivo:linha), impacto, fix proposto,
   confiança. Diferenciar fato/hipótese/inferência.
