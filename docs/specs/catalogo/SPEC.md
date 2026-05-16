# SPEC: Catálogo (Serviços + Aparelhos + Simulador)

> **Status:** aprovada (SPEC+IMPLEMENT consolidado, decisões D1-D8)
> **Base:** docs/legacy/catalogo.md + leitura direta Laravel (Servico, ServicoObservacao, AparelhoCatalogo, AparelhoCategoria, SimuladorParcelamentoService) + decisões do dono
> **Versão:** 1.0

---

## 1. Visão geral

Catálogo de serviços (tabela de preços da assistência técnica), catálogo de aparelhos (referência para chatbot Lia/atendimento), e simulador de parcelamento. O catálogo de serviços define combinações de tipo de serviço + modelo de aparelho + preço. O catálogo de aparelhos é uma entidade de marketing independente de Product (Estoque-A). O simulador usa InstallmentRate (Configurações) para calcular parcelas.

---

## 2. Glossário

| Termo | Definição |
|-------|-----------|
| **Service** | Combinação de tipo + modelo + preço (ex: Troca de Tela / iPhone 15 Pro / R$ 800) |
| **ServiceType** | Categoria de serviço (ex: Troca de Tela, Troca de Bateria). Refatoração do campo string `tipo_servico`. |
| **ServiceObservation** | Alerta exibido ao técnico ao criar OS para certos tipos/modelos |
| **CatalogDevice** | Aparelho de referência usado pelo chatbot Lia e atendimento (preço, disponibilidade) |
| **CatalogDeviceCategory** | Categoria dos aparelhos do catálogo (iPhone, Samsung, Acessórios) |
| **Simulador** | Tabela calculada de parcelas baseada em InstallmentRate |

---

## 3. Modelos de dados

### 3.1 ServiceType (novo — D5)

| Campo | Tipo Prisma | Nullable | Default | Origem Laravel | Notas |
|-------|-------------|----------|---------|----------------|-------|
| id | String @default(uuid()) @db.Uuid | NO | uuid() | — | PK |
| tenantId | String @db.Uuid | NO | — | RLS | |
| name | String | NO | — | extraído de `servicos.tipo_servico` (distinct) | Nome de exibição |
| slug | String | NO | — | gerado de name | Busca normalizada |
| active | Boolean | NO | true | — | |
| deletedAt | DateTime? | YES | — | — | Soft delete |
| createdAt | DateTime @default(now()) | NO | now() | — | |
| updatedAt | DateTime @updatedAt | NO | — | — | |

**Constraints:** `@@unique([tenantId, slug])` partial WHERE deletedAt IS NULL

---

### 3.2 Service (expandido)

| Campo | Tipo Prisma | Nullable | Default | Origem Laravel | Notas |
|-------|-------------|----------|---------|----------------|-------|
| id | String @default(uuid()) @db.Uuid | NO | uuid() | — | PK |
| tenantId | String @db.Uuid | NO | — | RLS | |
| serviceTypeId | String? @db.Uuid | YES | — | — | FK → ServiceType. Nullable durante migração. |
| serviceType | String? | YES | — | `servicos.tipo_servico` | Legacy string. Mantido para backward compat. |
| deviceModel | String? | YES | — | `servicos.modelo_aparelho` | String livre |
| name | String | NO | — | — | Já existe no schema atual |
| description | String? | YES | — | `servicos.descricao` | |
| basePrice | Decimal @db.Decimal(10,2) | NO | 0 | `servicos.valor` | |
| estimatedTime | String? | YES | — | — | Já existe |
| active | Boolean | NO | true | `servicos.ativo` | |
| deletedAt | DateTime? | YES | — | — | Soft delete |
| createdAt | DateTime @default(now()) | NO | now() | `criado_em` | |
| updatedAt | DateTime @updatedAt | NO | — | `atualizado_em` | |

**Relações:** `serviceTypeRef: ServiceType?` BelongsTo via serviceTypeId

---

### 3.3 ServiceObservation (já existe — expandir)

Schema atual já tem title, observation, serviceTypes (Json), deviceModels (Json), active. Manter como está — funcional.

---

### 3.4 CatalogDevice (novo — D6)

| Campo | Tipo Prisma | Nullable | Default | Origem Laravel | Notas |
|-------|-------------|----------|---------|----------------|-------|
| id | String @default(uuid()) @db.Uuid | NO | uuid() | — | PK |
| tenantId | String @db.Uuid | NO | — | RLS | |
| categoryId | String? @db.Uuid | YES | — | `aparelhos_catalogo.categoria` (via slug) | FK → CatalogDeviceCategory |
| name | String | NO | — | `aparelhos_catalogo.modelo` | Nome do aparelho |
| condition | String? | YES | — | `aparelhos_catalogo.condicao` | Novo/Seminovo/Usado |
| description | String? | YES | — | `aparelhos_catalogo.observacao` | |
| price | Decimal? @db.Decimal(10,2) | YES | — | `aparelhos_catalogo.preco` | Preço de referência |
| promotionalPrice | Decimal? @db.Decimal(10,2) | YES | — | — | |
| imageUrl | String? | YES | — | — | MinIO (padrão Estoque-A) |
| available | Boolean | NO | true | `aparelhos_catalogo.ativo` | |
| featured | Boolean | NO | false | — | Destaque na Lia |
| order | Int | NO | 0 | — | Ordem de exibição |
| priceUpdatedAt | DateTime? | YES | — | `aparelhos_catalogo.preco_atualizado_em` | |
| deletedAt | DateTime? | YES | — | — | |
| createdAt | DateTime @default(now()) | NO | now() | — | |
| updatedAt | DateTime @updatedAt | NO | — | — | |

**Constraints:** `@@index([tenantId, available])`, `@@index([tenantId, categoryId])`

---

### 3.5 CatalogDeviceCategory (novo)

| Campo | Tipo Prisma | Nullable | Default | Origem Laravel | Notas |
|-------|-------------|----------|---------|----------------|-------|
| id | String @default(uuid()) @db.Uuid | NO | uuid() | — | PK |
| tenantId | String @db.Uuid | NO | — | RLS | |
| name | String | NO | — | `aparelhos_categorias.nome` | |
| slug | String | NO | — | `aparelhos_categorias.slug` | |
| order | Int | NO | 0 | `aparelhos_categorias.ordem` | |
| deletedAt | DateTime? | YES | — | — | |
| createdAt | DateTime @default(now()) | NO | now() | — | |
| updatedAt | DateTime @updatedAt | NO | — | — | |

**Constraints:** `@@unique([tenantId, slug])` partial WHERE deletedAt IS NULL

---

## 4. Regras de negócio

| # | Regra | Fonte |
|---|-------|-------|
| RN-01 | Ao criar Service com ServiceType texto inexistente, sistema cria ServiceType automaticamente (slug gerado). | D5 |
| RN-02 | Duplicar tipo: cria novo ServiceType + copia todos Services com novo serviceTypeId. | legacy ServicoController@duplicarTipo |
| RN-03 | Renomear tipo: atualiza ServiceType.name + regenera slug. Todos Services associados mantêm FK. | legacy ServicoController@renomearTipo |
| RN-04 | Ajuste em massa: aplica fator multiplicativo sobre basePrice de Services filtrados. Resultado nunca < 0. | legacy ServicoController@ajusteMassa |
| RN-05 | Excluir tipo (soft): soft-deleta ServiceType. Services associados também soft-deletados em cascata. | legacy ServicoController@destroyTipo |
| RN-06 | ServiceObservation aplica-se a múltiplos tipos e/ou modelos. Array vazio = aplica a TODOS. | legacy ServicoObservacao.aplicavelPara() |
| RN-07 | CatalogDevice é independente de Product (Estoque-A). Entidades distintas. | D6 |
| RN-08 | Simulador calcula: `totalComJuros = valorBase * 100 / (100 - taxa)` (gross up). valorParcela = totalComJuros / numParcelas. | legacy SimuladorParcelamentoService.grossUp() |
| RN-09 | Se InstallmentRate não existe para (paymentMethodId, numParcelas), assume taxa 0% (sem juros). | legacy: pula parcela se taxa <= 0 |
| RN-10 | Simulador pula parcelas com taxa <= 0 (não exibe na tabela). | legacy: `if ($taxa <= 0) continue;` |
| RN-11 | CatalogDevice.priceUpdatedAt atualizado automaticamente quando price muda. | legacy `preco_atualizado_em` |

---

## 5. Permissões (D8)

| Ação | Operator | Manager | Owner |
|------|----------|---------|-------|
| Read (listar serviços, devices, simulador) | ✓ | ✓ | ✓ |
| Create/Update/Delete Service/Type | ✗ | ✓ | ✓ |
| Operações em massa (duplicar, renomear, ajuste) | ✗ | ✓ | ✓ |
| CRUD ServiceObservation | ✗ | ✓ | ✓ |
| CRUD CatalogDevice/Category | ✗ | ✓ | ✓ |
| Usar Simulador | ✓ | ✓ | ✓ |

---

## 6. Anti-escopo

| Item | Destino |
|------|---------|
| Telas e-commerce público (catalogo.arenatechpi.com.br) | Módulo futuro (D1) |
| Avaliações (avaliacoes, modelos, armazenamentos) | Estoque-C (D2) |
| ChecklistController / checklist independente | Anti-escopo permanente (D3) |
| Migração de dados existentes | Big Bang cutover (ADR 0025) |
| Frete, Checkout SMS, Carrinho público | Anti-escopo |

---

## 7. Testes obrigatórios

| # | Cenário |
|---|---------|
| T-01 | CRUD Service com ServiceType existente |
| T-02 | Criar Service com ServiceType inline (auto-cria) |
| T-03 | Duplicar tipo de serviço |
| T-04 | Renomear tipo |
| T-05 | Ajuste em massa (+10%) |
| T-06 | Excluir tipo com cascata |
| T-07 | ServiceObservation aplica-se a tipo + modelo específicos |
| T-08 | ServiceObservation com arrays vazios aplica a todos |
| T-09 | CRUD CatalogDevice com upload de imagem |
| T-10 | CRUD CatalogDeviceCategory |
| T-11 | Simulador calcula parcelas com gross up correto |
| T-12 | RBAC: operator não cria serviço |
| T-13 | RLS: catálogo tenant A não aparece em tenant B |
