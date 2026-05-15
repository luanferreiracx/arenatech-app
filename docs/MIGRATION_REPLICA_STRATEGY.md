# MIGRATION_REPLICA_STRATEGY.md

> **Norte do projeto a partir de hoje.** Substitui o plano "implementar fase a fase" para os módulos de domínio. As Fases 0-4 já concluídas continuam sendo a fundação — esta estratégia define o método de migração dos módulos de negócio em cima dessa fundação.

---

## O que mudou e por quê

### Histórico
Até a Fase 4, trabalhamos com plano genérico ("Fase 5 = Clientes/Catálogo/Configurações"). Cada fase tinha checklists do que implementar. Claude interpretava o Laravel "no voo", produzia código, descobríamos divergências depois.

### Problema identificado
Sem SPEC rigorosa do comportamento original, Claude inventa pequenas decisões a cada implementação. Resultado: divergências sutis, retrabalho, frustração.

### Nova estratégia (a partir de agora)
**Migração módulo-a-módulo com SPEC rigorosa antes de implementação.**

Cada módulo passa por 5 etapas:

1. **LEGACY_SCAN** — inventário superficial do módulo no Laravel
2. **SPEC** — especificação rigorosa, implementável, baseada no LEGACY_SCAN
3. **IMPLEMENT** — codificação contra a SPEC, com testes que validam cada item da SPEC
4. **VALIDATE** — comparação prática entre comportamento Laravel e Next.js
5. **CLOSE** — encerramento do módulo, documentação atualizada

---

## O que NÃO está sendo descartado

Tudo que foi feito nas Fases 0-4 **continua valendo**:

- Stack (Next.js 16 + tRPC v11 + Prisma 7 + NextAuth v5 + Postgres 16 + RLS)
- Schema base (Tenant, User, UserTenant)
- Auth multi-tenant funcional
- Design system Arena Tech (preto + dourado + prata)
- 15 componentes de domínio
- Layout shell + admin shell
- CI/CD com testes obrigatórios
- ADRs 0001-0004
- VPS_INVENTORY

Os 50+ testes existentes ficam. Os arquivos ficam. As decisões ficam.

**O que muda é o método para os módulos novos.**

---

## Sequência de migração revisada

### Etapa 0 — VARREDURA LEGACY DE TODOS OS MÓDULOS

**Antes** de especificar qualquer módulo, Claude faz uma varredura **superficial mas completa** de todos os 20 módulos do Laravel. Produz `docs/legacy/<modulo>.md` para cada um.

Não é SPEC implementável. É **inventário detalhado**:
- Quais rotas
- Quais controllers e seus métodos
- Quais models e suas relações
- Quais services existem
- Quais jobs/observers/events
- Quais integrações externas
- Quais migrations
- Quais views (telas)

Duração estimada: 6-10 horas Claude trabalhando.

### Etapa 1 — SPEC + IMPLEMENT por módulo

Ordem prioritária (decidida pelo dono):

1. **Ordens de Serviço (OS)** — coração do sistema
2. **PDV** — fluxo de venda
3. **Clientes**
4. **Catálogo** (serviços, aparelhos, laudos)
5. **Estoque**
6. **Caixa**
7. **Financeiro**
8. **Comissões**
9. **Fiscal (NF-e)**
10. **Operação** (entregadores, laboratórios, prestadores)
11. **Consulta IMEI**
12. **Comunicação** (WhatsApp, Chatwoot, VendaBot)
13. **Recompensas** (refeito do zero)
14. **Configurações** (tenant settings, integrações)
15. **Admin Central** (SaaS, gestão de tenants)

> Clientes/Catálogo/Estoque/Caixa vêm DEPOIS de OS/PDV por priorização. Mas serão referenciados via **stubs validados** baseados no LEGACY_SCAN durante implementação de OS/PDV.

### Etapa 2 — HARDENING + CUTOVER

Quando todos os módulos estão validados, executa hardening e cutover.

---

## Protocolo por módulo

### LEGACY_SCAN — `docs/legacy/<modulo>.md`

Inventário detalhado do módulo no Laravel. Estrutura:

```markdown
# Legacy: <Módulo>

## Rotas
Tabela: método, URI, controller@action, middleware, nome

## Controllers
Para cada controller: métodos com descrição, queries principais, side effects

## Models
Para cada model: tabela, colunas, relações, scopes, observers, accessors

## Services
Para cada service: métodos, propósito, dependências

## Jobs / Events / Listeners
Lista com gatilhos e ações

## Integrações externas
APIs usadas, endpoints, autenticação

## Migrations
Cronológica com efeito em colunas

## Views (telas)
Para cada view: campos, botões, fluxo

## Dependências cruzadas
Usa Model X do módulo Y; chama Service Z do módulo W
```

### SPEC — `docs/specs/<modulo>/SPEC.md`

Especificação rigorosa pós-LEGACY_SCAN. Estrutura:

```markdown
# SPEC: <Módulo>

## Visão geral (3 linhas)

## Telas
### Listagem / Detalhe / Criar / Editar
- Acesso (quem pode)
- Layout (descrição)
- Filtros
- Colunas
- Ações
- Comportamentos especiais

## Modelos de dados
Para cada entidade:
- Campos (nome, tipo, obrigatoriedade, default, validações)
- Relações
- Soft delete? RLS? Auditoria?

## Regras de negócio (numeradas)
1. Ao criar X, dispara Y
2. Status só pode mudar de A→B ou A→C
3. Cálculo de Z = fórmula

## Validações
- Campo X: regra Y
- Combinação de campos: regra Z

## Permissões
Tabela: papel × ação

## Integrações
- Chama módulo Y para Z
- Recebe webhook de A
- Dispara evento C

## Fluxos completos
Passo a passo de cada fluxo crítico

## Casos de erro
Comportamento quando algo falha

## Testes E2E obrigatórios
Lista de cenários a cobrir

## NÃO está no escopo (anti-escopo)
O que existe no Laravel mas NÃO será replicado
```

### IMPLEMENT

Claude implementa **estritamente** o que a SPEC pede. Testes E2E listados na SPEC viram código. Discrepâncias entre SPEC e implementação = bug.

Commits semânticos progressivos.

### VALIDATE

Você (dono) faz validação cruzada:
1. Roda operação no Laravel atual
2. Roda no Next.js novo
3. Compara: dados gerados, comportamento, telas, validações
4. Discrepância = bug, registra em `docs/specs/<modulo>/VALIDATION.md`

### CLOSE

Módulo encerrado quando:
- Implementação cumpre 100% da SPEC
- VALIDATION sem discrepâncias críticas
- Testes E2E verdes
- PROGRESS.md atualizado
- Notificação disparada

---

## Princípios operacionais

### 1. SPEC é contrato
Implementação NÃO acrescenta nada que não esteja na SPEC. NÃO omite nada que esteja. Anti-improvisação.

### 2. Anti-escopo é tão importante quanto escopo
Se o Laravel tem 50 features no módulo X mas vamos replicar 40, as 10 que NÃO vão ser replicadas precisam estar **listadas explicitamente no anti-escopo**. Senão Claude assume que precisa implementar.

### 3. Dependências cruzadas viram stubs validados
Se OS precisa de `Customer.findById()`, e Clientes ainda não foi implementado, Claude cria stub mínimo (modelo + dados de seed) baseado no LEGACY_SCAN de Clientes. Quando Clientes for implementado, stub vira código real, contrato preservado.

### 4. Toda decisão de tradução Laravel→Next vira ADR
Exemplo: "Observer Eloquent → trigger Postgres" vs "middleware Prisma" vs "event handler tRPC". Cada escolha desse tipo vira `docs/decisions/NNNN-<assunto>.md`.

### 5. Validação cruzada é não-negociável
Sem comparar comportamento real, "réplica perfeita" é wishful thinking.

### 6. Autonomia total foi liberada
Claude opera com `defaultMode: bypassPermissions` desde esta etapa. Decisão consciente do dono. Backup do código está no GitHub. Laravel atual em produção segue intocado (Claude tem permissão de leitura, não de escrita, em `/Users/luanferreira/Herd/intranetpdv`).

---

## Estado atual

- **Fases 0-4 concluídas** com testes verdes
- **Estratégia revisada** a partir deste documento
- **Próximo passo:** Etapa 0 (varredura legacy de todos os módulos)
- **Após Etapa 0:** SPEC + IMPLEMENT do módulo OS, depois PDV, depois sequência

---

## Mapa de prompts daqui pra frente

Para você executar sozinho, sem precisar me chamar a cada passo:

| Quando | Prompt a usar |
|---|---|
| Agora (Etapa 0) | **Prompt 1** abaixo neste pacote |
| Quando Etapa 0 terminar | **Prompt 2** (SPEC de OS) — me peça aqui no chat |
| Quando SPEC de OS estiver revisada | **Prompt 3** (IMPLEMENT OS) — me peça aqui no chat |
| Quando OS estiver validada | **Prompt 4** (SPEC + IMPLEMENT PDV em sequência) — me peça aqui no chat |
| Quando OS+PDV estiverem prontos | Sequência similar pros próximos módulos |

Eu te entrego o próximo prompt quando você me chamar com o resultado do anterior.
