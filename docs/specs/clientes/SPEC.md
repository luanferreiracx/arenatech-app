# SPEC: Clientes

> **Status:** aprovada pelo dono (QUESTIONS respondidas 2026-05-15)
> **Base:** docs/legacy/clientes.md + leitura direta do código Laravel + decisões do dono (PROMPT_2)
> **Versão:** 1.0

---

## 1. Visão geral

Módulo de gestão de clientes (pessoas físicas e jurídicas) e leads de interesse comercial. Centraliza dados cadastrais de todas as pessoas que interagem com a assistência técnica — tanto clientes formais (com CPF/CNPJ) quanto leads em prospecção (interesses). É referenciado por OS, PDV, Recompensas e Fiscal como a fonte de verdade de identidade do cliente.

---

## 2. Glossário

| Termo | Definição |
|-------|-----------|
| **Customer** (Cliente) | Pessoa física (PF) ou jurídica (PJ) com cadastro formal no sistema. Identificada por CPF ou CNPJ. |
| **Interest** (Interesse/Lead) | Registro de prospecção comercial. Entidade autônoma com dados de contato próprios (NÃO é FK para Customer). Pode ser convertido em Customer futuramente. |
| **Interaction** (Interação) | Registro de contato realizado com um Interest. Tipos: ligação, WhatsApp, em loja. |
| **Cashback Balance** (Saldo de recompensa) | Saldo de cashback acumulado pelo cliente via módulo Recompensas. Lido como propriedade computed — especificado na SPEC de Recompensas. |
| **Soft delete** | Exclusão lógica via campo `deletedAt`. Registro permanece no banco mas é filtrado das listagens. |

---

## 3. Modelos de dados

### 3.1 Customer

| Campo | Tipo Prisma | Nullable | Default | Validação Zod | Origem | Notas |
|-------|-------------|----------|---------|---------------|--------|-------|
| id | String @default(uuid()) @db.Uuid | NO | uuid() | — | padrão CLAUDE.md | PK |
| tenantId | String @db.Uuid | NO | — | — | padrão RLS | FK → Tenant |
| type | CustomerType (enum) | NO | PF | z.enum(['PF','PJ']) | mudança#1 | Discriminador PF/PJ |
| cpf | String? | YES | — | validateCPF (dígito verificador) | legacy `clientes.cpf` | Obrigatório se type=PF e não é lead (ver regra RN-2). Armazenado só dígitos (11 chars). |
| cnpj | String? | YES | — | validateCNPJ (dígito verificador) | mudança#1 | Obrigatório se type=PJ e não é lead. Armazenado só dígitos (14 chars). |
| name | String | NO | — | z.string().min(2).max(255) | legacy `nome_completo` | Nome completo (PF) ou razão social (PJ). |
| tradeName | String? | YES | — | z.string().max(255) | mudança#1 | Nome fantasia. Apenas PJ. |
| birthDate | DateTime? @db.Date | YES | — | z.date() ou null | legacy `data_nascimento` | Apenas PF. |
| phone | String | NO | — | z.string().min(10).max(20) | legacy `celular_whatsapp` | Telefone principal / WhatsApp. Required (legacy: StoreClienteRequest). |
| phoneSecondary | String? | YES | — | z.string().max(20) | legacy `celular_alternativo` | |
| email | String? | YES | — | z.string().email().max(255) | legacy `email` | |
| zipCode | String? | YES | — | z.string().max(9) | legacy `cep` | CEP sem formatação |
| street | String? | YES | — | z.string().max(255) | legacy `logradouro` | |
| streetNumber | String? | YES | — | z.string().max(20) | legacy `numero` | |
| complement | String? | YES | — | z.string().max(100) | legacy `complemento` | |
| neighborhood | String? | YES | — | z.string().max(100) | legacy `bairro` | |
| city | String? | YES | — | z.string().max(100) | legacy `cidade` | |
| state | String? | YES | — | z.string().length(2) | legacy `estado` | UF 2 chars |
| notes | String? @db.Text | YES | — | z.string() | legacy `observacoes` | |
| createdById | String? @db.Uuid | YES | — | — | legacy `usuario_cadastro_id` | FK → User (quem cadastrou) |
| deletedAt | DateTime? | YES | — | — | mudança#2 | Soft delete (substitui `ativo` boolean) |
| createdAt | DateTime @default(now()) | NO | now() | — | mudança#3 | Prisma padrão |
| updatedAt | DateTime @updatedAt | NO | — | — | mudança#3 | Prisma padrão |

**Índices:**
- Partial unique index `(tenantId, cpf) WHERE deletedAt IS NULL` — CPF único entre clientes ativos. Permite reuso após soft delete. // Q1: decisão B confirmada
- Partial unique index `(tenantId, cnpj) WHERE deletedAt IS NULL` — CNPJ idem
- `@@index([tenantId, name])` — busca por nome
- `@@index([tenantId, phone])` — busca por telefone
- `@@index([tenantId, deletedAt])` — filtro soft delete

**Relações:**
| Relação | Tipo | Origem |
|---------|------|--------|
| tenant | belongsTo Tenant | padrão RLS |
| createdBy | belongsTo User? | legacy `usuario_cadastro_id` |
| serviceOrders | hasMany ServiceOrder | legacy `ordensServico()` |
| sales | hasMany Sale | legacy (PDV via `cliente_id`) |
| rewardBalance | hasOne RewardBalance? | legacy `recompensaSaldo()` — stub, spec Recompensas |
| rewardActions | hasMany RewardAction | legacy `recompensasAcoes()` — stub |
| rewardMovements | hasMany RewardMovement | legacy `recompensasMovimentacoes()` — stub |

**Computed (tRPC output, não coluna):**
- `cashbackBalance: number` — Lido de RewardBalance.availableBalance. Default 0 se não existe. // origem: realidade #10

**Soft delete?** Sim, via `deletedAt: DateTime?` // origem: mudança#2
**RLS por tenant?** Sim // origem: padrão CLAUDE.md
**Auditoria de mudanças?** Não nesta versão — simplifica escopo. // ver ASSUMPTIONS A2

### 3.2 Interest

> **DESCOBERTA IMPORTANTE:** No Laravel, `interesses_clientes` é tabela autônoma (NÃO tem FK para `clientes`). Tem campos próprios: `nome_cliente`, `telefone`, `cpf`, `email`. É um lead independente, não uma extensão de Customer.

| Campo | Tipo Prisma | Nullable | Default | Validação Zod | Origem | Notas |
|-------|-------------|----------|---------|---------------|--------|-------|
| id | String @default(uuid()) @db.Uuid | NO | uuid() | — | padrão | PK |
| tenantId | String @db.Uuid | NO | — | — | padrão RLS | FK → Tenant |
| customerName | String | NO | — | z.string().min(1).max(150) | legacy `nome_cliente` | Nome do lead |
| phone | String? | YES | — | z.string().max(20) | legacy `telefone` | |
| cpf | String? | YES | — | z.string().max(14) | legacy `cpf` | Sem validação de dígito (lead informal) |
| email | String? | YES | — | z.string().email().max(255) | legacy `email` | |
| type | InterestType (enum) | NO | PURCHASE | z.enum | legacy `tipo_interesse` | |
| desiredModel | String? | YES | — | z.string().max(200) | legacy `modelo_desejado` | |
| notes | String? @db.Text | YES | — | z.string() | legacy `observacoes` | |
| status | InterestStatus (enum) | NO | WAITING | z.enum | legacy `status` | |
| createdById | String? @db.Uuid | YES | — | — | legacy `usuario_cadastro_id` | FK → User |
| createdAt | DateTime @default(now()) | NO | now() | — | | |
| updatedAt | DateTime @updatedAt | NO | — | — | | |

**Relações:**
- `tenant` belongsTo Tenant
- `createdBy` belongsTo User?
- `interactions` hasMany InterestInteraction

**Índices:**
- `@@index([tenantId, status])`
- `@@index([tenantId, type])`
- `@@index([tenantId, customerName])`

**Soft delete?** Não — hard delete (alinhado com legacy: `interesse->delete()`)
**RLS por tenant?** Sim

### 3.3 InterestInteraction

| Campo | Tipo Prisma | Nullable | Default | Validação Zod | Origem | Notas |
|-------|-------------|----------|---------|---------------|--------|-------|
| id | String @default(uuid()) @db.Uuid | NO | uuid() | — | padrão | PK |
| tenantId | String @db.Uuid | NO | — | — | padrão RLS | |
| interestId | String @db.Uuid | NO | — | — | legacy `interesse_id` | FK → Interest, cascadeOnDelete |
| userId | String? @db.Uuid | YES | — | — | legacy `usuario_id` | FK → User |
| type | InteractionType (enum) | NO | — | z.enum | realidade#9 + legacy | |
| description | String @db.Text | NO | — | z.string().min(1) | legacy `descricao` | |
| occurredAt | DateTime @default(now()) | NO | now() | — | legacy `data_interacao` | |

**Relações:**
- `tenant` belongsTo Tenant
- `interest` belongsTo Interest (onDelete: Cascade)
- `user` belongsTo User?

**Soft delete?** Não (hard delete, alinhado com legacy)
**RLS por tenant?** Sim

### 3.4 Enums

```prisma
enum CustomerType {
  PF   // Pessoa Física
  PJ   // Pessoa Jurídica
}

enum InterestType {
  PURCHASE  // Compra — legacy "Compra"
  SALE      // Venda — legacy "Venda"
  TRADE     // Troca — legacy "Troca"
  REPAIR    // Reparo — legacy "Reparo"
}

enum InterestStatus {
  WAITING    // Em espera — legacy "Em espera"
  CONTACTED  // Contatado — legacy "Contatado"
  COMPLETED  // Finalizado — legacy "Finalizado"
  CANCELLED  // Cancelado — legacy "Cancelado"
}

enum InteractionType {
  PHONE      // Ligação — realidade#9 "ligacao"
  WHATSAPP   // WhatsApp — realidade#9 "whatsapp"
  IN_STORE   // Em loja — realidade#9 "em_loja"
}
```

> **Nota sobre InteractionType:** O legacy tinha 5 tipos no controller (`Telefone`, `WhatsApp`, `E-mail`, `Presencial`, `Outro`) + tipos auto-gerados (`Cancelamento`, `Finalização`). O dono reduziu para 3 (realidade#9). Mudanças automáticas de status NÃO geram interação separada — ficam implícitas no campo `status` do Interest.

---

## 4. Telas

### 4.1 Listagem de Clientes — `/customers`

**Acesso:** read (todos os papéis autenticados do tenant) // origem: realidade#11

**Fonte:** legacy ClienteController@index + index.blade.php

**Filtros:**
| Filtro | Tipo | Comportamento | Origem |
|--------|------|---------------|--------|
| Busca textual | input text | Busca por nome, CPF/CNPJ e telefone. Remove pontuação antes de comparar (ex: "123.456" busca "12345678900"). | legacy scope `busca` |
| Incluir excluídos | toggle | Default OFF. Quando ON, inclui registros com `deletedAt` preenchido. | mudança#2 (substitui filtro ativo/inativo) |

**Colunas da tabela:**
| Coluna | Formato | Origem |
|--------|---------|--------|
| Nome | String | legacy `nome_completo` |
| CPF/CNPJ | Formatado (XXX.XXX.XXX-XX ou XX.XXX.XXX/XXXX-XX) | legacy `cpf_formatado` accessor |
| Telefone | Formatado ((XX) XXXXX-XXXX) | legacy `telefone_formatado` accessor |
| Email | String | legacy `email` |
| Tipo | Badge PF/PJ | mudança#1 |
| OS | Contagem de OS vinculadas | legacy `withCount('ordensServico')` |
| Status | Badge (ativo/excluído) | mudança#2 |

**Ações por linha:**
- Visualizar (→ detalhe)
- Editar (→ form edição)
- Excluir (soft delete) — apenas manager, owner // origem: realidade#11
- Restaurar (se excluído) — apenas manager, owner // origem: realidade#11

**Paginação:** server-side, 20 por página (legacy `config("pagination.default")`)

**Endpoint JSON (AJAX):** Quando requisição é `format=json` ou `wantsJson`, retorna JSON com limit 20. Usado por selects em OS e PDV para buscar clientes. // origem: legacy ClienteController@index linhas 61-67

### 4.2 Detalhe do Cliente — `/customers/[id]`

**Acesso:** read

**Fonte:** legacy ClienteController@show + show.blade.php

**Seções:**
1. **Dados pessoais** — Nome, CPF/CNPJ, tipo PF/PJ, data nascimento, telefones, email
2. **Endereço** — CEP, logradouro, número, complemento, bairro, cidade, estado
3. **Tabs:**
   - **OS do cliente** — Últimas 10 OS ordenadas por data_entrada desc. Colunas: número, status, equipamento, valor, data. // origem: legacy `show()` eager load
   - **Interesses/Leads** — Não vinculado diretamente (Interest é autônomo, sem FK). Tab pode buscar por telefone/CPF do cliente como heurística, ou ser removida. // Q3: sem vínculo
   - **Recompensas/Cashback** — Saldo disponível, ações recentes, histórico de movimentações. // origem: legacy relações recompensa. Dados lidos do módulo Recompensas (stub).

**Ações:**
- Editar cliente
- Excluir (soft delete)
- Restaurar (se excluído)

### 4.3 Criar Cliente — `/customers/new`

**Acesso:** create (operator, manager, owner) // origem: realidade#11

**Fonte:** legacy create.blade.php + StoreClienteRequest

**Campos do form:**
| Campo | Label PT | Required | Tipo input | Origem |
|-------|----------|----------|------------|--------|
| type | Tipo de pessoa | Sim | Radio PF/PJ | mudança#1 |
| name | Nome completo / Razão social | Sim | text | legacy `nome_completo` |
| tradeName | Nome fantasia | Não (só PJ) | text | mudança#1 |
| cpf | CPF | Sim se PF | CpfInput (máscara) | legacy `cpf` |
| cnpj | CNPJ | Sim se PJ | CnpjInput (máscara) | mudança#1 |
| birthDate | Data de nascimento | Não (só PF) | DatePicker | legacy `data_nascimento` |
| phone | WhatsApp | Sim | PhoneInput (máscara) | legacy `celular_whatsapp` |
| phoneSecondary | Telefone alternativo | Não | PhoneInput | legacy `celular_alternativo` |
| email | E-mail | Não | email | legacy |
| zipCode | CEP | Não | text | legacy `cep` |
| street | Logradouro | Não | text | legacy |
| streetNumber | Número | Não | text | legacy |
| complement | Complemento | Não | text | legacy |
| neighborhood | Bairro | Não | text | legacy |
| city | Cidade | Não | text | legacy |
| state | Estado | Não | select UF | legacy |
| notes | Observações | Não | textarea | legacy |

**SEM botão "Consultar CPF/CNPJ"** // origem: realidade#6 (anti-escopo DirectD)
**COM auto-fill de endereço por CEP (ViaCEP)** // origem: decisão revisada do dono (ver RN-16)

**Resposta AJAX:** Se requisição é JSON/AJAX, retorna dados do cliente criado (usado por OS/PDV para cadastro rápido inline). // origem: legacy store() linhas 138-153

### 4.4 Editar Cliente — `/customers/[id]/edit`

**Acesso:** update (operator, manager, owner)

Similar ao criar. Campos pré-preenchidos. CPF/CNPJ validado com `unique` ignorando o próprio registro. // origem: legacy UpdateClienteRequest

### 4.5 Listagem de Interesses — `/interests`

**Acesso:** read

**Fonte:** legacy InteresseController@index

**Filtros:**
| Filtro | Tipo | Origem |
|--------|------|--------|
| Nome | input text (LIKE) | legacy `filtroNome` |
| Telefone | input text (LIKE) | legacy `filtroTelefone` |
| Modelo desejado | input text (LIKE) | legacy `filtroModelo` |
| Status | select (WAITING/CONTACTED/COMPLETED/CANCELLED) | legacy `filtroStatus` |
| Tipo | select (PURCHASE/SALE/TRADE/REPAIR) | legacy `filtroTipo` |

**Cards de estatísticas:**
| Card | Query | Origem |
|------|-------|--------|
| Total | count(*) | legacy `stats.total` |
| Em espera | count(status=WAITING) | legacy `stats.novos` |
| Contatados | count(status=CONTACTED) | legacy `stats.contatados` |
| Finalizados | count(status=COMPLETED) | legacy `stats.finalizados` |
| Cancelados | count(status=CANCELLED) | legacy `stats.cancelados` |

**Colunas:**
| Coluna | Formato | Origem |
|--------|---------|--------|
| Nome | String | legacy `nome_cliente` |
| Telefone | String | legacy `telefone` |
| Tipo | Badge colorido | legacy `tipo_interesse` com `tipoCor` accessor |
| Modelo | String | legacy `modelo_desejado` |
| Status | Badge colorido | legacy `status` com `statusCor` accessor |
| Data | dd/mm/yyyy HH:mm | legacy `criado_em` |

**Ações por linha:**
- Ver detalhes (abre painel lateral ou modal com interações)
- Mudar status
- Adicionar interação
- Enviar WhatsApp (individual)

**Detalhe inline (ver=ID):** Ao clicar, mostra painel com dados do interest + lista de interações ordenadas por data desc. // origem: legacy `verInteresseId` + AJAX

**Paginação:** server-side, 20 por página // origem: legacy `$porPagina = 20`

### 4.6 Criar Interesse — modal/inline na listagem

**Acesso:** create

**Campos:**
| Campo | Label PT | Required | Validação | Origem |
|-------|----------|----------|-----------|--------|
| customerName | Nome do cliente | Sim | max:100 | legacy |
| phone | Telefone | Sim | max:20 | legacy |
| cpf | CPF | Não | max:14 | legacy |
| email | E-mail | Não | email, max:255 | legacy |
| type | Tipo de interesse | Sim | enum InterestType | legacy `tipo_interesse` |
| desiredModel | Modelo desejado | Sim | max:200 | legacy `modelo_desejado` |
| notes | Observações | Não | text | legacy |

Status inicial: WAITING // origem: legacy `'status' => 'Em espera'`

---

## 5. Regras de negócio

| # | Regra | Origem |
|---|-------|--------|
| RN-1 | CPF é único por tenant entre clientes **não-excluídos** (partial unique index `WHERE deletedAt IS NULL`). CNPJ idem. Permite reuso de CPF/CNPJ após soft delete. Verificação em create e update. | legacy StoreClienteRequest `unique:clientes,cpf` + Q1 decisão B |
| RN-2 | Cliente type=PF DEVE ter CPF preenchido. Cliente type=PJ DEVE ter CNPJ preenchido. Exceção: se `customerId` em um Interest aponta para este Customer e ele ainda não tem documento formal, CPF/CNPJ pode ser null (lead convertido parcialmente). | realidade#1 |
| RN-3 | CPF validado por dígito verificador algoritmicamente. CPFs all-same-digits (000.000.000-00 etc.) são inválidos. CNPJ idem. | realidade#4 |
| RN-4 | CPF armazenado apenas dígitos (11 chars). Formatação é responsabilidade da UI/accessor. | legacy controller `preg_replace('/[^0-9]/', '', $validated['cpf'])` |
| RN-5 | CNPJ armazenado apenas dígitos (14 chars). Idem. | mudança#1, mesma lógica |
| RN-6 | Busca textual remove pontuação antes de comparar. "123.456" encontra CPF "12345678900". | legacy scope `busca` com `REPLACE` |
| RN-7 | Soft delete via `deletedAt`. Listagem default filtra `deletedAt IS NULL`. | mudança#2 |
| RN-8 | Ao criar interesse, status inicial é WAITING. | legacy InteresseController@store |
| RN-9 | Ao adicionar primeira interação a um interesse com status WAITING, status muda automaticamente para CONTACTED. | legacy addInteracao: `if ($interesse->status === 'Em espera') { $interesse->update(['status' => 'Contatado']); }` |
| RN-10 | Ao enviar WhatsApp em lote, status de interesses WAITING muda para CONTACTED. | legacy enviarLote: `if ($interesse->status === 'Em espera') { $interesse->update(['status' => 'Contatado']); }` |
| RN-11 | Envio em lote: máximo 5 destinatários por vez. | legacy enviarLote: `'ids' => 'required|array|min:1|max:5'` |
| RN-12 | Envio em lote cria InterestInteraction tipo WHATSAPP automaticamente para cada envio bem-sucedido. | legacy enviarLote |
| RN-13 | Exclusão de interesse: hard delete com cascata de interações. Apenas owner (admin no legacy). | legacy destroy: `$interesse->interacoes()->delete(); $interesse->delete()` |
| RN-14 | Exclusão de interação: apenas o criador ou admin/owner pode excluir. | legacy deleteInteracao: `$this->getUser()->role !== 'admin' && $interacao->usuario_id !== $this->getUser()->id` |
| RN-15 | Cliente com OS vinculadas NÃO pode ser hard-deleted (apenas soft delete). | implícito: FK constraints de ServiceOrder.customerId |
| RN-16 | Auto-preenchimento de endereço por CEP: ao digitar CEP de 8 dígitos no form, sistema consulta API ViaCEP. Se válido, preenche logradouro, bairro, cidade, estado automaticamente. Campos preenchidos ficam editáveis. Se ViaCEP retornar erro ou CEP inválido, mostra "CEP não encontrado, preencha manualmente" e mantém form editável. | decisão revisada do dono |

---

## 6. Permissões

// origem: realidade#11

| Ação | operator | manager | owner | Notas |
|------|----------|---------|-------|-------|
| Listar clientes | ✓ | ✓ | ✓ | |
| Ver detalhe | ✓ | ✓ | ✓ | |
| Criar cliente | ✓ | ✓ | ✓ | |
| Editar cliente | ✓ | ✓ | ✓ | |
| Soft delete | ✗ | ✓ | ✓ | |
| Restaurar | ✗ | ✓ | ✓ | |
| Hard delete | ✗ | ✗ | ✗ | Bloqueado (só via admin operacional) |
| Listar interesses | ✓ | ✓ | ✓ | |
| Criar interesse | ✓ | ✓ | ✓ | |
| Mudar status interesse | ✓ | ✓ | ✓ | |
| Adicionar interação | ✓ | ✓ | ✓ | |
| Excluir interação | ✓* | ✓ | ✓ | *só a própria |
| Excluir interesse | ✗ | ✓ | ✓ | Hard delete (legacy: apenas admin) |
| Enviar WhatsApp lote | ✓ | ✓ | ✓ | |

---

## 7. Validações

### Customer

| Campo | Regra | Origem |
|-------|-------|--------|
| name | required, min:2, max:255 | legacy StoreClienteRequest |
| cpf | required se type=PF (exceto lead), unique por tenant (excluindo deletedAt!=null), dígito verificador | legacy + realidade#4 |
| cnpj | required se type=PJ (exceto lead), unique por tenant, dígito verificador | mudança#1 + realidade#4 |
| phone | required, min:10, max:20 | legacy StoreClienteRequest `celular_whatsapp required` |
| email | email format, max:255 | legacy |
| state | exactly 2 chars, uppercase | legacy `estado max:2` |
| birthDate | date, não futuro | legacy `date_format:d/m/Y` |

### Cross-campo
- `cpf` e `cnpj` são mutuamente exclusivos: PF preenche cpf, PJ preenche cnpj. Ambos null apenas em lead parcialmente convertido. // origem: realidade#1
- `tradeName` só aceito quando type=PJ. // origem: mudança#1
- `birthDate` só aceito quando type=PF. // origem: lógica de negócio

### Interest

| Campo | Regra | Origem |
|-------|-------|--------|
| customerName | required, max:100 | legacy |
| phone | required, max:20 | legacy `telefone required` |
| type | required, enum InterestType | legacy `required|in:Compra,Venda,Troca,Reparo` |
| desiredModel | required, max:200 | legacy `modelo_desejado required` |
| status | enum InterestStatus | legacy `in:Em espera,Contatado,Finalizado,Cancelado` |

### InterestInteraction

| Campo | Regra | Origem |
|-------|-------|--------|
| type | required, enum InteractionType | realidade#9 |
| description | required, min:1 | legacy `descricao required` |

---

## 8. Integrações

### ViaCEP (auto-preenchimento de endereço)
// origem: decisão revisada do dono (ViaCEP reincorporado — era anti-escopo, revertido)

- **Endpoint:** `GET https://viacep.com.br/ws/{cep}/json/`
- **Trigger:** ao digitar CEP de 8 dígitos no form de cliente (debounce 500ms)
- **Sucesso:** preenche logradouro, bairro, cidade, estado automaticamente. Campos ficam editáveis.
- **Falha (CEP inválido ou ViaCEP indisponível):** mostra mensagem inline "CEP não encontrado, preencha manualmente". Form continua editável.
- **Timeout:** 5 segundos
- **Sem retry agressivo:** 1 tentativa; se falhar, preenchimento manual.
- **Degradação graciosa:** ViaCEP é serviço externo gratuito sem SLA. Falha nunca bloqueia o form.

**Contrato com módulo Comunicação (WhatsApp):**
O envio em lote para interesses chama o serviço de comunicação. Contrato:

```typescript
// Usado por Interest.sendBatch
interface CommunicationBatchInput {
  tenantId: string;
  recipients: {
    phone: string;        // formato 55XXXXXXXXXXX
    variables: {
      name: string;       // nome do lead
      model: string;      // modelo desejado
      [key: string]: string;
    };
  }[];
  message: string;        // mensagem com placeholders {nome}, {modelo}
}
```
// origem: legacy enviarLote usando MetaWhatsAppService.enviarComFallbackTemplate

**Contrato com módulo Recompensas (leitura):**

```typescript
interface CashbackBalance {
  customerId: string;
  available: number;   // centavos
  pending: number;     // centavos
  lifetime: number;    // centavos — total creditado all-time
}
```
// origem: realidade#10

---

## 9. Fluxos completos

### Fluxo 1: Cadastro manual de cliente PF

1. Usuário acessa `/customers/new`
2. Seleciona tipo = PF
3. Preenche: nome, CPF, telefone (obrigatórios), demais opcionais
4. Submit → validação Zod client-side (CPF formato + dígito verificador)
5. tRPC `customer.create` → validação server-side:
   a. Valida CPF algoritmicamente
   b. Verifica unicidade CPF no tenant (excluindo soft-deleted)
   c. Limpa formatação do CPF (só dígitos)
   d. Registra `createdById` do usuário autenticado
6. Retorna cliente criado → redirect para detalhe
7. Se chamado via AJAX (OS/PDV), retorna JSON com dados resumidos

// origem: legacy ClienteController@store

### Fluxo 2: Cadastro manual de cliente PJ

1-4. Mesmo fluxo, mas: tipo=PJ, preenche CNPJ (em vez de CPF), pode preencher tradeName
5. Validação: CNPJ algoritmicamente, unicidade, sem birthDate
6-7. Igual

// origem: mudança#1

### Fluxo 3: Edição

1. Usuário acessa `/customers/[id]/edit`
2. Form pré-preenchido com dados atuais
3. Submit → validação com unique ignorando próprio ID
4. tRPC `customer.update` → atualiza registro

// origem: legacy ClienteController@update

### Fluxo 4: Exclusão (soft) e restauração

**Excluir:**
1. Ação "Excluir" na listagem ou detalhe (apenas manager/owner)
2. ConfirmDialog: "Deseja desativar o cliente {nome}?"
3. tRPC `customer.delete` → `deletedAt = now()`
4. Cliente desaparece da listagem default

**Restaurar:**
1. Na listagem com toggle "Incluir excluídos" ativado
2. Ação "Restaurar" (apenas manager/owner)
3. tRPC `customer.restore` → `deletedAt = null`

// origem: mudança#2. Legacy usava `ativo=false`.

### Fluxo 5: Cadastro de interesse (lead)

1. Usuário acessa `/interests` e clica "Novo Interesse"
2. Preenche: nome, telefone (obrigatórios), tipo, modelo desejado (obrigatórios), cpf/email/notas (opcionais)
3. Submit → tRPC `interest.create` → status = WAITING
4. Redirect para listagem com painel do interesse aberto

// origem: legacy InteresseController@store

### Fluxo 6: Adição de interação a um interesse

1. No painel de detalhe do interesse, clica "Nova Interação"
2. Seleciona tipo (PHONE/WHATSAPP/IN_STORE), preenche descrição
3. Submit → tRPC `interest.addInteraction`
4. Se status era WAITING, muda automaticamente para CONTACTED (regra RN-9)
5. Interação aparece no histórico ordenada por data desc

// origem: legacy InteresseController@addInteracao

### Fluxo 7: Envio em lote de WhatsApp

1. Usuário seleciona até 5 interesses na listagem (checkboxes)
2. Clica "Enviar WhatsApp" → modal com campo de mensagem (suporta placeholders `{nome}`, `{modelo}`)
3. Submit → tRPC `interest.sendBatch`
4. Para cada interesse selecionado:
   a. Substitui placeholders na mensagem
   b. Chama módulo Comunicação (stub CommunicationBatchInput)
   c. Se sucesso: cria InterestInteraction tipo WHATSAPP, muda status WAITING→CONTACTED
   d. Se erro: conta como falha
5. Retorna JSON: `{ sent: number, errors: number }`

// origem: legacy InteresseController@enviarLote

---

## 10. Casos de erro

| Cenário | Comportamento | Mensagem | Origem |
|---------|---------------|----------|--------|
| CPF duplicado no tenant | Bloqueia criação/edição | "Já existe cliente com este CPF" | legacy StoreClienteRequest `cpf.unique` |
| CNPJ duplicado no tenant | Bloqueia | "Já existe cliente com este CNPJ" | mudança#1 |
| CPF inválido (dígito) | Bloqueia | "CPF inválido" | realidade#4 |
| CNPJ inválido (dígito) | Bloqueia | "CNPJ inválido" | realidade#4 |
| CPF vazio para PF | Bloqueia | "CPF é obrigatório para pessoa física" | realidade#1 |
| CNPJ vazio para PJ | Bloqueia | "CNPJ é obrigatório para pessoa jurídica" | realidade#1 |
| Nome vazio | Bloqueia | "O nome do cliente é obrigatório" | legacy |
| Telefone vazio | Bloqueia | "O celular/WhatsApp é obrigatório" | legacy |
| Email inválido | Bloqueia | "E-mail inválido" | legacy |
| Envio lote > 5 | Bloqueia | "Máximo 5 destinatários por envio" | legacy |
| Envio lote sem mensagem | Bloqueia | "Mensagem é obrigatória (mínimo 10 caracteres)" | legacy |
| Excluir interação sem permissão | Bloqueia | "Você não tem permissão para excluir esta interação" | legacy |
| Excluir interesse sem permissão | Bloqueia | "Apenas gerentes e proprietários podem excluir interesses" | legacy (adaptado) |

---

## 11. Testes E2E obrigatórios

| # | Cenário | Regra |
|---|---------|-------|
| T-1 | Criar cliente PF com CPF válido → sucesso | RN-2, RN-3 |
| T-2 | Criar cliente PF com CPF inválido (dígito) → erro | RN-3 |
| T-3 | Criar cliente PF com CPF all-same-digits → erro | RN-3 |
| T-4 | Criar cliente PJ com CNPJ válido → sucesso | RN-2, mudança#1 |
| T-5 | Criar cliente PJ sem CNPJ → erro | RN-2 |
| T-6 | Tentar criar com CPF duplicado no tenant → erro | RN-1 |
| T-7 | Criar com CPF que existe em outro tenant → sucesso (RLS) | RN-1, RLS |
| T-8 | Tenant A não vê clientes de Tenant B | RLS |
| T-9 | Soft delete: cliente desaparece da listagem default | RN-7 |
| T-10 | Restauração de cliente excluído | RN-7 |
| T-11 | Busca por CPF formatado e CPF limpo retorna mesmo cliente | RN-6 |
| T-12 | Busca por nome parcial retorna resultados | RN-6 |
| T-13 | Operator não consegue deletar (permissão) | realidade#11 |
| T-14 | Manager consegue deletar e restaurar | realidade#11 |
| T-15 | Criar interesse → status WAITING | RN-8 |
| T-16 | Adicionar interação a interesse WAITING → status muda para CONTACTED | RN-9 |
| T-17 | Envio lote WhatsApp para 3 interesses → cria 3 interações + muda status | RN-10, RN-12 |
| T-18 | Envio lote com mais de 5 → erro | RN-11 |
| T-19 | Excluir interação própria → sucesso | RN-14 |
| T-20 | Excluir interação de outro (sendo operator) → erro | RN-14 |
| T-21 | Excluir interesse (manager) com cascata de interações | RN-13 |
| T-22 | Criar cliente via AJAX retorna JSON | Fluxo 1 step 7 |
| T-23 | Digitar CEP válido no form → campos de endereço preenchidos automaticamente | RN-16 |
| T-24 | Digitar CEP inválido (00000-000) → mensagem "CEP não encontrado", form continua editável | RN-16 |

---

## 12. Performance e limites

- Listagem com 50.000 clientes: paginação server-side, < 500ms
- Índices: `(tenantId, cpf)`, `(tenantId, cnpj)`, `(tenantId, name)`, `(tenantId, phone)`, `(tenantId, deletedAt)`
- Busca textual: índices cobrem cenários principais. Para busca full-text em larga escala, considerar `pg_trgm` (já habilitado no Docker via extensão).

---

## 13. Anti-escopo (NÃO replicar)

| # | Feature removida | Justificativa | Origem |
|---|------------------|---------------|--------|
| 1 | Integração DirectD (consulta Receita Federal) | Decisão do dono | realidade#6 |
| 2 | ~~Auto-fill ViaCEP por CEP~~ | **REVERTIDO** — ViaCEP reincorporado por decisão revisada do dono (ver RN-16, seção 8) | — |
| 3 | Tipo de interação "nota" (E-mail, Presencial, Outro, Cancelamento, Finalização) | Reduzido para 3 tipos | realidade#9 |
| 4 | Comando `AtualizarClientesReceitaCommand` | Depende de DirectD | consequência de #1 |
| 5 | Campo `ativo` boolean | Substituído por soft delete `deletedAt` | mudança#2 |
| 6 | Botão "Consultar CPF" no form | Depende de DirectD | consequência de #1 |
| 7 | Botão "Consultar CNPJ" no form | Depende de DirectD | consequência de #1 |
| 8 | Rotas `/clientes/api/consultar-cpf` e `/clientes/api/consultar-cnpj` | Removidas | consequência de #1 |
| 9 | Interação automática de "Cancelamento"/"Finalização" ao mudar status | Simplificado: status muda diretamente | realidade#9, simplificação |

---

## 14. Dependências cruzadas

### Customer é referenciado por (OUTBOUND):
| Módulo | Relação | Campo |
|--------|---------|-------|
| ServiceOrder (OS) | FK | `customerId` |
| Sale (PDV) | FK | `customerId` |
| Invoice (Fiscal) | via ServiceOrder/Sale | indireto |
| RewardBalance | FK | `customerId` — stub |
| RewardAction | FK | `customerId` — stub |
| RewardMovement | FK | `customerId` — stub |

### Customer depende de (INBOUND):
| Módulo | Uso | Contrato |
|--------|-----|----------|
| Recompensas | Lê `cashbackBalance` | `RewardBalance.findByCustomerId(id)` — stub |
| Comunicação | Envio em lote WhatsApp | `CommunicationService.sendBatch(input)` — stub |
| Auth | `createdById` FK → User | Existente na stack |

---

## 15. Stubs / Contratos para módulos dependentes

```typescript
// Stub: módulo Recompensas (será especificado em SPEC separada)
interface RewardBalanceStub {
  customerId: string;
  availableBalance: number;  // centavos
  pendingBalance: number;    // centavos
  lifetimeCredit: number;    // centavos
}

// Stub: módulo Comunicação (será especificado em SPEC separada)
interface CommunicationBatchStub {
  sendBatch(input: {
    tenantId: string;
    recipients: { phone: string; variables: Record<string, string> }[];
    message: string;
  }): Promise<{ sent: number; errors: number }>;
}
```

Estes stubs viram contratos quando os módulos correspondentes forem especificados. A implementação de Clientes usará interfaces (não implementação concreta) para estes pontos de integração.
