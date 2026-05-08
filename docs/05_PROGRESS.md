# 05 — PROGRESS

> Este arquivo é a **memória viva** do projeto. Claude atualiza após cada checkpoint.
> Você consulta com `arena-progress` de qualquer lugar.

---

## Estado atual

**Fase atual:** Fase 0 — Bootstrap & infra local ✓ CONCLUÍDA
**Última atualização:** 2026-05-08
**Branch atual:** `main`
**Commits desde último deploy:** 1

---

## Fases

### ✓ Fase 0 — Bootstrap & infra local
- [x] Diagnóstico do ambiente
- [x] Docker Compose criado (postgres:16, redis:7, minio, mailhog)
- [x] Stack subindo — todos healthy (postgres, redis, minio, mailhog)
- [x] Mapeamento .env do Laravel → .env.example + .env.local
- [x] MIGRATION_NOTES.md com inventário do legado
- [x] Commit final

### ☐ Fase 1 — Esqueleto Next.js + tRPC + Prisma
- [ ] create-next-app
- [ ] TypeScript estrito
- [ ] ESLint + Prettier
- [ ] tRPC v11 estruturado
- [ ] Prisma 6 multi-file schema
- [ ] NextAuth v5 placeholder
- [ ] shadcn/ui inicializado
- [ ] Vitest + Playwright configurados
- [ ] Hello World tRPC
- [ ] CI passando
- [ ] Commit final

### ☐ Fase 2 — Schema base + RLS
- [ ] Schema Tenant + User + UserTenant
- [ ] Convenção de tenantId em todas tabelas
- [ ] Migration RLS aplicada
- [ ] Cliente Prisma com tenant scoping
- [ ] Roles app_user / app_admin
- [ ] Seed inicial
- [ ] Suite de testes RLS
- [ ] Commit final

### ☐ Fase 3 — Auth
- [ ] Provider Credentials (CPF + senha)
- [ ] JWT callbacks
- [ ] Resolução de tenant (subdomain/cookie)
- [ ] Middleware Edge
- [ ] Procedures protegidas
- [ ] Telas de login/logout/forgot/reset
- [ ] E2E auth
- [ ] Commit final

### ☐ Fase 4 — Design system + layout
- [ ] Tokens de tema (escuro default)
- [ ] Layout shell (sidebar/header/content)
- [ ] Componentes de domínio (data-table, forms, etc)
- [ ] Command palette
- [ ] Toast system
- [ ] Página /dev/components
- [ ] Commit final

### ☐ Fase 5 — Configurações + Catálogo + Clientes
- [ ] Configurações (6 submódulos)
- [ ] Catálogo (4 submódulos)
- [ ] Clientes (4 submódulos)
- [ ] PATTERNS.md documentado
- [ ] Testes verdes
- [ ] Commit final

### ☐ Fase 6 — Estoque + Caixa + Financeiro
- [ ] Estoque
- [ ] Caixa
- [ ] Financeiro
- [ ] Saques Depix
- [ ] Testes verdes
- [ ] Commit final

### ☐ Fase 7 — Ordens de Serviço (CRÍTICO)
- [ ] Schema OS + items + history
- [ ] Wizard de criação
- [ ] Mudança de status com regras
- [ ] Geração de PDF
- [ ] Integração Autentique
- [ ] Integração Depix/PixPay
- [ ] Envio WhatsApp (Evolution API)
- [ ] E2E completo
- [ ] Commit final

### ☐ Fase 8 — PDV
- [ ] Tela de venda
- [ ] Carrinho com cálculo
- [ ] Split payment
- [ ] Comissões
- [ ] PIX (Depix)
- [ ] E2E completo
- [ ] Commit final

### ☐ Fase 9 — Fiscal (paralelizável)
### ☐ Fase 10 — Comissões (paralelizável)
### ☐ Fase 11 — Operação (paralelizável)
### ☐ Fase 12 — Consulta IMEI (paralelizável)
### ☐ Fase 13 — Comunicação (paralelizável)
### ☐ Fase 14 — Recompensas (paralelizável, requer decisão prévia)
### ☐ Fase 15 — Admin Central (paralelizável)

### ☐ Fase 16 — Hardening
### ☐ Fase 17 — Cutover

---

## Decisões pendentes (Claude registra aqui)

> Quando Claude precisa de uma decisão de produto sua, registra aqui em vez de pausar a execução. Continua com o que dá pra fazer e aguarda sua resposta.

### 2026-05-08 — Catálogo público (catalogo.arenatechpi.com.br)
O sistema Laravel tem um e-commerce completo separado (`catalogo.arenatechpi.com.br`) com VendaBot via WhatsApp. Está no escopo da migração? Se sim, em qual fase? Atualmente não está mapeado em nenhuma fase do plano.

### 2026-05-08 — Provider de NF-e
O sistema Laravel tem tanto Nuvem Fiscal quanto Focus NFe implementados via interface. Qual vai ser o provider padrão no Next.js? O plano menciona Nuvem Fiscal.

### 2026-05-08 — Cloudinary → MinIO
O sistema atual usa Cloudinary para imagens de produtos. A migração vai reescrever para MinIO (que está na stack). Isso vai requerer migração dos assets existentes no cutover (Fase 17).

---

## Lacunas identificadas no sistema antigo

- IMEI API key hardcoded em `IMEICheckService.php` — mover para env var
- Cross-banco FKs (depix_transacoes → ordens_servico em outro banco) — resolver no Postgres unificado
- Timestamps inconsistentes (criado_em vs created_at) — padronizar na migração
- configuracoes_parcelamento com 36 colunas (juros_2x...juros_36x) — redesenhar como tabela relacional
- avaliacoes.valor como string em vez de decimal
- Checklist OS com 30 colunas individuais — migrar para JSONB
- Status da OS mistura estados de processo + financeiros — redesenhar
- sem soft delete padronizado (alguns usam ativo boolean, sem deleted_at)
- Depix cria VendaAvulsa para toda transação PIX — redesenhar como Payment genérico
- PagBank webhook sem credenciais (provavelmente abandonado)
- Corrida99Service sem credenciais (provavelmente não ativo)

---

## Decisões arquiteturais (ADRs resumidos)

### 2026-05-08 — Multi-tenancy via RLS em vez de banco separado
O Laravel usa `stancl/tenancy` com banco MySQL separado por tenant. O Next.js vai usar RLS no PostgreSQL com `tenant_id UUID` em todas as tabelas. Vantagens: backup único, migration única, sem overhead de conexão, impossível vazar dados cross-tenant.

### 2026-05-08 — WhatsApp via Evolution API (não Meta Cloud API diretamente)
O sistema atual usa Evolution API como wrapper sobre WhatsApp. Manter essa integração no Next.js — não migrar para Meta Cloud API diretamente pois a Evolution API já está funcionando e estável.

### 2026-05-08 — Payment via Depix/PixPay (não Pixpay.com.br diferente)
O "Pixpay" mencionado no plano de migração é na verdade o serviço "Depix" que usa a API `api.pixpay.space`. Não confundir com outros serviços de nome similar.

---

## Histórico de execução

### 2026-05-08 — Fase 0

- **Implementado:**
  - docker-compose.yml com postgres:16, redis:7, minio, mailhog
  - docker/postgres/init/01-extensions.sql (uuid-ossp, pg_trgm, unaccent)
  - Stack Docker subida e todos os 4 serviços healthy
  - .gitignore criado
  - .env.example com todos os campos mapeados do Laravel
  - .env.local com valores reais de dev (gitignored)
  - docs/MIGRATION_NOTES.md — inventário completo do sistema Laravel
- **Decisões:**
  - Docker context orbstack (OrbStack precisa estar rodando)
  - IMEI API key estava hardcoded no código Laravel — mapeado como lacuna de segurança
  - Evolution API é o provider de WhatsApp (não Meta Cloud API diretamente)
  - Depix = PixPay (api.pixpay.space) — não é o mesmo que outros serviços de PIX
  - Sistema tem catálogo e-commerce completo (catalogo.arenatechpi.com.br) não documentado no plano
- **Próximo:** Fase 1 — Esqueleto Next.js + tRPC + Prisma

---

## Bloqueios atuais

_(vazio)_

---

## Métricas

| Métrica | Valor |
|---|---|
| Linhas de código | 0 (infra apenas) |
| Cobertura de testes | — |
| Tabelas no schema | 0 (Prisma ainda não inicializado) |
| Procedures tRPC | 0 |
| Páginas | 0 |
| Componentes | 0 |
| Tabelas inventariadas do Laravel | ~55 tabelas tenant + ~20 tabelas central |
| Rotas inventariadas do Laravel | ~150+ rotas |
| Jobs identificados | 13 |
| Integrações externas | 11 (Autentique, Depix, Evolution/WhatsApp, Chatwoot, Nuvem Fiscal, Focus NFe, IMEI Check, Asaas, Anthropic, DirectD, MeuDANFE) |
